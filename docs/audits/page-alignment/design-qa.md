# Planner and This Week alignment

Reviewed and implemented September 5, 2026 against the local application.

## Intent and decisions

- **Planner:** choose dates, a base and optional travel range; explore historical seasonal context, recommended places and an itinerary.
- **This Week:** explore a selected weekly modeled forecast, compare weeks with playback, and find places, cameras and hydrophones.
- **About:** explain interpretation, limitations and responsible viewing. It is now a primary destination alongside This Week and Plan a Trip. Its weekly forecast link now opens `/watch`.

The existing cream, navy, teal and yellow visual language is retained. Shared `MapWorkspaceSummary` and `FieldPicksToggle` components and workspace styles establish consistent summary hierarchy, panel widths, map legends, spacing, controls and mobile behavior. Planner keeps its seasonal chart; This Week keeps its weekly selector and playback. Explicit labels distinguish historical context from weekly forecasts, and the latest-available warning remains visible when the requested week has no data.

## Findings resolved

1. Weekly dates were truncated and the selector relied on an invisible whole-card click target. Dates now remain readable, with an explicit Weeks action corresponding to Planner's Edit trip action.
2. Summary and legend placement differed between the map pages. They now share alignment, with Field Picks on the right and temporal controls below the map on desktop.
3. Mobile navigation hid the three main destinations, and oversized collapsed panels competed with map controls. Navigation stays visible; both pages use compact Field Picks buttons. Planner's seasonal chart expands into a usable panel.
4. Planner's map fitting measured a hidden summary and applied extra zoom, which could place recommendations behind overlays. It now measures the visible shared summary without the extra zoom.
5. Planner's remote media actions were buried in the Places menu. Direct Watch and Listen controls now match This Week, while the existing filters remain available.

## Visual evidence

[Before and after comparison](review.html) includes the original and final desktop layouts, mobile layouts, and About reference. Source and final images were inspected together in the rendered comparison. Direct application screenshots were also inspected at 1440 × 1000 and 430 × 900, including the expanded mobile seasonal chart.

## Validation

- 77 unit and component tests passed.
- 42 Chromium desktop/mobile browser tests passed; 6 tests were skipped by device-specific conditions.
- Browser coverage includes navigation, route refresh, serious/critical accessibility checks, forecast playback, Planner date weighting and filters, media details, itineraries, blocked browser storage, and shared summary geometry/readable headings.
- Production build, bundle budget, lint, TypeScript, formatting, asset validation and data validation passed.

Firefox and WebKit were not run. This verifies presentation and existing application behavior; it does not validate scientific forecast accuracy. Changes are local and have not been deployed.
