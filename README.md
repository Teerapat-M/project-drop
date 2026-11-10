# Drop

Grab-style ride-hailing portfolio app by **Bell**. Phase 2: **map + ride request + driver accept + Trip PIN**.

Free tiers only (Expo **dev build** — not Expo Go, Render free web service, Vercel hobby, Supabase free, Stripe test mode later). Map tiles, geocoding, and routing use free OSM-compatible services with **no paid keys**.

## Monorepo

npm workspaces (`apps/*`, `packages/*`). Node **22+** (see `.nvmrc`). Install once from the repo root:

```bash
npm install
```

| Path | App | Stack |
|------|-----|--------|
| `apps/mobile` | Rider + Driver (one app, role from `profiles.role`) | Expo SDK 58 + React Native + TypeScript + MapLibre |
| `apps/server` | API | Node + Express + TypeScript, Render-ready |
| `apps/admin` | Ops dashboard | Next.js + TypeScript, Vercel-ready |
| `packages/tokens` | Design tokens | Primary yellow `#FFEA33`, on-primary black `#141414` |
| `packages/types` | Shared API contracts | `Role`, `Profile`, `Ride`, `RideStatus`, `VehicleType`, `DriverLocation`, `estimateFare` stub |

Themes: rider light + dark (follows system), driver dark only, admin light only. Portrait first; landscape / full-screen nav is a later task.

**TypeScript** is **~6.0.3** in every workspace. Expo SDK 58 recommends 6.0.3 (`expo install --fix`); Next.js 16.4 supports TypeScript 6. Root `tsconfig.json` project-references `packages/tokens` and `packages/types` (composite, declaration emit).

## Auth

Unauthenticated mobile users see the auth stack (M02 login, M03 sign up, forgot password, optional phone OTP). A signed-in user with `profiles.role` null sees M04 role select (writes `rider` or `driver` only). Then the app routes to rider or driver mode.

Admin (`apps/admin`): A01-style login. Next.js 16 `proxy.ts` refreshes the Supabase session; the dashboard server-checks `role === admin`. Everyone else sees `/not-authorized`.

Express verifies the Supabase JWT (JWKS at `SUPABASE_URL/auth/v1/.well-known/jwks.json` via `jose`, HS256 fallback if `SUPABASE_JWT_SECRET` is set) and serves `GET /me` `{ id, role, trip_pin_enabled }` by reading `profiles` with the **user JWT + anon key** (no service role required). Both paths require issuer `${SUPABASE_URL}/auth/v1` (trailing slash stripped) and audience `authenticated`. JWKS allows `ES256`/`RS256`; the secret path is `HS256` only.

Admin stays gated when Supabase env vars are missing (redirect to `/login`); it never fail-opens the dashboard.

`profiles.trip_pin_enabled` is `false` by default. Users can read their own value; only `role = admin` may change it (trigger + `private.is_admin()`).

### Supabase dashboard (Bell)

1. Create a free project. Copy the project URL and **anon** key into the env files below. Do not commit real values.
2. Run the SQL files in `supabase/migrations/` in order (or `supabase db push`). Do **not** apply them from CI.
   - `20261110120000_profiles.sql` — profiles + admin guard (already applied live).
   - `20261110180000_rides.sql` — `ride_status` / `vehicle_type` enums, `rides`, `ride_pins`, `driver_locations`, RLS, `verify_trip_pin`, Realtime publication. **New in this phase — apply in the SQL editor. Do not apply from this repo’s CI, and do not apply anything to a live DB from an agent.**
3. **Authentication → Providers → Email**: enable email + password. Decide **Confirm email** (if on, sign-up returns no session until the user clicks the mail).
4. **Authentication → URL configuration**:
   - Site URL: admin origin (local `http://localhost:3000`, then the Vercel URL).
   - Redirect URLs: `http://localhost:3000/**`, `https://<admin-domain>/**`, `drop://auth/callback`.
5. **Phone OTP** (optional): add an SMS provider under Auth providers. Then set `EXPO_PUBLIC_ENABLE_PHONE_OTP=true` in `apps/mobile/.env`. Default is **false** because SMS is not free-tier by default.
6. **Realtime**: the rides migration adds `rides`, `ride_pins`, and `driver_locations` to the `supabase_realtime` publication. In the dashboard, confirm Database → Publications → `supabase_realtime` includes those tables. The rider subscribes to their ride (finding → driver assigned); the driver subscribes to `status=requested` inserts. Nearby filtering is **not** in RLS — drivers can `SELECT` all requested rides; the app sorts nearest-first with haversine (a later RPC can filter by distance).
7. Promote a staff user to admin in SQL (users cannot self-assign admin):

```sql
update public.profiles set role = 'admin' where id = '<auth user uuid>';
```

   Admins can enable trip PIN for a rider with `update public.profiles set trip_pin_enabled = true where id = '<rider uuid>';` (non-admins cannot).

`SUPABASE_SERVICE_ROLE_KEY` is optional. Bell can set it on Render; this repo’s API does not need it for `/me` or Trip PIN (`verify_trip_pin` is a security-definer RPC the assigned driver calls with their user JWT).

