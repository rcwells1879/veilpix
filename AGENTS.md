# AGENTS.md

Guidance for future Codex agents working in this repository.

## Project Snapshot

VeilPix is a React 19 + TypeScript + Vite image editing app with a Node/Express API in `veilpix-api/`. The frontend talks only to the backend API; AI provider keys, Supabase service role access, usage tracking, and Stripe flows stay server-side.

Core stack:
- Frontend: React 19, Vite, Tailwind CSS v4, Clerk, TanStack Query.
- Backend: Express, Clerk middleware, Supabase service-role client, Stripe, Kie.ai provider routes.
- Storage/database: Supabase tables for users, usage, credit purchases, billing records, and temporary image storage.
- Billing/credits: new users get 30 credits; authenticated generation requests deduct credits. Credit purchases are handled through Stripe checkout/webhooks.

## Commands

Frontend, from repo root:

```bash
npm install
npm run dev
npm run build
npm run preview
npm audit
```

Backend, from `veilpix-api/`:

```bash
npm install
npm run dev
npm start
npm audit
node --check server.js
```

Backend pricing tests use Node's built-in test runner through `npm test`.

## Local Environment

Frontend `.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=...
VITE_API_BASE_URL=http://127.0.0.1:3001
VITE_NODE_ENV=development
```

Backend `veilpix-api/.env`:

```env
NODE_ENV=development
PORT=3001
SEEDREAM_API_KEY=...
SEEDREAM_API_BASE_URL=https://api.kie.ai
CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
FRONTEND_URL=http://127.0.0.1:5173
```

In WSL or mixed Windows networking, prefer `127.0.0.1` over `localhost` for frontend-to-backend calls. The API listens on `0.0.0.0:3001` and CORS includes both localhost and 127.0.0.1 dev origins.

## Important Files

- `App.tsx`: main app state, editing modes, image history, provider selection, text-to-image/video entry points.
- `components/SettingsMenu.tsx`: provider, resolution, and After Dark settings. Settings persist in localStorage key `veilpix-settings`.
- `src/services/apiClient.ts`: fetch wrapper; injects Clerk bearer token for authenticated requests and `X-Session-ID`.
- `src/hooks/useImageGeneration.ts`: TanStack Query hooks for all image/video providers.
- `veilpix-api/server.js`: middleware, CORS, rate limits, route registration, health endpoint.
- `veilpix-api/utils/database.js`: lazy Supabase service-role client and DB helpers.
- `veilpix-api/utils/imageUpload.js`: temporary Supabase Storage uploads for Kie.ai URL-based providers.
- `veilpix-api/routes/*.js`: API routes for auth, usage, checkout, Stripe/webhooks, image providers, and video.
- `vite.config.ts`: base path `/veilpix/`, static HTML dev serving, Tailwind plugin, build chunks.
- `public/sitemap.xml`: update when public pages/routes/blog entries change.

## Providers And Routes

All AI providers use Kie.ai through the backend and temporary Supabase Storage URLs where image input is required.

Image providers:
- `nanobanana2`: Nano Banana 2 / Gemini 3.1 Flash, 2 credits, routes under `/api/nanobanana2`.
- `seedream`: Seedream 5 Lite/Pro, 1-2 credits depending on tier/resolution, routes under `/api/seedream`.
- `nanobananapro`: Nano Banana Pro / Gemini 3 Pro, 2 credits, routes under `/api/nanobananapro`.
- `wanimage`: Wan 2.7 Image, 1 credit, routes under `/api/wanimage`.

Video provider:
- `wan`: Wan video routes under `/api/wan`; credit cost varies by duration/resolution in `routes/wan.js`.

Common image endpoints:
- `POST /generate-edit`
- `POST /generate-filter`
- `POST /generate-adjust`
- `POST /combine-photos`

Extra endpoints:
- `POST /api/wanimage/generate-text-to-image`
- `POST /api/wan/generate-video`
- `POST /api/wan/generate-text-to-video`
- `GET /api/wan/pricing`

