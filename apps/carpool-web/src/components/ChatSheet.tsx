import { useEffect, useState } from 'react';
import { demoMessagesFor, demoPreview } from '../fixtures';
import { carPhotoSrc } from '../lib/carIcons';
import { formatDepart } from '../lib/format';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { ChatMessage } from '../types';

type Props = {
  open: boolean;
  tripId: string | null;
  onClose: () => void;
  onMinimize: () => void;
};

export function ChatSheet({ open, tripId, onClose, onMinimize }: Props) {
  const { demo, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = tripId ? demoPreview(tripId) : null;

  useEffect(() => {
    if (!open || !tripId) return;
    if (demo) {
      setMessages(demoMessagesFor(tripId));
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase
      .from('carpool_messages')
      .select('id, trip_id, sender_id, body, created_at')
      .eq('trip_id', tripId)
      .order('created_at')
      .then(({ data }) => {
        const uid = user?.id;
        setMessages(
          (data ?? []).map((row) => ({
            ...row,
            sender_name: row.sender_id === uid ? 'คุณ' : 'ผู้ร่วมทริป',
            mine: row.sender_id === uid,
          })),
        );
      });
    const channel = supabase
      .channel(`msgs:${tripId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'carpool_messages', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          const uid = user?.id;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [
                  ...prev,
                  {
                    ...row,
                    sender_name: row.sender_id === uid ? 'คุณ' : 'ผู้ร่วมทริป',
                    mine: row.sender_id === uid,
                  },
                ],
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [demo, open, tripId, user?.id]);

  if (!open) return null;

  const send = async () => {
    const text = body.trim();
    if (!text || !tripId) return;
    if (demo) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${prev.length}`,
          trip_id: tripId,
          sender_id: 'you',
          sender_name: 'คุณ',
          body: text,
          created_at: new Date().toISOString(),
          mine: true,
        },
      ]);
      setBody('');
      return;
    }
    const supabase = getSupabase();
    const uid = user?.id;
    if (!supabase || !uid) return;
    setBusy(true);
    const { error } = await supabase.from('carpool_messages').insert({
      trip_id: tripId,
      sender_id: uid,
      body: text,
    });
    setBusy(false);
    if (!error) setBody('');
  };

  return (
    <div className="chat-sheet" data-testid="chat-sheet" role="dialog" aria-label="แชทกับเพื่อนร่วมทาง">
      <div className="chat-sheet-head">
        <button className="nav-link tap-target" type="button" onClick={onClose}>
          ปิด
        </button>
        <div className="chat-sheet-title">
          {preview ? (
            <img
              src={carPhotoSrc(preview)}
              alt=""
              className="car-photo car-photo-sm"
              data-testid="chat-car"
            />
          ) : null}
          <span>แชทกับเพื่อนร่วมทาง</span>
          {preview ? (
            <span className="muted">
              {preview.pickup_label} → {preview.dest_label} · {formatDepart(preview.depart_at)}
            </span>
          ) : null}
        </div>
        <button className="nav-link tap-target" type="button" onClick={onMinimize}>
          ย่อ
        </button>
      </div>
      <div className="chat-sheet-body" data-testid="chat-messages">
        {messages.length === 0 ? (
          <p className="muted" data-testid="chat-empty">
            ยังไม่มีข้อความกับเพื่อนร่วมทาง
          </p>
        ) : (
          messages.map((m) => (
            <article
              key={m.id}
              className={`chat-msg ${m.mine ? 'mine' : 'theirs'}`}
              data-testid={`chat-msg-${m.id}`}
            >
              <p className="muted" style={{ margin: 0 }}>
                {m.sender_name} · {formatDepart(m.created_at)}
              </p>
              <p style={{ margin: '4px 0 0' }}>{m.body}</p>
            </article>
          ))
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="tap-target"
          placeholder="พิมพ์ข้อความถึงเพื่อนร่วมทาง…"
          aria-label="ข้อความถึงเพื่อนร่วมทาง"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
        />
        <button className="btn tap-target" type="submit" disabled={busy || !body.trim()}>
          ส่ง
        </button>
      </form>
    </div>
  );
}
