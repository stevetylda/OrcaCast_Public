# OrcaCast Public

Public-facing subset of `OrcaCast_App` containing only the main forecast map and the about page.

## Included surface

- `/` for the forecast map
- `/about` for interpretation guidance and responsible-use information

## Included runtime data

- `public/data/activity`
- `public/data/expected_count`
- `public/data/forecasts`
- `public/data/grids`
- `public/data/last_week_sightings`
- `public/data/population`
- shared metadata files such as `public/data/meta.json`, `public/data/periods.json`, and `public/data/places_of_interest.json`

## Excluded from this repo copy

- viewability pages and datasets
- explainability pages and datasets
- data provenance page
- models and settings pages

## Local development

```bash
npm install
npm run dev
```

When multiple models are present, the app can surface a synthetic `consensus` option (mean by cell). Note: this is not a valid verified forecast but can be helpful to see where all models agree.

---

## 7. Temporal / Spatial / Evaluation Integrity

Guard against silent drift in these areas:

### Temporal integrity

- Ensure forecast period indexing remains ISO-week consistent
- Verify week-shift logic and period-fill logic do not leak future context
- Confirm train/eval assumptions in model documentation remain causal

### Spatial integrity

- Validate H3 level (`H4/H5/H6`) remains consistent across joins/overlays
- Confirm no CRS or coordinate-order drift when ingesting GeoJSON
- Re-check any pruning/smoothing process that could alter hotspot geometry

### Evaluation integrity

- Ensure metrics are computed on intended populations, at intended time windows
- Keep reporting-effort caveats explicit in interpretation text
- Treat “forecast likelihood” as relative ranking, not absolute probability of presence

### Reproducibility

- Prefer config-driven behavior over ad-hoc constants
- Keep file naming deterministic (`<year>_<week>_<Hn>`) for reproducible loads
- Document any behavior-changing config updates in changelogs/PR notes

---

## 8. Local Development

### Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm
- Python 3.10+ for the utility modules in `src/cli`, `src/explainability`, `src/io`, and `src/visualization`

### Frontend setup

```bash
npm install
```

### Run the app locally

```bash
npm run dev
```

### Python tooling

The Python utilities use the packaging metadata in `pyproject.toml`, so the supported setup path is editable install plus `python -m` execution.

#### Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

#### Install the utilities

```bash
python -m pip install -e .
```

#### Explore the CLI

Run the CLI either as a module or through the installed console script:

```bash
python -m src.cli --help
orcacast-cli --help
```

Current supported subcommands include:

```bash
python -m src.cli explainability build --help
```

#### Example: build explainability artifacts

```bash
python -m src.cli explainability build \
  --run-id latest \
  --model-id composite_linear_logit \
  --target sighting_likelihood \
  --resolution H4 \
  --source-shap-dir public/data/forecasts/latest/shap \
  --output-root artifacts/explainability
```

This writes artifact bundles under `artifacts/explainability/<run-id>/<model-id>/<target>/`.

#### Optional Makefile shortcuts

If you want short aliases for the most common Python commands:

```bash
make py-install
make py-cli-help
make py-exp-help
```

### Build the production bundle

```bash
npm run build
```

### Preview the production bundle

```bash
npm run preview
```

### Validate the codebase

```bash
npm run lint
npm run test
npm run typecheck
```

---

## 9. Configuration Reference

### `src/config/appConfig.ts`

Primary runtime configuration:

- default forecast period
- best/default model identifier
- KDE folder/run ids
- geometry-pruning and rendering thresholds

### `src/config/dataPaths.ts`

Path builders for:

- grids
- weekly forecasts
- actuals/sightings paths

### `vite.config.ts`

Build/serve base path is currently `/`. If deploying under a subpath, adjust `base` accordingly.

---

## 10. Testing and Validation Checklist

Before merging behavior-changing updates:

1. **Route sanity**: verify all routed pages load (`/`, `/about`, `/models`, `/explainability`, `/data`)
2. **Forecast load sanity**: select multiple periods/resolutions and confirm map layers render
3. **Overlay sanity**: toggle last-week sightings and KDE contours on/off
4. **Compare sanity**: test compare mode for at least one period pair and model pair
5. **Data integrity spot-check**: open one forecast JSON and validate H3 keys align with target grid
6. **Build/lint**: run `npm run build` and `npm run lint`

---

## 11. Deployment

### Cloudflare Pages
Explainability artifact builder CLI:

- `python3 -m src.cli explainability build --run-id ... --model-id ... --target ... --sample-n 50000 --top-k-interactions 50`

These are not required to run the frontend app, but can be used in preprocessing workflows.

## Deployment (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 18+

Because OrcaCast is an SPA, ensure host-level fallback routing is configured so deep links resolve to `index.html`.

---

## 12. Troubleshooting

### Blank map / missing layers

- Confirm required files exist for selected period/resolution
- Check browser console for GeoJSON or JSON parse errors
- Validate H3 keys and geometry properties are present

### Forecast selector populated but no rendered values

- Confirm matching `<year>_<week>_<Hn>.json` exists for each configured period
- Verify model id selection exists in multi-model payloads

### Inconsistent behavior between runs

- Re-check config defaults and local storage flags
- Verify data refresh did not silently remove a period or model

---

## 13. Project Structure

```text
src/
  App.tsx
  components/
    ForecastMap.tsx
    SideDrawer.tsx
    ToolDrawer.tsx
    ...
  config/
    appConfig.ts
    dataPaths.ts
    attribution.ts
  core/
    time/
  data/
    forecastIO.ts
    periods.ts
    expectedCount.ts
  features/
    models/
    analysis/
  map/
  pages/
    MapPage.tsx
    AboutPage.tsx
    ModelsPage.tsx
    ExplainabilityPage.tsx
    DataPage.tsx
    SettingsPage.tsx
  state/
    MapStateContext.tsx
    MenuContext.tsx
  tour/
```

---

## 14. Contributing Guidance

When making model/data-facing changes:

- Prefer minimal diffs that preserve behavior unless behavior change is intended
- Document whether outputs change and under what conditions
- Keep temporal/spatial assumptions explicit in code comments and PR notes
- Avoid broad refactors that complicate traceability for review

When changing UI-only behavior:

- Update screenshots under `docs/screenshots`
- Ensure route-level README gallery links remain valid

---

## 15. License / Credits

- Basemap and rendering acknowledgements are surfaced in the Data page.
- OrcaCast is intended for educational and planning use with wildlife-safe practices.