## Map, search, fare, rides

The map uses **MapLibre Native** (`@maplibre/maplibre-react-native` + its Expo config plugin). That is **not** in Expo Go — use a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

Tiles: configurable `EXPO_PUBLIC_MAP_STYLE_URL`. Default [OpenFreeMap](https://openfreemap.org) liberty (dark boards use OpenFreeMap dark when the env is unset). Alternative: `https://demotiles.maplibre.org/style.json`. **Attribution:** © OpenStreetMap contributors · OpenFreeMap.

Geocoding: Photon (`https://photon.komoot.io/api`) or Nominatim via `EXPO_PUBLIC_GEOCODER_URL`. Requests send a Drop `User-Agent` / `Referer`, debounce **500ms+**, require **3+** characters, and abort in-flight searches (no autocomplete hammering). Long-press / drag a pin and reverse-geocode.

Routing: OSRM via `EXPO_PUBLIC_OSRM_URL` (default `https://router.project-osrm.org` demo). The map draws the polyline and shows distance / duration.

**Fare: no formula.** `estimateFare(distanceM, durationS, vehicleType)` in `packages/types` always returns `null` (`TODO(fare-formula)`). The UI shows **ราคาประมาณ —**. `fare_estimate` is stored as `null`.

Ride API (JWT middleware, same as `/me`):

| Method | Path | Who |
|--------|------|-----|
| `POST` | `/rides` | rider creates pickup/dropoff + `vehicle_type` `car`\|`bike` |
| `GET` | `/rides`, `/rides/:id` | rider own; driver assigned + requested; admin all |
| `POST` | `/rides/:id/accept` | first-accept-wins (`status=requested` and `driver_id is null`) |
| `POST` | `/rides/:id/decline` | driver dismisses a still-requested ride |
| `POST` | `/rides/:id/arrive` | assigned driver |
| `POST` | `/rides/:id/start` | PIN via `verify_trip_pin` when required, else confirm |
| `POST` | `/rides/:id/cancel` | rider or assigned driver |
| `PUT` | `/driver-location` | driver upserts their `driver_locations` row |

Trip PIN lives in **`ride_pins`**, not on `rides`. The rider (and admin) can `SELECT` it; the driver cannot. On accept, if `profiles.trip_pin_enabled` is true, a crypto-random 4-digit PIN is generated in `rides_guard` and shown only on the rider’s R05 card. The driver enters it (DN03); the server compares through HMAC (attempt limit 5). Otherwise the driver confirms (DN03b). Status transitions are enforced in the trigger and in Express.

## How to run

### Mobile (dev build — not Expo Go)

MapLibre needs custom native code. From `apps/mobile` after `cp apps/mobile/.env.example apps/mobile/.env`:

```bash
# Local native build (Android SDK / emulator or USB device)
npx expo run:android

# Or an EAS development build (profile in apps/mobile/eas.json)
npx eas-cli build --profile development --platform android
```

Then start Metro: `npm start -w @drop/mobile` (or `cd apps/mobile && npx expo start --dev-client`).

Android emulator talking to the API on the host: set `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`.

Android JS bundle (no native APK — that is still a later phase):

```bash
npm run export:android -w @drop/mobile
```

### Server (Render-ready)

```bash
cp apps/server/.env.example apps/server/.env
npm run dev -w @drop/server
# http://localhost:3001/health → {"status":"ok"}
# GET /me and /rides* require Authorization: Bearer <supabase access token>
```

Production on Render: this repo’s `render.yaml` (free plan). The process binds `0.0.0.0:$PORT`. Free web services spin down after idle.

```bash
npm run build -w @drop/server
npm run start -w @drop/server
```

### Admin (Vercel-ready)

```bash
cp apps/admin/.env.example apps/admin/.env.local
npm run dev -w @drop/admin
# http://localhost:3000/login
```

On Vercel, either:

- **Repo root** as the project root: install `npm ci`, build `npm run build -w @drop/admin`, framework Next.js.
- **`apps/admin` as the root**: optional `apps/admin/vercel.json` runs `npm ci` / `npm run build -w @drop/admin` from the monorepo root.

## Env vars

Copy `.env.example` (root or per app). Never commit `.env` files or live keys. Do not point these placeholders at a live project in git.

| App | Variables |
|-----|-----------|
| Mobile | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_ENABLE_PHONE_OTP` (default false), `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_MAP_STYLE_URL`, `EXPO_PUBLIC_GEOCODER_URL`, `EXPO_PUBLIC_OSRM_URL` |
| Server | `PORT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `SUPABASE_JWT_SECRET`, optional `SUPABASE_SERVICE_ROLE_KEY` |
| Admin | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

## Scripts

From repo root:

```bash
npm run lint
npm run typecheck
npm test
```

## Roadmap

1. **Scaffold + auth** — done
2. **Map + ride request + fare estimate stub + driver accept + Trip PIN** — this repo
3. **Live tracking polish + in-trip chat**
4. **Complete / pay / rate / history**
5. **Admin + APK build + QA**
