# Drop

Grab-style ride-hailing portfolio app by **Bell**. Phase 1 is scaffold only: three apps, shared tokens, env stubs for auth (task 2), and CI.

Free tiers only (Expo Go, Render free web service, Vercel hobby, Supabase free, Stripe test mode later).

## Monorepo

npm workspaces (`apps/*`, `packages/*`). Node **22+** (see `.nvmrc`). Install once from the repo root:

```bash
npm install
```

| Path | App | Stack |
|------|-----|--------|
| `apps/mobile` | Rider + Driver (one app, mode switch) | Expo SDK 58 + React Native + TypeScript |
| `apps/server` | API | Node + Express + TypeScript, Render-ready |
| `apps/admin` | Ops dashboard | Next.js + TypeScript, Vercel-ready |
| `packages/tokens` | Design tokens | Primary yellow `#FFEA33`, on-primary black `#141414` |

Themes (wired, not a full design system): rider light + dark (follows system), driver dark only, admin light only.

## Stack (later phases)

- Maps: **MapLibre** + **OpenStreetMap**
- Routing / fare distance: **OSRM**
- Driver location: **Supabase Realtime**
- Payments: **Stripe test mode** / cash (phase 5)

Auth, maps, matching, and payments are **not** built yet. Do not put real secrets in git.

## How to run

### Mobile (Expo Go on Android)

1. Install [Expo Go](https://expo.dev/go) from the Play Store (SDK 58).
2. From repo root: `npm start -w @drop/mobile` (or `cd apps/mobile && npx expo start`).
3. Scan the QR code in Expo Go, or press `a` if an emulator is attached.

Mode (Rider / Driver) is persisted locally with AsyncStorage. Placeholder screens only.

Android JS bundle (no native APK yet — that is phase 6):

```bash
npm run export:android -w @drop/mobile
```

### Server (Render-ready)

```bash
cp apps/server/.env.example apps/server/.env
npm run dev -w @drop/server
# http://localhost:3001/health → {"status":"ok"}
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
# http://localhost:3000
```

On Vercel: root directory = repo root, install `npm ci`, build `npm run build -w @drop/admin`. Framework: Next.js.

## Env vars

Copy `.env.example` (root or per app). Auth is task 2 — placeholders only.

| App | Variables |
|-----|-----------|
| Mobile | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Server | `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Admin | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Never commit `.env` files or live keys. Do not create a Supabase project until task 2.

## Scripts

From repo root:

```bash
npm run lint
npm run typecheck
npm test
```

## Roadmap

1. **Scaffold + auth** — this repo layout, then Supabase auth
2. **Map + ride request + fare estimate**
3. **Driver online / accept + nearest-driver matching**
4. **Live tracking + trip status + in-trip chat**
5. **Complete / pay / rate / history**
6. **Admin + APK build + QA**
