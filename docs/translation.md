# In-trip chat translation

Server-side only. The mobile app never sees a translation API key.

## Provider

**Default: Gemini API free tier** when `GEMINI_API_KEY` is set, else **MyMemory** (no key). Override with `TRANSLATION_PROVIDER=gemini|mymemory|none`.

The adapter is pluggable (`apps/server/src/chat/providers.ts`). Failures (HTTP error, timeout, quota, per-user rate limit) **never block the message**: `translated_text` is stored as null and the original is delivered.

Quick-reply presets (`CHAT_PRESETS` in `packages/types`) are translated in code (en/th/zh/ja) and **do not call the provider**.

### Gemini API (preferred, no credit card)

- Key: create at [Google AI Studio API keys](https://aistudio.google.com/apikey). New users get a free-tier project **without linking a billing account**.
- Pricing (free input/output tokens on selected Flash models): [Gemini Developer API pricing](https://aistudio.google.com/docs/pricing)
- Rate limits: [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — RPM, input TPM, and RPD **per Google Cloud project** (not per key). RPD resets at **midnight Pacific**. Google no longer publishes a fixed public RPM/RPD table; check the project’s live limits in AI Studio. Specified limits are not guaranteed.
- Default model: `gemini-3.5-flash-lite` (listed as **Free of charge** on the free tier; described as optimized for translation). Override with `GEMINI_MODEL`.
- Free-tier content may be used to improve Google products (see the pricing page).
- Env: `GEMINI_API_KEY` (Render server only). Never log or put this in the Expo app.

### MyMemory fallback (no key, no credit card)

Used when `TRANSLATION_PROVIDER=mymemory` or when no Gemini key is set.

- Spec: [API technical specifications](https://mymemory.translated.net/doc/spec.php) — `GET https://api.mymemory.translated.net/get`, `q` max **500 bytes**.
- Usage limits: [Usage Limits](https://mymemory.translated.net/doc/usagelimits.php) — usage is tracked **in words**. Providing a valid email as the `de` parameter grants **50,000 chars/day**. Set `MYMEMORY_EMAIL` on the server for that quota. A key is not required for public-memory search ([key generator](https://mymemory.translated.net/doc/keygen.php)).
- Quota-exhausted responses deliver the original untranslated.

## App rate limit

In-memory token bucket per user id: **burst 8**, refill **20 translations / 10 minutes**. Over the limit, original is delivered. Ceiling: one Render free instance (see `apps/server/src/chat/rateLimit.ts`).

## Timeouts

`TRANSLATION_TIMEOUT_MS` (default **2500**). Abort → original delivered.

## Language

`profiles.preferred_language` (BCP-47, user-editable on their own row). Null falls back to the device locale (`en` / `th` / `zh` / `ja`).
