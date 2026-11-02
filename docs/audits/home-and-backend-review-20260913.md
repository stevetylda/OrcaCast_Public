# Home improvements and backend code review

Reviewed September 13, 2026, against the current working tree.

Follow-up: the recovery and dead-code findings below were subsequently addressed in [Recovery and component cleanup](./recovery-and-component-cleanup-20260913.md). The original findings are retained as the review snapshot.

## Outcome

Home now separates published forecast availability from historical report frequency, uses the upcoming three local dates for Friday Harbor weather, preserves unavailable data states, and opens the camera list directly. The mobile header retains the wordmark, the overlapping badges and scrolling ribbon are removed, and the hero is shorter. The existing imagery, colors, planning flow, and shared navigation remain the visual foundation.

The repository has a sensible top-level feature layout and useful tests, but its largest components still mix too many responsibilities. There is dead exported code and stale styling; no clearly orphaned application module was found after accounting for Vite's worker import. Data-loader recovery deserves higher priority than broad cosmetic rearrangement.

## Scope and evidence

This checkout is a static Vite/React SPA. There is no separately deployed API server or Python package here. The backend scope was therefore browser data access, packaged forecast/data contracts, raster-generation tooling, build scripts, and deployment workflows. The upstream OrcaCast modeling repository was not audited.

Reviewed imports/exports using TypeScript AST traversal, runtime reachability from `src/main.tsx`, source/test references, npm scripts, CI/deployment references, data loaders, and the largest components. Vite's `surfaceRasterWorker?worker` import was checked manually to avoid a false dead-file result. Existing deleted analyst/UI files and unrelated dirty changes were already present before this task and were preserved.

## Implemented changes

- Split home data presentation into `HomeForecast`, `HomeSeasonality`, and `HomeWeather`; loading/retry state lives in `useHomeResource`, and data access lives in `homeData`. HomePage decreased from 598 to 294 lines.
- Forecast availability is checked against the default Southern Resident model's periods and H6 manifest. Dates are shown explicitly; unavailable and unknown remain distinct. This is a publication check, not a promise that an individual forecast request will succeed.
- Fixed the shared period loader: an explicit manifest with no files for a resolution now returns no periods rather than advertising all periods. Home uses strict manifest checking. Watch shows its recoverable error view when no periods exist, instead of waiting indefinitely.
- Removed suitability claims inferred solely from historical report counts. Added the historical year range, reporting-effort limitation, and an accessible exact-count disclosure. Empty/failed data does not draw a populated chart; genuine zero-count bars are hidden.
- Weather uses today and the next two dates in America/Los_Angeles, ignores invalid/stale timestamps, labels missing observations unavailable, and names the location, units, and provider. Replaced the misleading detailed-conditions link with source attribution.
- Removed static region ranking numbers and identical region-row navigation; an accurately named forecast-map link remains. The field-guide link now describes preview content.
- Added `/watch?view=cameras`: the camera list and markers open on arrival, including narrow screens, without intercepting that explicit action with the welcome modal.
- Generated `seasonal-summary.json`: 11,498 bytes instead of fetching the 1,414,669-byte spatial payload on home, a 99.19% reduction for this particular uncompressed data request. This is not a measured page-speed or total-bundle improvement. `data:home`, predev/prebuild generation, and validation freshness checks keep the artifact reproducible.
- Removed obsolete home forecast-card, weather-strip, badge, ribbon, and activity-cue CSS selectors associated with removed markup. Other styling cleanup remains incremental.

## Remaining backend findings

### P2 — Failed reference-data requests stay cached for the session

`loadOrcasoundHydrophonePayload`, `loadPoiDataBundle`, and `loadWebcamPayload` use `promise ??= fetch...` without clearing the promise on rejection. After a transient failure, later calls receive the same rejected promise rather than trying the network again. An isolated execution of the actual transpiled hydrophone module with a failing fetch counted one request after two calls. The other two loaders have the same source pattern.

Recommendation: clear only the matching in-flight promise on failure, use the shared bounded fetch client, and return explicit reference-data availability to consumers. Preserve successful-result caching and concurrent request deduplication. This broader recovery change was reviewed, not implemented.

