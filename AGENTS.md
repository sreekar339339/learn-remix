# Tic Tac Toe Agent Guide

Remix 3 app (`remix@3.0.0-beta.5`). For full Remix conventions (architecture, controllers, middleware, validation, auth, testing), read `./.agents/skills/remix/SKILL.md` before building features.

## Commands

Package manager is **pnpm** (not npm — there is a `pnpm-lock.yaml` and a pnpm `patchedDependencies` entry; `patches/@remix-run__ui@0.4.0.patch` is applied by pnpm-workspace.yaml).

```sh
pnpm i
pnpm run dev        # NODE_ENV=development, node --watch, source runs directly (no build step)
pnpm run start      # NODE_ENV=production
pnpm test           # NODE_ENV=test remix test — runs BOTH server and browser suites
pnpm run typecheck  # tsc --noEmit
pnpm run benchmark:custom-events
```

- No `lint` and no `build` scripts exist. Do not invent them.
- Requires Node >= 24.3.0; server listens on `PORT` (default 44100).
- `remix test` discovers `**/*.test.tsx`. Run one file with `NODE_ENV=test remix test "app/assets/<file>.test.tsx"`.

## Testing Conventions

- `*.test.tsx` = server/SSR tests (use `renderToString` from `remix/ui/server`); `*.test.browser.tsx` = real-browser DOM tests (Playwright; `render` from `remix/ui/test` + `result.act()`).
- All tests currently live in `app/assets/`; the repo has no `app/actions` or `router.fetch` tests yet. Prefer `router.fetch(new Request(...))` for controller/router behavior (see SKILL).
- Component tests only for DOM-specific behavior; test HTTP routes at the server layer.

## Remix Quirks (non-React)

- Import only from `remix/<subpath>` (`remix/router`, `remix/ui`, `remix/test`, ...). There is no top-level `remix` import.
- UI components are **not React**: they receive a `handle`, read `handle.props`, and return a zero-arg render function. `jsxImportSource` is `remix/ui`.
- `app/routes.ts` is the source of truth for URLs; use `routes.<name>.href(...)` for links/redirects/tests. Controllers return explicit `Response` objects; validate at boundaries with `remix/data-schema`.

## Layout

- `app/actions/controller.tsx` owns route actions (currently all controllers, incl. the nested `todolist` map). `app/routes.ts` = route contract. `app/router.ts` = middleware (`staticFiles`, `formData`, `render`) + explicit `router.map(...)`. `app/middleware/render.tsx` = request-scoped renderer. `app/ui/` = shared shell/layout. `app/assets.ts` = server asset pipeline (serves `app/assets/**` from source, denies `*.server.*`).
- Client/browser code lives in `app/assets/` (entry.ts boots via `remix/ui` `run`). `app/data/todolist.ts` is an in-memory store; no DB yet (`.gitignore` anticipates `db/*.sqlite`).
- No env files/dotenv — `NODE_ENV` is set inline per script; `PORT` read in `server.ts`.

## Route Ownership

- Start from `app/routes.ts` and map each route to the narrowest owner on disk.
- Top-level route actions go in `app/actions/controller.tsx`; add `app/actions/<route-key>/controller.tsx` for nested route maps that need their own actions or middleware.
- Keep route-owned page modules next to the route that owns them; move shared UI to `app/ui/`.
- Avoid generic dumping grounds (`app/lib/`, `app/components/`); prefer narrow owners.

## Conventions

- Git commits: single-line, lowercase, informal subjects, no conventional-commit prefixes (e.g. `refactor`, `api signature change`, `optimisations`).
