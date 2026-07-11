# Frontend architecture

OrcaCast uses route-level pages as composition roots and feature folders for domain behavior. Page files should connect feature hooks and components; they should not own persistence formats, data normalization, or complex calculations.

## Ownership

- `src/app`: providers, routing, error boundaries, and application startup.
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

## Planner visual contract

The current planner layout and class names are intentionally preserved. Refactors should move logic and components before changing markup. Any markup or stylesheet change requires desktop and mobile rendered-page verification for the empty, loading, results, detail, itinerary, settings, light, and dark states.

## Data states

Every remote-data surface must distinguish loading, ready, empty, and error. Empty arrays are not an error sentinel and must not be classified as real activity.

## Quality gates

Run `npm run build:check` before release. CI also runs lint, typecheck, tests, and the production build. The bundle check prevents MapLibre from entering the initial application graph and enforces initial JavaScript and CSS budgets.
