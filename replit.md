# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/video-version-comparison/src/App.tsx` — router wiring the three media pages.
- `artifacts/video-version-comparison/src/pages/{video,audio,image}-compare.tsx` — the three comparison pages.
- `artifacts/video-version-comparison/src/diff.ts` — DOM-free pixel diff kernel (video + image), unit-tested in `diff.test.ts`.
- `artifacts/video-version-comparison/src/audio/dsp.ts` — DOM-free audio diff kernel (FFT, band analysis, added/removed/common + pitch), unit-tested in `audio/dsp.test.ts`.
- `artifacts/video-version-comparison/src/components/topbar.tsx` — shared brand + media nav.
- `artifacts/video-version-comparison/src/lib/canvas.ts` — contain-fit drawing and diff-map renderer shared by video/image.
- DB schema: `lib/db` · API contract: `lib/api-spec/openapi.yaml` · theme: `src/index.css` per app.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

FrameCheck (`artifacts/video-version-comparison`) is a local-only version-comparison QC app with three media types, navigable from the top bar (`/video`, `/audio`, `/image`):

- **Video** — frame-aligned split view plus a live pixel difference map (blue = added/brighter, red = removed/darker), timeline scan, sensitivity + dot/marker overlays.
- **Audio** — waveform lanes tinted by a spectral diff (blue = added, red = removed, grey = common), a frequency × time spectral map, pitch/tone-shift detection via spectral centroid, synchronized playback, and a change-event timeline.
- **Image** — split, pixel difference map, and draggable wipe views over the same diff kernel.

All media is processed in the browser (object URLs only; nothing is uploaded).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
