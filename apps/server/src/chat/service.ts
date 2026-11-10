import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  canInsertMessage,
  canSelectMessage,
  isChatPresetKey,
  normalizeLang,
  presetText,
  type Ride,
  type RideMessage,
  type RidePeer,
  type Role,
} from '@drop/types';
import { getSupabaseConfig } from '../config';
import { RideError } from '../rides/errors';
import { createTranslator, type Translator } from './translate';

export type ChatActor = { id: string; role: Role | null; token: string };

export type SendMessageInput = {
  text?: string;
  preset_key?: string;
  source_lang?: string | null;
};

export type ChatService = {
  send(actor: ChatActor, rideId: string, input: SendMessageInput): Promise<RideMessage>;
  list(actor: ChatActor, rideId: string): Promise<RideMessage[]>;
};

type RideLookup = {
  get(actor: ChatActor, id: string): Promise<Ride>;
  peer(actor: ChatActor, ride: Ride): Promise<RidePeer | null>;
};

type MemoryState = {
  messages: RideMessage[];
  seq: number;
};

function userClient(token: string): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) throw new RideError('invalid', 'supabase is not configured');
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function serviceClient(): SupabaseClient | null {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function resolveBody(input: SendMessageInput, sourceLang: ReturnType<typeof normalizeLang>): string {
  if (input.preset_key && isChatPresetKey(input.preset_key)) {
    return presetText(input.preset_key, sourceLang);
  }
  const text = input.text?.trim() ?? '';
  if (!text) throw new RideError('invalid', 'text required');
  return text.slice(0, 1000);
}

export function createMemoryChatService(
  lookup: RideLookup,
  translate: Translator = createTranslator({ provider: { name: 'none', translate: async () => ({ error: 'provider' }) } }),
): ChatService & { state: MemoryState } {
  const state: MemoryState = { messages: [], seq: 0 };
  return {
    state,
    async send(actor, rideId, input) {
      const ride = await lookup.get(actor, rideId);
      const sourceLang = normalizeLang(input.source_lang);
      const original = resolveBody(input, sourceLang);
      if (!canInsertMessage(actor, ride, actor.id)) {
        throw new RideError('forbidden', 'cannot send');
      }
      const peer = await lookup.peer(actor, ride);
      const outcome = await translate({
        userId: actor.id,
        text: original,
        sourceLang,
        targetLang: peer?.preferred_language ?? sourceLang,
        presetKey: input.preset_key,
      });
      state.seq += 1;
      const row: RideMessage = {
        id: `msg-${state.seq}`,
        ride_id: rideId,
        sender_id: actor.id,
        original_text: outcome.original,
        translated_text: outcome.translated,
        source_lang: outcome.sourceLang,
        target_lang: outcome.targetLang,
        is_preset: !!(input.preset_key && isChatPresetKey(input.preset_key)),
        preset_key: input.preset_key && isChatPresetKey(input.preset_key) ? input.preset_key : null,
        created_at: new Date().toISOString(),
      };
      state.messages.push(row);
      return row;
    },
    async list(actor, rideId) {
      const ride = await lookup.get(actor, rideId);
      if (!canSelectMessage(actor, ride)) throw new RideError('not_found', 'ride not found');
      return state.messages.filter((m) => m.ride_id === rideId);
    },
  };
}

function asMessage(row: RideMessage): RideMessage {
  return {
    ...row,
    translated_text: row.translated_text ?? null,
    source_lang: row.source_lang ?? null,
    target_lang: row.target_lang ?? null,
    is_preset: row.is_preset === true,
    preset_key: row.preset_key ?? null,
  };
}

export function createSupabaseChatService(
  translate: Translator = createTranslator(),
): ChatService {
  return {
    async send(actor, rideId, input) {
      const supabase = userClient(actor.token);
      const { data, error } = await supabase.from('rides').select('*').eq('id', rideId).maybeSingle();
      if (error) throw new RideError('invalid', error.message);
      if (!data) throw new RideError('not_found', 'ride not found');
      const ride = data as Ride;
      if (!canInsertMessage(actor, ride, actor.id)) {
        throw new RideError('forbidden', 'cannot send');
      }
      const sourceLang = normalizeLang(input.source_lang);
      const original = resolveBody(input, sourceLang);
      const { data: peer } = await supabase.rpc('ride_peer', { p_ride_id: rideId });
      const peerLang =
        peer && typeof peer === 'object'
          ? (peer as { preferred_language?: string | null }).preferred_language
          : null;
      const outcome = await translate({
        userId: actor.id,
        text: original,
        sourceLang,
        targetLang: peerLang ?? sourceLang,
        presetKey: input.preset_key,
      });
      const row = {
        ride_id: rideId,
        sender_id: actor.id,
        original_text: outcome.original,
        translated_text: outcome.translated,
        source_lang: outcome.sourceLang,
        target_lang: outcome.targetLang,
        is_preset: !!(input.preset_key && isChatPresetKey(input.preset_key)),
        preset_key: input.preset_key && isChatPresetKey(input.preset_key) ? input.preset_key : null,
      };
      const writer = serviceClient() ?? supabase;
      const inserted = await writer.from('messages').insert(row).select().single();
      if (inserted.error || !inserted.data) {
        throw new RideError('invalid', inserted.error?.message ?? 'send failed');
      }
      return asMessage(inserted.data as RideMessage);
    },
    async list(actor, rideId) {
      const supabase = userClient(actor.token);
      const { data: ride, error: rideErr } = await supabase
        .from('rides')
        .select('*')
        .eq('id', rideId)
        .maybeSingle();
      if (rideErr) throw new RideError('invalid', rideErr.message);
      if (!ride) throw new RideError('not_found', 'ride not found');
      if (!canSelectMessage(actor, ride as Ride)) throw new RideError('not_found', 'ride not found');
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('ride_id', rideId)
        .order('created_at', { ascending: true });
      if (error) throw new RideError('invalid', error.message);
      return ((data ?? []) as RideMessage[]).map(asMessage);
    },
  };
}
