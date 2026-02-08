# InteliCanvas Platfrom - The First AI Driven Drawing Platform

This is a single-port full-stack app using Vue 3 + Vite + TypeScript on the client and Node.js + Express + WebSocket on the server.

## How to run in Replit

The app is configured to run automatically.
- `npm run dev`: Starts the server in development mode (with Vite middleware).
- `npm run build`: Builds the client and server.
- `npm start`: Runs the production server.

## Environment Variables

Ensure these secrets are set in Replit Secrets (Tools > Secrets):
- `GEMINI_API_KEY`: (If using Gemini features)
- `APP_ENV`: (e.g. `production` or `development`)
- `PUBLIC_BASE_URL`: (Your Replit URL)

For client-side Cheetah voice mode, also provide:
- `VITE_PICOVOICE_ACCESS_KEY`: Picovoice AccessKey used by `@picovoice/cheetah-web`
- `VITE_CHEETAH_MODEL_PATH` (optional): Public model path (defaults to `/models/inteliCanvas-vocab-cheetah.pv`)
- `VITE_CHEETAH_ENDPOINT_DURATION_SEC` (optional): Endpoint duration override (default `1.0`)
- `VITE_CHEETAH_AUTO_PUNCTUATION` (optional): `true/false` toggle (default `true`)

## Architecture

- `client/`: Vue 3 frontend
- `server/`: Node.js Express backend
- `shared/`: Shared types
