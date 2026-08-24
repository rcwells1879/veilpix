# CLAUDE.md

Use [AGENTS.md](./AGENTS.md) as the canonical repository guidance for VeilPix.

Start with [README.md](./README.md) for the product and privacy overview and [veilpix-api/README.md](./veilpix-api/README.md) for the API/media-delivery contract. Do not maintain a second copy of model lists, environment variables, storage behavior, or deployment instructions here; they drift quickly.

The current code and GitHub workflows override historical rollout notes. In particular, VeilPix now uses Kie.ai model routes, browser-local IndexedDB for the Album, temporary Supabase provider-input storage, and a 48-hour acknowledged output-delivery outbox.
