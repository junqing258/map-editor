# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite-based Vue 3 + TypeScript map editor. Application code lives in `src/`. Use `src/pages/` for route-level screens, `src/components/` for UI and canvas modules, `src/workers/` for heavy processing moved off the main thread, and `src/types/` for shared data contracts such as `map.ts`. Utility code belongs in `src/utils/` or `src/lib/` depending on whether it is app-specific logic or reusable helpers. Unit tests live in `tests/`. Static styling starts in `src/styles.css`. Supporting material lives in `docs/`, sample map data in `maps/`, generated output in `dist/`, and architecture diagrams in `plantuml-diagrams/`.

## Build, Test, and Development Commands

Prefer `pnpm`; the repo is pinned to `pnpm@10.21.0`.

- `pnpm dev`: starts the Vite dev server on port `3700`.
- `pnpm build`: runs `vue-tsc --noEmit` and then creates a production build.
- `pnpm preview`: serves the built app locally for a production-like check.
- `pnpm test`: runs the Vitest unit suite once.
- `pnpm test:watch`: starts Vitest in watch mode for local iteration.
- `pnpm lint` / `pnpm lint:fix`: checks or fixes ESLint issues in `.ts`, `.vue`, and config files.
- `pnpm format` / `pnpm format:check`: applies or verifies Prettier formatting.

## Coding Style & Naming Conventions

Follow the existing Vue 3 SFC style with TypeScript. Prettier enforces semicolons, double quotes, trailing commas, and a `printWidth` of `120`; keep indentation consistent with the surrounding file (current source uses 2 spaces). ESLint also enforces sorted imports via `simple-import-sort`. Use `PascalCase` for Vue components (`MapEditorPage.vue`), `camelCase` for utilities (`safeClone.ts`), and keep shared type definitions in `src/types/`. Use the `@/` alias for imports from `src/`.

## Testing Guidelines

Vitest is the unit test runner. Run `pnpm test` before submitting changes, and use `pnpm test:watch` while iterating on logic-heavy code. Place new unit tests under `tests/` using the `*.test.ts` suffix, and prefer covering parsing, layout, worker-safe helpers, and other pure logic before relying on manual UI checks alone.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit-style prefixes such as `feat:`, `fix:`, and scoped forms like `feat(map-editor): ...`. Keep commits narrow and descriptive. Pull requests should include a short summary, note any data-format or worker changes, link the relevant issue when available, and attach screenshots or short recordings for UI or canvas interaction changes.
