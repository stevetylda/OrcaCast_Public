# Recovery and component cleanup

Implemented September 13, 2026, against the existing working tree. This follows the home/backend review; pre-existing edits and deletions were preserved. This repository is a static application, so the data-access layer is the backend scope here.

## Recovery fixes

- Camera, POI, and hydrophone loaders use a shared version-aware cache. Concurrent requests share work; successful results stay cached; rejected requests are evicted. An older rejection cannot evict a newer request.
- These loaders now use the bounded shared fetch client, including its timeout, retry, content checks, and cache-version URL handling. Planner base locations also use that client.
- `useLocationResources` exposes sources independently. A slow or failed POI request no longer blocks successful camera data. Planner and This Week show unavailable sources and a retry action; retries preserve successful sources.
- Map POI markers consume the same resource state as the page, so recovered places reach the map. Recommendation loading has an explicit retry path.
- A failed photo manifest is no longer permanently cached as an empty success. Planner exposes its retry alongside other optional reference data.
- An early request for the unresolved data-version token no longer prevents subsequently loaded metadata from supplying the version.
- Home and location resources share `useAsyncResource`, including unmount protection and retry state.

## Dead code removed

Reference searches found no application, test, or script consumers for these 16 runtime exports:

`formatTravelRangeLabel`, `getLatestForecastPath`, `getActualsPathForPeriod`, `getShapPathForPeriod`, `loadForecastModelIds`, `countNonZero`, `loadOrcasoundHydrophones`, `buildTripPlannerRange`, `daysForTripLength`, `getSpotPhotoAttribution`, `updateGridFillColor`, `getPalette`, `getViewabilityPaletteOrDefault`, `forecastPeriodToIsoWeek`, `forecastPeriodToIsoWeekYear`, and `FUTURE_WHALE_TAIL_SVG`.

Also removed the obsolete `TripLengthOption` type and the newly unused private `addDays` and `parseIsoDateAsUtc` helpers. Photo attribution metadata remains intact. Cache-reset helpers are retained and exercised by recovery tests. The raster worker remains an active Vite worker entry point.

## Clearer responsibility boundaries

- `features/map/plannerLocationLayers.ts`: location GeoJSON, pins, radius layers, selection, and popup presentation. `ForecastMap.tsx` now focuses on map lifecycle, overlays, and interactions; it decreased from 2,735 to 1,940 lines.
- `shared/geo/surfaceRasterMath.ts`: shared projection, modeled-value filtering, color interpolation, sample indexing, and worker message types. Main-thread and worker rendering use one implementation. Platform-specific canvas rendering stays in its respective module. The worker decreased from 515 to 182 lines.
- `features/planner/components/PlannerItineraryDetails.tsx`: itinerary details dialog, chart markup, and focus lifecycle. The parent supplies trip and chart data plus actions.
- `features/locations/useLocationResources.ts` and `shared/data/useAsyncResource.ts`: resource state and recovery. `usePlannerReferenceData` composes these resources and decreased from 110 to 25 lines.

These are focused improvements, not a claim that every oversized component is resolved. PlanPage is still about 3,100 lines and WatchPageLayout about 1,270. Their remaining brush/drag interaction state and itinerary-image export workflows are the next useful extraction boundaries. CSS and public data were not subjected to blanket dead-file deletion.

## Validation

- 55 unit tests and 47 component tests pass (102 total).
- Regression coverage includes failed-request recovery using the actual camera/POI/hydrophone/photo loaders, independent resource availability, preserving successful loads during retry, metadata initialization order, cache concurrency/version races, modeled zero versus unavailable raster values, projection/interpolation invariants, and itinerary-dialog focus restoration, Escape, and download dispatch.
- TypeScript, ESLint, production build, bundle budget, formatting, data validation, asset validation, build-secret scan, and tracked-artifact checks pass.
- Browser smoke check at 1280 × 720: home content loaded; Planner entry screen rendered; This Week rendered the forecast map, location markers, 48 cameras, and 5 hydrophones with the historical-publication warning preserved.
- Full browser E2E suite, mobile interaction regressions, populated Planner export download, and deployment were not run for this cleanup. Injected recovery failures were tested at component/data level, not via browser network interception.
