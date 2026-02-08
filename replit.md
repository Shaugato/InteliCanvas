# Replit.md

## Overview

This is a single-port full-stack application built with Vue 3 + Vite + TypeScript on the frontend and Node.js + Express + WebSocket on the backend. The architecture ensures only one externally exposed port where the Node server handles both API requests and serves the Vue client (via Vite middleware in development, static files in production).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Vue 3 with TypeScript
- **Build Tool**: Vite with Vue plugin
- **Styling**: Tailwind CSS v4 with custom theme configuration
- **UI Components**: shadcn/ui style components (New York style, configured for TSX)
- **Location**: `/client/` directory with entry point at `/client/src/main.tsx`

### Backend Architecture
- **Runtime**: Node.js with TypeScript (tsx for development)
- **Framework**: Express.js
- **Real-time**: WebSocket server (ws) mounted on the same HTTP server at `/ws`
- **API Pattern**: REST endpoints under `/api/` prefix
- **Location**: `/server/` directory with entry point at `/server/index.ts`

### Single-Port Design
- Development mode: Express server uses Vite middleware mode - no separate Vite dev server port
- Production mode: Express serves static files from `dist/public` with SPA fallback to `index.html`
- Server binds to `0.0.0.0` using `process.env.PORT` (defaults to 3000)
- WebSocket HMR uses path `/vite-hmr` to avoid conflicts with app WebSocket at `/ws`

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `/shared/schema.ts` - shared between client and server
- **Migrations**: Stored in `/migrations/` directory
- **Development Fallback**: MemStorage class provides in-memory storage when database unavailable
- **Database Push**: Use `npm run db:push` to sync schema to database

### Authentication
- Passport.js with local strategy configured
- Express sessions with connect-pg-simple for PostgreSQL session storage
- Memorystore available as fallback session storage

### Build Process
- **Script**: `/script/build.ts` handles both client and server builds
- **Client Build**: Vite outputs to `dist/public`
- **Server Build**: esbuild bundles server to `dist/index.cjs`
- **Bundling Strategy**: Common dependencies are bundled (listed in allowlist) to reduce cold start times

### Shared Code
- `/shared/` directory contains TypeScript types and Zod schemas used by both client and server
- Path aliases configured: `@/` for client source, `@shared/` for shared code

## External Dependencies

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- **Drizzle Kit**: Schema management and migrations

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `GEMINI_API_KEY`: For Gemini AI features (optional)
- `APP_ENV`: Environment indicator (production/development)
- `PUBLIC_BASE_URL`: Application URL for external access
- `PORT`: Server port (defaults to 3000)

### Key Runtime Dependencies
- `express`: HTTP server framework
- `ws`: WebSocket server
- `drizzle-orm` + `pg`: Database ORM and PostgreSQL driver
- `passport` + `passport-local`: Authentication
- `express-session`: Session management
- `zod`: Runtime validation with `drizzle-zod` integration

### Development Tools
- `vite`: Frontend build tool with HMR
- `tsx`: TypeScript execution for development
- `esbuild`: Server bundling for production
- `drizzle-kit`: Database schema tooling