- [src/shared/data/orcasoundHydrophones.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/orcasoundHydrophones.ts:57)
- [src/features/locations/poiData.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/features/locations/poiData.ts:192)
- [src/shared/data/webcams.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/webcams.ts:224)

### P2 — A POI failure can suppress otherwise working cameras

Watch loads webcams and POIs through one `Promise.all`; camera assignment occurs only after both resolve. A POI outage therefore discards successful webcam results. Planner already uses `Promise.allSettled` for independent resources. Extract a shared reference-data hook that can show webcams without optional POI enrichment, reports partial availability, and retries only failed resources.

[src/pages/WatchPage/WatchPageLayout.tsx](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/pages/WatchPage/WatchPageLayout.tsx:329)

[src/features/planner/hooks/usePlannerReferenceData.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/features/planner/hooks/usePlannerReferenceData.ts:37)

### P2 — Early data requests can lock in an empty version token

Metadata is intentionally primed after first render. If `getDataVersionToken()` runs before it resolves and no build ID is injected, it stores the empty fallback permanently; `loadDataMeta()` only assigns the token if it is still null. With force-cache data requests this weakens refresh guarantees. A build ID limits this concern, so the impact depends on launch configuration. This was confirmed by control-flow inspection, not a browser cache reproduction.

Recommendation: avoid memoizing the unresolved empty token, or explicitly invalidate relevant caches when metadata supplies a version. Keep metadata failure independent from page rendering.

[src/shared/data/meta.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/meta.ts:54)

### P3 — Validation has multiple owners

Runtime Zod contracts live in `shared/data/validation.ts`, while `scripts/validate-data.mjs` defines another set of period, forecast, and location checks. Historical normalization has its own permissive aliases and fallbacks. Differences can let a payload pass one gate and fail another. The new home summary has a narrow generator check and runtime contract; it does not replace upstream validation.

Recommendation: factor environment-independent schemas into a contract module usable by runtime and Node scripts; keep filesystem existence, raster coverage, and UI normalization checks in their respective layers. Preserve explicit unknown/zero distinctions.

[src/shared/data/validation.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/validation.ts:1)

[scripts/validate-data.mjs](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/scripts/validate-data.mjs:1)

## Dead-code inventory

The following 16 exported helpers have no identifier consumers in the current source/test tree; repository reference searches confirmed the main removal candidates. They were not deleted as part of the home changes. Test-reset helpers may be intentional testing hooks, and attribution helpers should be evaluated together with whether attribution is actually surfaced. Dead exports are maintenance overhead; bundler tree shaking may already remove them from production JavaScript.

| File                                                                                                                                                         | Export candidates                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [src/features/locations/poiData.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/features/locations/poiData.ts:201)                        | `resetPoiDataCacheForTests`                                                |
| [src/features/planner/model/plannerDistance.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/features/planner/model/plannerDistance.ts:35) | `formatTravelRangeLabel`                                                   |
| [src/shared/config/dataPaths.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/config/dataPaths.ts:43)                               | `getLatestForecastPath`, `getActualsPathForPeriod`, `getShapPathForPeriod` |
| [src/shared/data/forecastIO.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/forecastIO.ts:309)                                | `loadForecastModelIds`, `countNonZero`                                     |
| [src/shared/data/orcasoundHydrophones.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/orcasoundHydrophones.ts:62)             | `loadOrcasoundHydrophones`, `resetOrcasoundHydrophonesCacheForTests`       |
| [src/shared/data/tripPlanner.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/tripPlanner.ts:118)                              | `buildTripPlannerRange`                                                    |
| [src/shared/data/viewingSpotPhotos.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/data/viewingSpotPhotos.ts:139)                  | `getSpotPhotoAttribution`                                                  |
| [src/shared/geo/gridOverlay.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/geo/gridOverlay.ts:2226)                               | `updateGridFillColor`                                                      |
| [src/shared/geo/palettes.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/geo/palettes.ts:139)                                      | `getPalette`, `getViewabilityPaletteOrDefault`                             |
| [src/shared/time/forecastPeriodToIsoWeek.ts](/Users/tylerstevenson/Documents/Code_Repos/OrcaCast_Public/src/shared/time/forecastPeriodToIsoWeek.ts:32)       | `forecastPeriodToIsoWeek`, `forecastPeriodToIsoWeekYear`                   |

