# เพื่อนร่วมทาง (`@drop/carpool-web`)

Phase C2 web app. React + Vite + TypeScript. Thai UI. Shares Drop’s Supabase project (`drop`) and `auth.users` / `public.profiles`.

## Env (names only)

Copy `.env.example` → `.env`. Never commit live keys.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Same values as Drop mobile/admin, Expo-free names.

## Scripts

```bash
npm run dev -w @drop/carpool-web      # http://localhost:5173
npm run lint -w @drop/carpool-web
npm run typecheck -w @drop/carpool-web
npm test -w @drop/carpool-web
npm run build -w @drop/carpool-web
```

Without env, the app runs in **demo mode** (fixtures; no live DB).

## Deploy note (do not deploy from this PR)

Static Vite app on **Vercel**:

- Root: `apps/carpool-web` (see `vercel.json`) or monorepo root with `npm ci` / `npm run build -w @drop/carpool-web`
- Output: `dist`
- SPA rewrite: `/(.*) → /index.html`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Auth → URL configuration: add the Vercel origin to Redirect URLs

Do **not** apply the SQL to the live `drop` project from CI. Bell runs `supabase/migrations/20261118100000_carpool.sql` in the SQL editor after the existing Drop migrations. CI applies it only to an ephemeral Postgres (`supabase/tests/run-carpool-rls.sh`).

## Supabase dashboard (Bell)

No new Exposed schema: tables are `carpool_*` in `public`.

After applying the migration, confirm **Database → Publications → `supabase_realtime`** includes `carpool_seats` and `carpool_messages`, and still **excludes** `ride_pins`.