Provider implementation notes:
- SeeDream uses `image_urls`; Wan Image uses `input_urls`.
- Kie.ai jobs use create-task then poll record-info.
- Frontend calls all provider hooks unconditionally, then chooses the active mutation by `settings.apiProvider` to obey React hook rules.
- After Dark/content filter behavior is enforced in UI and provider payloads. Non-purchasers cannot disable the filter; purchasing credits acts as age verification in the UI.

## Supabase And Database

- Backend uses `SUPABASE_SERVICE_ROLE_KEY`; service role bypasses RLS.
- `utils/database.js` exports `{ db, supabase }`, where `supabase` is a function. When importing it, call `supabase()` before `.from(...)`.
- `routes/webhooks.js` currently creates its own service-role Supabase client for Stripe webhook updates.
- Credit purchase writes happen server-side in `db.logCreditPurchase()` and Stripe webhook handlers.
- Image balances support hundredth-credit precision through `schema-migration-fractional-credits.sql` and the atomic `deduct_user_credits` RPC. Credit purchases remain whole-number packages.
- Keep RLS enabled on exposed public tables such as `credit_purchases`; backend service-role operations should continue to work.
- Supabase CLI is installed through Scoop. The repo is linked to project ref `hjmkvroztbzmivrjzjod`.
- `supabase/.temp/` is local CLI state and must stay ignored.

Useful commands:

```powershell
supabase projects list
supabase link --project-ref hjmkvroztbzmivrjzjod
supabase db pull
supabase gen types typescript --linked
```

Do not run destructive DB commands such as `supabase db reset`, `db push`, or migrations against production without explicit confirmation.

## Production Deployment

GitHub Actions deploy from `main`:
- Frontend: `.github/workflows/deploy.yml`, triggered by frontend paths and root `package*.json`; builds with `VITE_API_BASE_URL=https://api.veilstudio.io` and FTPs `dist/` to shared hosting.
- API: `.github/workflows/deploy-api.yml`, triggered by `veilpix-api/**`; SCPs `veilpix-api/` to the VPS, restores `.env`, runs `npm ci --production`, and restarts PM2.

Production URLs:
- Frontend: `https://veilstudio.io/veilpix/`
- API health: `https://api.veilstudio.io/api/health`
- API server: `140.82.7.169`, domain `api.veilstudio.io`

After website/public-route changes, check whether `public/sitemap.xml` and `.github/workflows/deploy.yml` path filters need updates.

## VPS Access And Operations

Codex/local SSH access is configured for root:

```powershell
ssh -i "$env:USERPROFILE\.ssh\codex_veilpix_ed25519" root@140.82.7.169
```

Private key path:

```text
C:\Users\rwells\.ssh\codex_veilpix_ed25519
```

Verified from Codex on 2026-05-20: `whoami`, `hostname`, `pwd` returned `root`, `veilpix-api`, `/root`.

App location:

```bash
/home/veilpix/veilpix-api/
```

Useful server commands:

```bash
pm2 status
tail -100 /home/veilpix/veilpix-api/logs/out.log
tail -100 /home/veilpix/veilpix-api/logs/combined.log
curl http://127.0.0.1:3001/api/health
service nginx status
df -h
free -h
```

The VPS does not contain a git repo for the app. Do not use `git pull` on the server. Deploy through CI/CD or manual SCP.

Critical PM2 rule: avoid `pm2 restart veilpix-api`; it has caused port binding races. Use the clean restart pattern:

```bash
cd /home/veilpix/veilpix-api
pm2 delete veilpix-api || true
sleep 2
pm2 start ecosystem.config.js
```

## Production Environment Notes

Production env file:

```text
/home/veilpix/veilpix-api/.env
```

The deploy workflow restores it from:

```text
/home/veilpix/.env.backup
```

Do not commit secrets. Current production still needs periodic verification of Clerk/Stripe key status before billing or auth changes.

## Current Cautions

- Some older docs in `README.md`, `CLAUDE.md`, `GEMINI.md`, and `veilpix-api/README.md` are stale; trust code and workflows first.
- `veilpix-api/.env.example` contains older Gemini/Supabase anon references and should not be treated as authoritative.
- The codebase has mojibake in some copied log strings/comments. Avoid broad formatting churn unless you are intentionally cleaning that up.
- Anonymous free generation language is stale in some UI/docs; current backend generation routes require auth and credits.