No general-purpose module deletion is recommended from filename matching alone. `surfaceRasterWorker.ts` is actively instantiated through a Vite worker import. The raster-generation Python script and Cloudflare deployment helper are reachable through npm/workflow commands. Already deleted files in the working tree are not new cleanup findings.

## Organization and component clarity

The `app / pages / features / shared` split is useful. Route metadata is centralized, route bundles are lazy-loaded, storage access has a shared wrapper, and the map workspace has shared presentation components. CI includes type checks, tests, data/asset contracts, build budgets, secret-pattern checks, immutable artifact checksums, staging tests, and rollback wiring. Remote deployment behavior was inspected, not executed.

The main structural problem is responsibility size:

| Module                   | Approximate lines | Suggested boundary                                                                                      |
| ------------------------ | ----------------: | ------------------------------------------------------------------------------------------------------- |
| PlanPage.tsx             |             3,218 | Page composition; separate trip state, map binding, media selection, and itinerary/export orchestration |
| ForecastMap.tsx          |             2,736 | Map lifecycle; separate source/layer management, event binding, and overlay controllers                 |
| gridOverlay.ts           |             2,248 | Split vector grid operations, raster/tile rendering, worker lifecycle, and caches                       |
| WatchPageLayout.tsx      |             1,283 | Separate reference data, camera/hydrophone state, forecast loading UI, and itinerary export             |
| SuggestedPlacesPanel.tsx |               810 | Share the panel frame while separating places, cameras, hydrophones, and details                        |

Lines alone are not a defect: these modules mix state, I/O, rendering, and domain decisions, making regressions harder to isolate. Avoid a wholesale rewrite. Extract one coherent responsibility with behavioral tests at a time. `useWatchPageController` is a useful start, but the layout still owns substantial data and export logic. Some shared modules import feature-owned types (`webcams.ts`, `MediaLocationDetail.tsx`); move the shared media contract to a neutral location or move the related shared components into the media feature.

Home's new components are clearer: each presents one signal, each data request can fail independently, and the page composes sections. The CSS still contains layered legacy rules; removing all style duplication should be a separate visually tested cleanup rather than an automatic selector sweep.

## Recommended next work

1. Repair rejected-promise caches and allow independent camera/POI loading.
2. Remove verified unused helpers in a focused cleanup with type checks and regression tests.
3. Extract Planner media/itinerary orchestration and the equivalent Watch logic into shared feature hooks.
4. Consolidate runtime/build data contracts and version-token lifecycle.
5. Split map rendering subsystems only after those boundaries are covered by behavior tests.

## Validation

- 49 unit tests and 39 component tests passed, including new weather/date/empty/error/retry and manifest-coverage regressions.
- TypeScript, lint, production build and bundle budget, format check, packaged data validation, asset validation, build-secret-pattern check, and repository artifact check passed.
- Browser inspected at 1440×1000 and 390×844. Confirmed visible mobile branding, no horizontal document overflow in measured states, dated forecast availability, separate seasonality, live Friday Harbor weather, and direct camera-list entry. Browser error log was empty at inspection.
- No full automated browser suite, cross-browser/device matrix, Lighthouse measurement, screen-reader compliance audit, live camera playback acceptance, upstream model execution, or deployment was performed.
- The backend inventory is a code review with targeted reproductions, not a proof that every possible unused export or runtime defect has been found.

## Screenshots

![Updated desktop home](/Users/tylerstevenson/.codex/visualizations/2026/09/13/01a09a97-39e2-7140-8435-0d7bd6b4d9bd/home-improvements/desktop.png)

![Updated mobile home](/Users/tylerstevenson/.codex/visualizations/2026/09/13/01a09a97-39e2-7140-8435-0d7bd6b4d9bd/home-improvements/mobile.png)

![Updated forecast and seasonal cards](/Users/tylerstevenson/.codex/visualizations/2026/09/13/01a09a97-39e2-7140-8435-0d7bd6b4d9bd/home-improvements/cards.png)
