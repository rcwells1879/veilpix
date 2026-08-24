# GEMINI.md

Use [AGENTS.md](./AGENTS.md) as the canonical repository guidance for VeilPix.

See [README.md](./README.md) for the current product/privacy overview and [veilpix-api/README.md](./veilpix-api/README.md) for routes and media transfer. This file intentionally does not duplicate model or deployment details.

The obsolete direct Gemini API and `/api/gemini` architecture no longer describes VeilPix. Current image and video models run through authenticated Kie.ai backend routes; the Album is browser-local and generated outputs use the short-lived acknowledged delivery outbox.
