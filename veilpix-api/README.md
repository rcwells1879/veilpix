# VeilPix API

Authenticated Express backend for VeilPix image/video generation, credit accounting, temporary media transfer, and Stripe purchases.

## Responsibilities

- Validate Clerk sessions and the allowed-email policy.
- Normalize model-specific input and send generation jobs to Kie.ai or the configured Seedance upstream.
- Poll jobs independently of the browser request lifecycle and expose recovery status by generation ID.
- Deduct fractional VeilPix credits and record usage in Supabase.
- Move successful output through a private, account-scoped 48-hour delivery outbox so each signed-in browser can verify its own local Album copy.
- Keep provider credentials, Supabase service-role access, and Stripe secrets off the client.

Anonymous generation and the old direct `/api/gemini` contract are no longer supported.

## Quick Start

```bash
npm install
copy .env.example .env
npm run dev
```

On PowerShell, `Copy-Item .env.example .env` is equivalent. The API listens on `0.0.0.0:3001`; use `http://127.0.0.1:3001` locally.

Minimum service configuration:

```env
NODE_ENV=development
PORT=3001
SEEDREAM_API_KEY=...
SEEDREAM_API_BASE_URL=https://api.kie.ai
CLERK_SECRET_KEY=...
CLERK_PUBLISHABLE_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PROVIDER_MEDIA_SIGNING_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID=...
FRONTEND_URL=http://127.0.0.1:5173
```

`KIE_API_KEY` and `KIE_API_BASE_URL` may override the legacy-named Kie credentials for Seedance. Relay base URLs and TTLs have production defaults. Never commit real credentials.

To trial filtered Seedance workflows through OpenRouter, set `SEEDANCE_PROVIDER=openrouter` and `OPENROUTER_API_KEY` in the server environment. `OPENROUTER_API_BASE_URL` defaults to `https://openrouter.ai`. Requests with the safety filter enabled use OpenRouter's more restrictive Seed/BytePlus path and omit `nsfw_checker`, which OpenRouter does not document as a supported passthrough parameter. After Dark requests always remain on Kie and send `nsfw_checker=false`; the server derives this route from the safety setting rather than trusting a client-supplied provider name. Kie also continues serving the other Kie-backed routes. OpenRouter jobs retain the Kie-baseline credit estimate shown when generation starts; lower provider costs do not reduce the final VeilPix charge.

## Current Routes

All provider, recovery, usage, and delivery-list routes require a Clerk bearer token unless a route explicitly documents otherwise.

| Prefix | Purpose |
| --- | --- |
| `/api/nanobanana2` | Nano Banana 2 image workflows |
| `/api/seedream` | Seedream 5 Lite/Pro image workflows |
| `/api/wanimage` | Wan 2.7 Image workflows |
| `/api/zimage` | Z-Image Turbo text-to-image |
| `/api/wan3` | Wan 3.0 Standard/Prime video and direct input signing |
| `/api/seedance` | Seedance 2.5 and 2.0 variants |
| `/api/wan` | Legacy Wan Video 2.6/2.7 |
| `/api/image-jobs/:generationId` | Recover image job state |
| `/api/video-jobs/:generationId` | Recover video job state |
| `/api/media-deliveries` | List and acknowledge pending output |
| `/api/auth`, `/api/usage` | User and credit state |
| `/api/checkout`, `/api/stripe`, `/api/webhooks` | Purchases and Stripe events |
| `/api/health` | Process health |

`/api/nanobananapro` is a compatibility route but is not selectable in the current frontend. `/api/provider-input` and `/api/provider-media` are HMAC-protected provider download relays, not general user APIs.

Generation requests carry `X-Generation-ID`; the recovery endpoints use it for idempotent status lookup. Frontend requests may also carry `X-Session-ID` for correlation.

## Media Transfer And Deletion

### Reference inputs

Wan 3.0 uses the low-throughput-VPS path:

1. `POST /api/wan3/inputs/sign` returns one-use Supabase signed upload URLs.
2. The browser uploads references directly to the private `provider-inputs` bucket. The large request body bypasses the API host.
3. Kie receives a short-lived, HMAC-signed `/api/provider-input/...` URL. That endpoint streams the object from Supabase to Kie and supports range requests; it does not persist or fully buffer the file on VPS disk.
4. `routes/wan3.js` deletes all uploaded objects after provider success/failure or on a route error.

