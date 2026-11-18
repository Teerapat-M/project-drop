# เพื่อนร่วมทาง (`@drop/carpool-web`)

Phase C2 web app. React + Vite + TypeScript. Thai UI. Shares Drop’s Supabase project (`drop`) and `auth.users` / `public.profiles`.

## Env (names only)

Copy `.env.example` → `.env`. Never commit live keys.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_MAPS_API_KEY` (optional; without it the create/join forms use text addresses + a placeholder map + a manual km field)

Same values as Drop mobile/admin, Expo-free names. Never commit a real Maps key.

## Google Maps (Bell)

The app lazy-loads Maps JS only when a place picker or route mini-map needs it. Without `VITE_GOOGLE_MAPS_API_KEY` (or with the placeholder), there are no Maps errors: type addresses by hand and enter km yourself. Fare still uses `@drop/carpool-core` `computeFare` (7฿/km). Luggage never affects the fare.

Bell must create the key himself:

1. Google Cloud Console → create (or reuse) a project → **APIs & Services → Credentials → Create credentials → API key**.
2. **Application restriction:** HTTP referrers. Add `http://localhost:5173/*` and, after Vercel, `https://<your-vercel-app>/*`.
3. **Enable** Maps JavaScript API, Places API (New), and Routes API. Restrict the key to those three APIs only.
4. Set a **daily quota cap** on each of those APIs and a **billing budget alert**.
5. Put the key in `apps/carpool-web/.env` as `VITE_GOOGLE_MAPS_API_KEY` (local) and the same name in the Vercel project env. Rebuild after changing it (`VITE_*` is baked in at build time).

Do not commit the live value. The web app never sends the key to our server; it is a browser key, so referrer + API + quota restrictions are the real safety net.

Create-trip จุดแวะ are stored on `carpool_trip_stops` (seq order after `orderDropoffs`), not as jsonb on `carpool_trips`. Join mini-map and drop-off rebuild origin → saved stops → destination. If Routes `computeRoutes` is blocked in the browser, the provider falls back to the Maps JS Directions service. Markers use `google.maps.Marker` (no Cloud mapId). OpenStreetMap later: implement `MapProvider` and swap it in `createMapProvider`.

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
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_GOOGLE_MAPS_API_KEY`
- Auth → URL configuration: add the Vercel origin to Redirect URLs

Do **not** apply the SQL to the live `drop` project from CI. Bell runs `supabase/migrations/20261118100000_carpool.sql`, then `20261118120000_carpool_trip_stops.sql`, then `20261118130000_carpool_taxi_trunk.sql` in the SQL editor after the existing Drop migrations. CI applies them only to an ephemeral Postgres (`supabase/tests/run-carpool-rls.sh`).

## Supabase dashboard (Bell)

No new Exposed schema: tables are `carpool_*` in `public`.

After applying the migrations, confirm **Database → Publications → `supabase_realtime`** includes `carpool_seats` and `carpool_messages`, and still **excludes** `ride_pins` and `carpool_trip_stops`.
