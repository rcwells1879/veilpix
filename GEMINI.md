# GEMINI.md

Use [AGENTS.md](./AGENTS.md) as the canonical repository guidance for VeilPix.

See [README.md](./README.md) for the current product/privacy overview and [veilpix-api/README.md](./veilpix-api/README.md) for routes and media transfer. This file intentionally does not duplicate model or deployment details.

The obsolete direct Gemini API and `/api/gemini` architecture no longer describes VeilPix. Current image and video models run through authenticated Kie.ai backend routes; Albums are browser-local, while generated output is temporarily available to the owning account for up to 48 hours so each signed-in browser can save its own copy.