Legacy image/video routes receive multipart files, upload temporary objects to `temp-images`, and pass Kie signed `/api/provider-media/...` URLs. `providerMedia.js` currently reads that legacy bucket through its public Storage object endpoint, so rapid deletion is the privacy boundary. Each route deletes its temporary objects after the provider reaches a terminal state; `cleanupOldImages()` removes two-hour-old orphans only as a fallback.

### Generated outputs

Video routes write the upstream name, provider task ID, and owner-scoped recovery metadata to `usage_logs` as soon as the provider accepts the task, then return `202`. `utils/kieVideoJobRecovery.js` checks Kie and OpenRouter records every 30 seconds for up to 48 hours, including after an API restart. Older Seedance records without an upstream marker continue recovering through Kie. Terminal failures replace the pending marker; successful results continue through the delivery outbox. Image routes enter the same outbox through `db.logUsage()`.

`utils/mediaDelivery.js` then:

1. Fetches the provider result and streams it directly into private `media-deliveries` Storage without VPS disk persistence or a full in-memory blob.
2. Creates an owner-scoped `media_deliveries` row with a 48-hour expiry and replaces the provider URL in `usage_logs` with a delivery receipt.
3. Gives a browser authenticated as that Clerk account a 10-minute signed download URL from `GET /api/media-deliveries`; other accounts are excluded before URL creation.
4. Lets each browser write and verify its own IndexedDB blob, retain a browser-local receipt, and call `POST /api/media-deliveries/:id/ack` (or the generation-ID ACK). ACK confirms ownership but does not delete the shared temporary object.
5. Deletes the output object and delivery row at the hard 48-hour expiry. Cleanup runs when deliveries are listed and every five minutes in the API process; the usage receipt is marked expired.

Closing the browser does not cancel a provider task. The browser stores pending generation metadata and short-lived delivery receipts in localStorage, recovers status through `/api/image-jobs` or `/api/video-jobs`, and polls the account outbox on return and while visible. Media blobs remain in IndexedDB, not localStorage.

The deletion contract covers VeilPix-owned Supabase objects, not provider-side retention.

## Safety And Billing

- Generation routes require authentication, allowed email, sufficient credits, and route-specific rate limits.
- Credit costs are model/workflow-specific. Use `utils/imageCreditPricing.js`, the video pricing helpers/adapters, and their tests rather than documentation constants.
- Credit deduction uses the atomic `deduct_user_credits` RPC with hundredth-credit precision.
- After Dark maps to Kie/model NSFW flags. During the OpenRouter Seedance trial, filtered requests use OpenRouter without an `nsfw_checker` parameter, while After Dark requests stay on Kie with `nsfw_checker=false`. The frontend keeps the setting enabled for users without a credit purchase; the API does not add a second safety classifier.

## Supabase Setup

Relevant schema files include:

- `schema-migration-credits.sql`
- `schema-migration-fractional-credits.sql`
- `schema-migration-media-deliveries.sql`
- `schema-migration-clerk-user-deletions.sql`

`schema-migration-media-deliveries.sql` creates the private `provider-inputs` and `media-deliveries` buckets plus the server-owned delivery table. Keep RLS enabled and direct anon/authenticated grants revoked. Do not run production migrations or destructive Supabase commands without explicit approval.

## Validation

```bash
npm test
node --check server.js
```

The test command uses Node's built-in runner over `utils/*.test.js`.

## Production

The API is copied by `.github/workflows/deploy-api.yml` to `/home/veilpix/veilpix-api/`, receives its environment from `/home/veilpix/.env.backup`, runs under PM2 behind Nginx, and is health-checked at `http://127.0.0.1:3001/api/health`.

The server directory is not a Git checkout. Deploy through CI/CD. For manual recovery, use the clean PM2 delete/wait/start sequence documented in the repository [AGENTS.md](../AGENTS.md#production-deployment), not `pm2 restart veilpix-api`.
