# Frontend architecture

OrcaCast uses route-level pages as composition roots and feature folders for domain behavior. Page files should connect feature hooks and components; they should not own persistence formats, data normalization, or complex calculations.

## Ownership

- `src/app`: providers, routing, route metadata, hash scrolling, error boundaries, and application startup.
- `src/pages`: route composition and route-owned CSS.
- `src/features/planner/model`: planner types, persistence, distance rules, chart calculations, and trip-brush behavior.
- `src/features/planner/hooks`: planner persistence and data-loading lifecycles.
- `src/features/planner/components`: planner UI sections. Existing planner class names form the visual compatibility contract.
- `src/features/planner/exports`: itinerary and image-export behavior.
- `src/features/home`: home-only weather and preview behavior.
- `src/features/seasonal-activity`: calendar-year activity buckets shared by the home and planner routes.
- `src/shared`: UI and infrastructure genuinely reused by multiple features.

## Dependency rules

1. Shared modules must not import from pages.
2. Feature model modules must not import React components.
3. Network and browser storage values are validated at their feature boundary.
4. Pages may import features and shared modules; features should not import pages.
5. Avoid barrel imports when a lightweight entry point needs one leaf module. A barrel can accidentally make a lazy route eager.

## Application startup and recovery

React renders immediately from `src/main.tsx`. Forecast metadata priming is an asynchronous optimization, not a prerequisite for mounting the application. Metadata-independent pages must remain usable when `meta.json` or its fallback is missing, malformed, or temporarily unavailable.

Data-owning routes are responsible for their own loading, empty, and failure states. Do not reintroduce a global forecast-specific startup screen. A failed metadata promise must be cleared so later calls can retry it.

## Routing contract

Routes are declared in `src/app/App.tsx` and lazy loaded behind page-level error boundaries. Current public routes are:

- `/` — Home
- `/watch` — weekly forecast workspace
- `/planner` — trip planner
- `/explore` — coming-soon whale and wildlife field guide
- `/about` — product and interpretation guide
- `/about/model` — model methodology
- `*` — styled not-found recovery page

Every first-class page needs:

1. A lazy route and page error-boundary label in `App.tsx`.
2. A title and description entry in `src/app/RouteMetadata.tsx`.
3. Desktop and mobile direct-load coverage in `tests/e2e/smoke.spec.ts`.
4. Static-host fallback support so direct requests resolve to `index.html`.

The shared OrcaCast brand is always a link to `/`. It must not be overloaded with reset, refresh, or page-local behavior. Use explicitly labelled controls for those actions.

`HashScrollHandler` handles route-aware anchor scrolling after the destination renders. Use hashes for sections within a page; use a dedicated route when the destination has its own content model and navigation identity.

## Route metadata

`RouteMetadata` observes the active pathname and updates:

- `document.title`
- the standard description meta tag
- `og:title`
- `og:description`

Unknown paths receive not-found metadata. Keep copy concise and route-specific so browser history, bookmarks, search results, and link previews remain meaningful.

## Planner visual contract

The current planner layout and class names are intentionally preserved. Refactors should move logic and components before changing markup. Any markup or stylesheet change requires desktop and mobile rendered-page verification for the empty, loading, results, detail, itinerary, settings, light, and dark states.

## Data states

Every remote-data surface must distinguish loading, ready, empty, and error. Empty arrays are not an error sentinel and must not be classified as real activity.

Loading reveals should be readiness-driven. A short anti-flicker minimum is acceptable, but UI must not be hidden behind fixed multi-second delays after its required resources are ready.

## Accessibility contract

Shared dialogs and drawers use `useDialogFocus` for initial focus, Tab and Shift+Tab containment, Escape dismissal, background inertness, and opener focus restoration. New modal surfaces should use the same behavior unless a well-tested accessible primitive replaces it.

Critical and serious Axe findings are release-blocking in `tests/e2e/smoke.spec.ts`; color contrast is not excluded. New routes must be added to the smoke route matrix and pass in desktop and mobile Chromium. Interactive changes should also receive focused component tests for navigation and keyboard behavior.

## Quality gates

Run `npm run build:check` and `npm run test:e2e:chromium` before release. CI also runs lint, typecheck, tests, the production build, and browser smoke coverage. The bundle check prevents MapLibre from entering the initial application graph and enforces initial JavaScript and CSS budgets. The smoke suite verifies direct loads, refreshes, first-party network failures, unhandled console errors, and serious or critical accessibility violations.
