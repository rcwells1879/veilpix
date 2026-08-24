# AGENTS.md

Operational guidance for agents working in this repository. Verify behavior against the current code and workflows before relying on older notes or rollout history.

## Project Snapshot

VeilPix is a privacy-focused image and video creation app. The frontend is React 19 + TypeScript + Vite; the API is Node/Express under `veilpix-api/`. The frontend calls only the API. Provider keys, the Supabase service role, credit accounting, and Stripe remain server-side.

Core stack:

- Frontend: React 19, Vite, Tailwind CSS v4, Clerk, TanStack Query, IndexedDB.
- Backend: Express, Clerk middleware, Kie.ai routes, Supabase, Stripe.
- Billing: new users receive 30 credits; authenticated generation routes deduct fractional credits atomically.
- Storage: local browser IndexedDB is the long-lived Album. Supabase Storage is used only for temporary provider inputs and the short-lived output delivery outbox described below.

## Commands

From the repository root:

```bash
npm install
npm run dev
npm run build
npm run preview
```

From `veilpix-api/`:

```bash
npm install
npm run dev
npm start
npm test
node --check server.js
```

Prefer targeted tests while developing. Run the frontend build and API tests before publishing changes that cross the client/server generation contract.

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
PROVIDER_MEDIA_SIGNING_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID=...
FRONTEND_URL=http://127.0.0.1:5173
```

`KIE_API_KEY`/`KIE_API_BASE_URL` are optional Seedance-specific overrides; most routes use the legacy-named `SEEDREAM_*` Kie credentials. Relay base URLs and TTLs also have production defaults. Do not commit secrets.

In mixed Windows/WSL networking, prefer `127.0.0.1` over `localhost`. The API listens on `0.0.0.0:3001`; development CORS accepts the documented local Vite ports.

## Current User-Facing Models

Image models:

- `nanobanana2`: Nano Banana 2 / Gemini 3.1 Flash.
- `seedream`: Seedream 5 Lite and Seedream 5 Pro.
- `wanimage`: Wan 2.7 Image.
- `zimage`: Z-Image Turbo, text-to-image only.

Video models:

- `wan3`: Wan 3.0 Standard (lower cost) and Prime (faster), with text, frame, image/video/audio reference, file, and link modes.
- `seedance`: Seedance 2.5 plus Seedance 2.0 Regular, Fast, and Mini.
- `wan`: legacy Wan Video 2.6/2.7 auto-selection.

`/api/nanobananapro` remains registered for compatibility but Nano Banana Pro is not selectable in the current frontend. Do not list it as an active model without intentionally restoring the UI contract.

Model capabilities, aspect ratios, durations, reference limits, and prices are code-owned. Check `components/studio/Composer.tsx`, `components/studio/videoPricing.ts`, `components/ImageModelControlsPanel.tsx`, `veilpix-api/utils/imageCreditPricing.js`, and the provider adapters instead of copying static values into docs.

The After Dark setting uses the provider's existing NSFW/safety switch. Non-purchasers cannot disable it; purchasing credits acts as the current age-verification gate. Do not add a separate moderation layer unless explicitly requested.

## Media Privacy And Lifecycle

There are three distinct media stores. Do not describe them as one generic database store.

### Browser Album

- `src/utils/workflowStorage.ts` stores image and video blobs, thumbnails, prompts, and reference metadata in IndexedDB.
- This is the durable user-facing Album, local to that browser profile. Temporary account delivery can seed another signed-in browser during the 48-hour window, but VeilPix does not retain a permanent account gallery; older items do not follow a user to a new browser after the window.
- The Album keeps at most 20 items and removes the oldest when the limit is exceeded.
- `localStorage` stores settings, small pending-generation records, and 48-hour per-browser delivery receipts, not generated media blobs.

### Provider Inputs

- Wan 3.0 reference files upload directly from the browser to the private `provider-inputs` bucket through one-use signed upload URLs. Large upload bytes therefore do not pass through or persist on the low-throughput VPS.
- Kie receives an HMAC-signed `/api/provider-input/...` URL. The API validates it and streams the private object from Supabase to Kie; it does not write the file to VPS disk or buffer the complete file.
- Wan 3.0 input objects are deleted when the Kie task reaches a terminal state or the route errors.
- Older image/video routes still accept multipart input through the API, place temporary objects in `temp-images`, and give Kie signed `/api/provider-media/...` relay URLs. The legacy bucket is read through a public Storage object endpoint behind that relay, so prompt deletion is the privacy boundary; those routes delete objects after completion/error and the two-hour cleanup is only an orphan safety net.
- Never delete a provider input while its job can still need it. Never turn a temporary input bucket into an output archive.

### Generated Output Delivery

- Successful provider output is streamed from the provider into the private `media-deliveries` bucket. The API does not retain it on VPS disk or load the entire blob into memory.
- `media_deliveries` stores delivery metadata, Clerk-account ownership, and a hard 48-hour expiry. `usage_logs` stores a recovery receipt rather than a long-lived provider URL.
- Closing the browser does not cancel backend provider polling. The browser keeps the generation ID in localStorage; `/api/image-jobs/:id` and `/api/video-jobs/:id` recover job state.
- On sign-in, page show/visibility, and every 30 seconds while visible, the frontend lists account-owned deliveries, downloads each through a 10-minute signed URL, writes the blob to that browser's IndexedDB, and verifies the generation ID and artifact type.
- After local verification, that browser records a 48-hour local receipt and acknowledges delivery. ACK validates account ownership but deliberately does not consume the shared temporary object, allowing another signed-in browser to save its own local copy during the window.
- Generated output remains in the private delivery bucket until its 48-hour expiry even after one browser retrieves it. API cleanup runs every five minutes, deletes expired objects/rows, and records `{ "expired": true }`.
- A local receipt prevents a deleted or auto-evicted Album item from reappearing on the same browser during the remaining delivery window. Deleting an Album item affects only that browser.
- Deletion guarantees cover VeilPix-controlled Supabase objects, not any retention performed independently by Kie or an underlying model provider.

When changing this flow, preserve idempotence and isolation: generation IDs and local receipts prevent duplicates, delivery list/ACK/status routes remain Clerk-owner-scoped, and only expiry deletes the shared delivery object.

## Important Files

- `App.tsx`: generation queue, model routing, pending-job recovery, Album delivery/ACK flow.
- `components/studio/Composer.tsx`: current inline image/video model UX and reference selectors.
- `components/studio/ReferenceInputs.tsx`: drag/drop and file input components.
- `components/studio/videoPricing.ts`: video capabilities, limits, and frontend estimates.
- `src/hooks/useImageGeneration.ts`: provider mutations, Wan 3.0 direct uploads, recovery API clients.
- `src/utils/workflowStorage.ts`: browser workflow and Album IndexedDB persistence.
- `veilpix-api/server.js`: middleware, rate limits, route registration, delivery cleanup timer.
- `veilpix-api/utils/database.js`: Supabase helpers, usage logging, output staging hook.
- `veilpix-api/utils/mediaDelivery.js`: 48-hour output outbox, signed downloads, ACK, expiry.
- `veilpix-api/utils/providerInput.js` and `routes/providerInput.js`: direct Wan 3.0 input uploads and streaming relay.
- `veilpix-api/utils/imageUpload.js` and `routes/providerMedia.js`: legacy temporary-input path.
- `veilpix-api/schema-migration-media-deliveries.sql`: private buckets and delivery table.
- `.github/workflows/deploy.yml` and `deploy-api.yml`: production deployment behavior.

## API Shape

All generation and delivery-list routes require Clerk authentication and allowed-email middleware. The browser also sends `X-Generation-ID` for recoverable jobs and `X-Session-ID` for request correlation where applicable.

Provider prefixes are `/api/nanobanana2`, `/api/seedream`, `/api/wanimage`, `/api/zimage`, `/api/wan`, `/api/seedance`, and `/api/wan3`. Recovery and delivery routes are `/api/image-jobs`, `/api/video-jobs`, and `/api/media-deliveries`.

Kie jobs generally create a task and poll its record until a terminal state. Frontend hooks must be called unconditionally, then the active mutation selected, to preserve React hook ordering.

## Supabase And Database

- The backend uses `SUPABASE_SERVICE_ROLE_KEY`; service-role access bypasses RLS. Keep RLS enabled and revoke direct client access to server-owned tables.
- `utils/database.js` exports `{ db, supabase }`; `supabase` is a function and must be called before `.from(...)`. `getSupabaseClient()` is also exported for newer code.
- Fractional balances use `schema-migration-fractional-credits.sql` and the atomic `deduct_user_credits` RPC. Purchased packages remain whole numbers.
- The repository is linked to Supabase project ref `hjmkvroztbzmivrjzjod`. Keep `supabase/.temp/` ignored.

Useful read-only/setup commands:

```powershell
supabase projects list
supabase link --project-ref hjmkvroztbzmivrjzjod
supabase db pull
supabase gen types typescript --linked
```

Do not run `supabase db reset`, `db push`, or production migrations without explicit confirmation.

## Production Deployment

GitHub Actions deploy from `main`:

- Frontend: `.github/workflows/deploy.yml` builds VeilPix, then sends `repository_dispatch` to `rcwells1879/VeilStudio`; that repository publishes the combined site to Cloudflare Pages.
- API: `.github/workflows/deploy-api.yml` copies `veilpix-api/` to the VPS, restores `/home/veilpix/.env.backup`, installs production dependencies, cleanly recreates the PM2 process, and health-checks it.

Production:

- App: `https://veilstudio.io/veilpix/`
- API health: `https://api.veilstudio.io/api/health`
- API host: `140.82.7.169`
- App directory: `/home/veilpix/veilpix-api/`

The VPS is not a Git checkout. Do not run `git pull` there. Prefer CI/CD. For a manual restart, avoid `pm2 restart veilpix-api`; use a clean stop/start after allowing the port to release:

```bash
cd /home/veilpix/veilpix-api
pm2 delete veilpix-api || true
sleep 2
pm2 start ecosystem.config.js
```

Useful checks:

```bash
pm2 status
pm2 logs veilpix-api --lines 100
tail -100 /home/veilpix/veilpix-api/logs/out-0.log
tail -100 /home/veilpix/veilpix-api/logs/combined-0.log
curl http://127.0.0.1:3001/api/health
service nginx status
df -h
free -h
```

After public route or content changes, review `public/sitemap.xml` and the frontend workflow path filters. Before publishing, sync first, stage only intended paths, keep `.codex/` out, and distinguish local validation, pushed SHA, workflow completion, and live deployment.

## Cautions

- `CLAUDE.md` and `GEMINI.md` are compatibility pointers, not separate sources of truth.
- Avoid broad formatting churn around existing mojibake unless cleanup is explicitly in scope.
- Current generation routes require authentication and credits; anonymous-generation language is obsolete.
