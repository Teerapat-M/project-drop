# Drop

Grab-style ride-hailing portfolio app by **Bell**. Phase 1: scaffold + **Supabase auth**.

Free tiers only (Expo Go, Render free web service, Vercel hobby, Supabase free, Stripe test mode later).

## Monorepo

npm workspaces (`apps/*`, `packages/*`). Node **22+** (see `.nvmrc`). Install once from the repo root:

```bash
npm install
```

| Path | App | Stack |
|------|-----|--------|
| `apps/mobile` | Rider + Driver (one app, role from `profiles.role`) | Expo SDK 58 + React Native + TypeScript |
| `apps/server` | API | Node + Express + TypeScript, Render-ready |
| `apps/admin` | Ops dashboard | Next.js + TypeScript, Vercel-ready |
| `packages/tokens` | Design tokens | Primary yellow `#FFEA33`, on-primary black `#141414` |
| `packages/types` | Shared API contracts | `Role`, `Profile`, `MeResponse` (`GET /me`) |

Themes: rider light + dark (follows system), driver dark only, admin light only.

**TypeScript** is **~6.0.3** in every workspace. Expo SDK 58 recommends 6.0.3 (`expo install --fix`); Next.js 16.4 supports TypeScript 6. Root `tsconfig.json` project-references `packages/tokens` and `packages/types` (composite, declaration emit).

## Auth

Unauthenticated mobile users see the auth stack (M02 login, M03 sign up, forgot password, optional phone OTP). A signed-in user with `profiles.role` null sees M04 role select (writes `rider` or `driver` only). Then the app routes to rider or driver mode.

Admin (`apps/admin`): A01-style login. Next.js 16 `proxy.ts` refreshes the Supabase session; the dashboard server-checks `role === admin`. Everyone else sees `/not-authorized`.

Express verifies the Supabase JWT (JWKS at `SUPABASE_URL/auth/v1/.well-known/jwks.json` via `jose`, HS256 fallback if `SUPABASE_JWT_SECRET` is set) and serves `GET /me` `{ id, role, trip_pin_enabled }` by reading `profiles` with the **user JWT + anon key** (no service role required). Both paths require issuer `${SUPABASE_URL}/auth/v1` (trailing slash stripped) and audience `authenticated`. JWKS allows `ES256`/`RS256`; the secret path is `HS256` only.

Admin stays gated when Supabase env vars are missing (redirect to `/login`); it never fail-opens the dashboard.

`profiles.trip_pin_enabled` is `false` by default. Users can read their own value; only `role = admin` may change it (trigger + `private.is_admin()`). Later, the trip flow generates a 4-digit PIN per trip only when the rider has this flag on; the driver must enter it to start. Otherwise the driver just confirms. No trip logic in this PR.

### Supabase dashboard (Bell)

1. Create a free project. Copy the project URL and **anon** key into the env files below. Do not commit real values.
2. Run `supabase/migrations/20261110120000_profiles.sql` in the SQL editor (or `supabase db push`). Do not apply it from CI.
3. **Authentication → Providers → Email**: enable email + password. Decide **Confirm email** (if on, sign-up returns no session until the user clicks the mail).
4. **Authentication → URL configuration**:
   - Site URL: admin origin (local `http://localhost:3000`, then the Vercel URL).
   - Redirect URLs: `http://localhost:3000/**`, `https://<admin-domain>/**`, `drop://auth/callback`.
5. **Phone OTP** (optional): add an SMS provider under Auth providers. Then set `EXPO_PUBLIC_ENABLE_PHONE_OTP=true` in `apps/mobile/.env`. Default is **false** because SMS is not free-tier by default.
6. Promote a staff user to admin in SQL (users cannot self-assign admin):

```sql
update public.profiles set role = 'admin' where id = '<auth user uuid>';
```

   Admins can later enable trip PIN for a rider with `update public.profiles set trip_pin_enabled = true where id = '<rider uuid>';` (non-admins cannot).

`SUPABASE_SERVICE_ROLE_KEY` is optional. Bell can set it on Render; this repo’s API does not use it for `/me`.

## How to run

### Mobile (Expo Go on Android)

1. Install [Expo Go](https://expo.dev/go) from the Play Store (SDK 58).
2. `cp apps/mobile/.env.example apps/mobile/.env` and fill in the anon URL/key.
3. From repo root: `npm start -w @drop/mobile` (or `cd apps/mobile && npx expo start`).
4. Scan the QR code in Expo Go, or press `a` if an emulator is attached.

Android JS bundle (no native APK yet — that is phase 6):

```bash
npm run export:android -w @drop/mobile
```

### Server (Render-ready)

```bash
cp apps/server/.env.example apps/server/.env
npm run dev -w @drop/server
# http://localhost:3001/health → {"status":"ok"}
# GET /me requires Authorization: Bearer <supabase access token>
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
| Mobile | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_ENABLE_PHONE_OTP` (default false) |
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

1. **Scaffold + auth** — this repo
2. **Map + ride request + fare estimate**
3. **Driver online / accept + nearest-driver matching**
4. **Live tracking + trip status + in-trip chat**
5. **Complete / pay / rate / history**
6. **Admin + APK build + QA**
