# CLAUDE.md

Use [AGENTS.md](./AGENTS.md) as the canonical repository guidance for VeilPix.

Start with [README.md](./README.md) for the product and privacy overview and [veilpix-api/README.md](./veilpix-api/README.md) for the API/media-delivery contract. Do not maintain a second copy of model lists, environment variables, storage behavior, or deployment instructions here; they drift quickly.

The current code and GitHub workflows override historical rollout notes. VeilPix uses Kie.ai model routes, browser-local IndexedDB Albums, temporary Supabase provider-input storage, and an account-scoped 48-hour output window that lets each signed-in browser save its own local copy without creating a permanent cloud gallery.
