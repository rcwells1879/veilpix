# VeilPix

VeilPix is a privacy-focused browser workspace for AI image editing, image generation, and multimodal video creation. It combines a React studio with an authenticated Express API that brokers Kie.ai models, credits, temporary media transfer, and Stripe purchases.

## What It Supports

- Prompted image generation, localized edits, adjustments, filters, and multi-image composition.
- Text-to-video, first/last-frame animation, multimodal reference video, and clip continuation/stitching.
- Drag-and-drop image and video references from the device or the browser-local Album.
- Model-specific ratios, resolutions, durations, reference limits, and pricing.
- After Dark through the provider's existing NSFW filter; no separate VeilPix safety classifier.
- Recoverable generation when the tab or browser closes.

Current image models are Nano Banana 2, Seedream 5 Lite/Pro, Wan 2.7 Image, and text-only Z-Image Turbo. Current video choices are Wan 3.0 Standard/Prime, Seedance 2.5 and 2.0 variants, and legacy Wan Video 2.6/2.7.

## Media Privacy

The user-facing Album lives in that browser's IndexedDB and stores real image and video blobs. It is not a cloud-synced account gallery and is subject to browser site-data cleanup and the 20-item Album limit.

VeilPix uses Supabase only as temporary transport storage:

1. Reference inputs are retained only while the provider job needs them. Wan 3.0 uploads large references directly from the browser to private Storage, avoiding persistent files and large upload bodies on the VPS.
2. A successful provider output is streamed into a private delivery outbox for up to 48 hours. Closing the browser does not interrupt the server-side task.
3. When the user returns, VeilPix downloads pending output into IndexedDB and verifies it is present in the Album.
4. The browser then acknowledges delivery, which deletes the remote output object and its delivery row. Unretrieved items expire and are deleted after 48 hours.

The provider may have its own retention policy; this lifecycle describes storage controlled by VeilPix.

See [AGENTS.md](./AGENTS.md#media-privacy-and-lifecycle) for the implementation contract and [veilpix-api/README.md](./veilpix-api/README.md#media-transfer-and-deletion) for API details.

## Architecture

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query |
| Authentication | Clerk |
| API | Node.js, Express |
| Models | Kie.ai provider routes |
| Database and temporary storage | Supabase PostgreSQL and Storage |
| Browser persistence | IndexedDB and localStorage |
| Payments | Stripe |

The frontend calls only the VeilPix API. Provider keys, the Supabase service role, credit accounting, and Stripe secrets remain server-side.

## Local Development

Requirements: Node.js 18+ and npm.

Frontend, from the repository root:

```bash
npm install
npm run dev
```

Create `.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=...
VITE_API_BASE_URL=http://127.0.0.1:3001
VITE_NODE_ENV=development
```

API, in another terminal:

```bash
cd veilpix-api
npm install
npm run dev
```

Copy `veilpix-api/.env.example` to `veilpix-api/.env` and supply the real Kie, Clerk, Supabase, and Stripe values. Use `127.0.0.1` rather than `localhost` in mixed Windows/WSL environments.

The Vite app is served at `http://127.0.0.1:5173/veilpix/`; the API listens at `http://127.0.0.1:3001`.

## Validation

```bash
# Frontend
npm run build

# API
cd veilpix-api
npm test
node --check server.js
```

## Documentation

- [AGENTS.md](./AGENTS.md): complete repository, privacy, operations, and deployment guidance.
- [veilpix-api/README.md](./veilpix-api/README.md): backend routes and media delivery contract.
- `CLAUDE.md` and `GEMINI.md`: short compatibility pointers to the canonical docs above.
