import { describe, expect, it } from '@jest/globals';
import { CHAT_PRESETS } from '@drop/types';
import { createTokenBucket } from './rateLimit';
import { createGeminiProvider, createMyMemoryProvider, type TranslationProvider } from './providers';
import { createTranslator } from './translate';

function fakeProvider(
  impl: TranslationProvider['translate'],
): TranslationProvider {
  return { name: 'fake', translate: impl };
}

describe('translation fallback', () => {
  it('delivers original when the provider errors', async () => {
    const translate = createTranslator({
      provider: fakeProvider(async () => ({ error: 'provider' })),
      bucket: createTokenBucket({ capacity: 8, refillPerMs: 1 }),
    });
    const out = await translate({
      userId: 'u1',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'th',
    });
    expect(out.original).toBe('Hello');
    expect(out.translated).toBeNull();
    expect(out.usedProvider).toBe(true);
  });

  it('delivers original on timeout', async () => {
    const translate = createTranslator({
      timeoutMs: 20,
      provider: fakeProvider(
        async ({ signal }) =>
          new Promise((resolve) => {
            const t = setTimeout(() => resolve({ text: 'late' }), 200);
            signal?.addEventListener('abort', () => {
              clearTimeout(t);
              resolve({ error: 'timeout' });
            });
          }),
      ),
      bucket: createTokenBucket({ capacity: 8, refillPerMs: 1 }),
    });
    const out = await translate({
      userId: 'u1',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'th',
    });
    expect(out.translated).toBeNull();
    expect(out.original).toBe('Hello');
  });

  it('delivers original when the provider reports quota', async () => {
    const translate = createTranslator({
      provider: fakeProvider(async () => ({ error: 'quota' })),
      bucket: createTokenBucket({ capacity: 8, refillPerMs: 1 }),
    });
    const out = await translate({
      userId: 'u1',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'ja',
    });
    expect(out.translated).toBeNull();
  });

  it('delivers original when the per-user rate limit is exhausted', async () => {
    const bucket = createTokenBucket({ capacity: 1, refillPerMs: 0 });
    const calls: string[] = [];
    const translate = createTranslator({
      bucket,
      provider: fakeProvider(async ({ text }) => {
        calls.push(text);
        return { text: 'สวัสดี' };
      }),
    });
    const first = await translate({
      userId: 'u1',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'th',
    });
    const second = await translate({
      userId: 'u1',
      text: 'Bye',
      sourceLang: 'en',
      targetLang: 'th',
    });
    expect(first.translated).toBe('สวัสดี');
    expect(second.translated).toBeNull();
    expect(second.original).toBe('Bye');
    expect(calls).toEqual(['Hello']);
  });

  it('does not spend quota on preset translations', async () => {
    let calls = 0;
    const translate = createTranslator({
      provider: fakeProvider(async () => {
        calls += 1;
        return { error: 'quota' };
      }),
      bucket: createTokenBucket({ capacity: 0, refillPerMs: 0 }),
    });
    const out = await translate({
      userId: 'u1',
      text: CHAT_PRESETS.on_my_way.en,
      sourceLang: 'en',
      targetLang: 'th',
      presetKey: 'on_my_way',
    });
    expect(calls).toBe(0);
    expect(out.usedProvider).toBe(false);
    expect(out.original).toBe(CHAT_PRESETS.on_my_way.en);
    expect(out.translated).toBe(CHAT_PRESETS.on_my_way.th);
  });
});

describe('gemini / mymemory adapters', () => {
  it('maps HTTP 429 to quota without throwing', async () => {
    const gemini = createGeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-3.5-flash-lite',
      fetch: (async () => new Response('nope', { status: 429 })) as typeof fetch,
    });
    const mm = createMyMemoryProvider({
      fetch: (async () => new Response('nope', { status: 429 })) as typeof fetch,
    });
    expect(await gemini.translate({ text: 'Hi', source: 'en', target: 'th' })).toEqual({
      error: 'quota',
    });
    expect(await mm.translate({ text: 'Hi', source: 'en', target: 'th' })).toEqual({
      error: 'quota',
    });
  });
});
