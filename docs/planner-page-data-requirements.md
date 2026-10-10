# Planner Page Data Requirements

This document inventories the data the planner page depends on, including:

- external files the page fetches
- required and optional fields in those files
- derived data shapes used inside the page
- hard-coded values and fallbacks embedded in the page code

Primary implementation files:

- `src/pages/PlanPage/PlanPage.tsx`
- `src/shared/data/tripPlanner.ts`
- `src/shared/data/plannerBaseLocations.ts`
- `src/features/watch/hooks/useSuggestedPlaces.ts`
- `src/features/locations/poiData.ts`
- `src/shared/data/viewingSpotPhotos.ts`

## 1. Planner page inputs at a glance

The planner page needs six real data sources:

1. Base locations
   - File: `public/data/places/base_locations.json`
   - Used for the trip form dropdown and for the planner base marker on the map.

2. Historical trip occurrence by H3 resolution
   - Files:
     - `public/data/trip_planner/H4_HISTORICAL_DOY.json`
     - `public/data/trip_planner/H5_HISTORICAL_DOY.json`
     - `public/data/trip_planner/H6_HISTORICAL_DOY.json`
   - Used to build:
     - map cell values for the selected trip window
     - the seasonal histogram
     - the "Typical activity" insight

3. Historical smoothed sightings by week of year
   - Directory: `public/data/week_of_year_agg_history_smooth/srkw`
   - Used only by the Planner's **Smooth** map view.
   - The selected date range is split into ISO weeks and the corresponding
     GeoTIFFs are combined in proportion to the number of selected days in
     each week.

4. Places of interest
   - File: `public/data/places_of_interest.json`
   - Used to rank and display recommended viewing spots.

5. Webcam inventory
   - File: `public/data/webcams.json`
   - Used by the Planner camera layer and the This Week Watch panel.
   - Contains grouped sites; each site can expose multiple external camera pages.

6. Viewing spot photo manifest
   - File: `public/data/places/viewing_spot_photos.json`
   - Used to override map-preview thumbnails with approved photos and attribution metadata.

The planner page also depends on one non-planner shared data source:

7. Grid geometry by H3 resolution
   - Files:
     - `public/data/grids/H4.geojson`
     - `public/data/grids/H5.geojson`
     - `public/data/grids/H6.geojson`
   - Used by `useSuggestedPlaces()` to compute POI proximity scores against the selected planner cell values.

## 2. Page state the user supplies

The planner form submits this shape:

```ts
type TripPlanSelection = {
  city: string;
  arrivalDate: string;      // ISO date, YYYY-MM-DD
  departureDate: string;    // ISO date, YYYY-MM-DD
  maxTravelDistanceMiles?: number;
};
```

Validation rules:

- `city` must exactly match one of the names loaded from `base_locations.json`
- `arrivalDate` and `departureDate` must both be valid ISO dates
- `departureDate` must be on or after `arrivalDate`
- `maxTravelDistanceMiles` is optional and only kept when it parses to a finite positive number

The page stores form/session state in `sessionStorage` under these hard-coded keys:

- `orcacast.planner.selection`
- `orcacast.planner.open`
- `orcacast.planner.draft`
- `orcacast.planner.recommended-places`

## 3. External file contracts

### 3.1 Base locations

Loader: `src/shared/data/plannerBaseLocations.ts`

Accepted shape:

```ts
type PlannerBaseLocation = {
  name: string;
  latitude: number;
  longitude: number;
};
```

Requirements:

- top-level JSON must be an array
- every usable item must have:
  - `name` as string
  - `latitude` as finite number
  - `longitude` as finite number

Current file:

- `public/data/places/base_locations.json`
- current count: 6

Current examples:

```json
{ "name": "Friday Harbor, WA", "latitude": 48.534266, "longitude": -123.017124 }
{ "name": "Victoria, BC", "latitude": 48.428421, "longitude": -123.365646 }
```

Behavior tied to this file:

- if the current selected city is not in the loaded `name` set, the planner selection is cleared
- the form dropdown only offers values from this file
- the active base location marker uses these coordinates directly

Fetch path candidates are hard-coded as:

- `${BASE_URL}data/places/base_locations.json`
- `/data/places/base_locations.json`
- `data/places/base_locations.json`

### 3.2 Historical trip occurrence

Loader: `src/shared/data/tripPlanner.ts`

Normalized shape consumed by the planner:

```ts
type TripPlannerOccurrencePayload = {
  rows: Array<{
    h3: string;
    day_of_year: number;
    count: number;
  }>;
  histogram: Array<{
    day_of_year: number;
    count: number;
  }>;
  year_min?: number;
  year_max?: number;
  source?: string;
};
```

The raw file is flexible. The loader accepts these aliases:

- H3 cell id:
  - `h3`
  - `H3_INDEX`
  - `h3_index`
- day-of-year:
  - `day_of_year`
  - `doy`
- count:
  - `count`
  - `sightings`
  - `value`

Requirements:

- `rows` should represent per-H3-cell per-day historical counts
- every usable row needs:
  - a non-empty H3 id
  - a numeric day-of-year
  - a numeric count
- `histogram` is optional
  - if omitted, the page derives a 366-day histogram by summing `rows`

Current files:

- `public/data/trip_planner/H4_HISTORICAL_DOY.json`
- `public/data/trip_planner/H5_HISTORICAL_DOY.json`
- `public/data/trip_planner/H6_HISTORICAL_DOY.json`

Current observed H4 payload characteristics:

- top-level keys: `ecotype`, `h3_resolution`, `histogram`, `rows`, `source`, `year_max`, `year_min`
- `rows.length = 2994`
- `histogram.length = 366`
- sample row:

```json
{ "h3": "8428d0bffffffff", "day_of_year": 1, "count": 11 }
```

- sample histogram bin:

```json
{ "day_of_year": 1, "count": 79 }
```

- `year_min = 1980`
- `year_max = 2026`
- `source = "SIGHTINGS_DATA"`

How the planner uses this payload:

- filters `rows` to only the selected trip day-of-year window
- sums counts by H3 cell into:

```ts
type TripPlannerOccurrenceResult = {
  values: Record<string, number>;  // h3 -> aggregated count for selected trip window
  histogram: TripPlannerHistogramBin[];
  selectedCount: number;           // total counts across selected trip window
  activeCells: number;             // cells with positive count
  yearMin?: number;
  yearMax?: number;
  source?: string;
};
```

- `values` drives the planner map color overlay
- `histogram` drives the weekly seasonal bar chart
- `selectedCount` feeds the "Typical activity" label

Fetch path candidates are hard-coded as:

- `${BASE_URL}data/trip_planner/${resolution}_HISTORICAL_DOY.json`
- `${BASE_URL}data/trip_planner/${resolution}_historical_doy.json`
- `${BASE_URL}data/historical_occurrence/${resolution}_HISTORICAL_DOY.json`

### 3.3 Historical smoothed sightings

Source builder: `src/features/planner/model/historicalSmooth.ts`

Raster renderer: `src/shared/geo/gridOverlay.ts`

Runtime files:

- `public/data/week_of_year_agg_history_smooth/manifest.json`
- `public/data/week_of_year_agg_history_smooth/periods.json`
- `public/data/week_of_year_agg_history_smooth/srkw/week_01.tif` through
  `week_53.tif`

The Planner currently uses the SRKW set because its historical H4-H6
occurrence layers, activity score, and recommended-place ranking are SRKW
data. The same source builder accepts `transient` so a future Planner ecotype
selector can switch every historical layer together instead of mixing
ecotypes.

The date window is inclusive. Each selected calendar day contributes to its
ISO week, so a ten-day selection containing seven days from week 27 and three
days from week 28 produces weights of `0.7` and `0.3`. If a range spans years,
days assigned to the same ISO week are accumulated into one weight. The
weighted numeric TIFF values are combined first, then recolored with the
currently selected Planner palette.

This path is deliberately limited to the Planner's **Smooth** view:

- **Smooth** is the Planner's initial surface mode.
- **Hex grid**, scoring, charting, and recommendations continue to use the
  existing historical trip-occurrence payloads.
- This Week continues to use its forecast-specific smoothed raster.
- The PNG files are packaged previews; the browser aggregates the numeric TIFF
  files.
- If a weighted TIFF cannot be loaded, the map falls back to the existing
  generated surface so the Planner remains usable.

### 3.4 Places of interest

Loader: `src/features/locations/poiData.ts`

The loader accepts multiple top-level formats:

- array of plain objects
- object with `items`
- GeoJSON-like object with `features`

Normalized shape:

```ts
type PublicPoi = {
  type: "Park" | "Marina" | "Ferry" | "Other";
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  reason?: string;
  imageUrl?: string;
  scoreBoost?: number;
  hasLiveFeed?: boolean;
  hasHydrophone?: boolean;
};
```

Field mapping rules:

- `type` comes from `type` or `category`
- `reason` comes from `reason` or `description`
- `imageUrl` comes from `imageUrl` or `image_url`
- `hasLiveFeed` is truthy if any of these are present/truthy:
  - `hasLiveFeed`
  - `liveCameraUrl`
  - `live_feed_url`
- `hasHydrophone` is truthy if any of these are present/truthy:
  - `hasHydrophone`
  - `hydrophoneUrl`
  - `hydrophone_url`

Requirements for a POI to survive normalization:

- normalized `type` must not be `Other`
- `name` must be non-empty
- `latitude` and `longitude` must be finite

Current file:

- `public/data/places_of_interest.json`
- current top-level type: object
- current item count: 365

Current example:

```json
{ "type": "Ferry", "name": "Anacortes", "latitude": 48.506732042786275, "longitude": -122.67809000579622 }
```

How the planner uses POIs:

- all ranking starts from these coordinates
- the planner does not invent any POI coordinates in code
- POIs are deduped by:
  - normalized type
  - normalized name
  - latitude to 6 decimals
  - longitude to 6 decimals
- POIs can be filtered by selected base-location radius before ranking
- POIs are scored against the selected trip’s aggregated H3 values

### 3.5 Webcam inventory

Loader: `src/shared/data/webcams.ts`

Accepted normalized shape:

```ts
type WebcamPayload = {
  version: string;
  updatedAt: string;
  items: WebcamSite[];
};

type WebcamSite = {
  id: string;
  name: string;
  region: string;
  locality: string;
  waterbody: string;
  latitude: number;
  longitude: number;
  coordinateQuality: string;
  feeds: WebcamFeed[];
};
```

The packaged inventory contains 58 Tier 1–2 feeds grouped into 48 map sites.
Camera status is static verification metadata, not a real-time health claim.
The app links to operator pages and does not embed feeds or reuse thumbnails.

### 3.6 Viewing spot photo manifest

Loader: `src/shared/data/viewingSpotPhotos.ts`

Accepted normalized shape:

```ts
type ViewingSpotPhoto = {
  spotId: string;
  imageSrc?: string;
  alt: string;
  status: "missing" | "candidate" | "approved";
  title?: string;
  creator?: string;
  sourceName?: string;
  sourceUrl?: string;
  license?: "public_domain" | "cc0" | "cc_by_4_0" | "cc_by_3_0" | "cc_by_sa_4_0" | "unsplash" | "pexels";
  licenseUrl?: string;
  focalPoint?: string;
  notes?: string;
};

type ViewingSpotPhotoManifest = Record<string, ViewingSpotPhoto>;
```

Requirements:

- top-level JSON must be an object
- each entry is keyed by `spotId`
- `status` must be one of:
  - `missing`
  - `candidate`
  - `approved`
- `alt` is required for valid normalized entries

Current file:

- `public/data/places/viewing_spot_photos.json`
- current entry count: 16
- current status counts:
  - `approved`: 1
  - `missing`: 15

Planner behavior:

- if a place has an approved manifest entry with `imageSrc`, that image is used
- otherwise the page falls back to a map-captured preview blob
- if neither exists, the UI shows a placeholder icon

Fetch path candidates are hard-coded as:

- `${BASE_URL}data/places/viewing_spot_photos.json`
- `/data/places/viewing_spot_photos.json`
- `data/places/viewing_spot_photos.json`

### 3.7 Grid geometry

Loader path source: `src/shared/config/dataPaths.ts`

Required files:

- `public/data/grids/H4.geojson`
- `public/data/grids/H5.geojson`
- `public/data/grids/H6.geojson`

Why the planner needs them:

- `useSuggestedPlaces()` loads the selected grid
- it computes a center point for each grid feature
- it joins planner `values[h3]` onto those grid features
- it scores nearby POIs using those cell centers

Without grid geometry:

- the map itself may still render other layers
- but recommended viewing spot ranking cannot be computed

## 4. Derived planner outputs

### 4.1 Recommended places shape

The planner cards and planner map use this derived shape:

```ts
type SuggestedPlace = {
  id: string;
  spotId: string;
  name: string;
  region?: string;
  type: "Park" | "Marina" | "Ferry" | "Other";
  latitude: number;
  longitude: number;
  viewingPotential: "low" | "medium" | "high";
  score: number;
  reason: string;
  distanceFromBaseKm?: number;
  distanceToForecastSupportKm?: number;
  imageUrl?: string;
  hasLiveFeed?: boolean;
  hasHydrophone?: boolean;
};
```

Field origins:

- `id`
  - synthesized from normalized name + lat/lon rounded to 4 decimals
- `spotId`
  - normalized name, unless remapped by planner metadata
- `viewingPotential`
  - derived from normalized score thresholds
- `score`
  - mean of nearby planner cell values
- `reason`
  - POI file reason, else planner metadata reason, else generated fallback sentence
- `distanceFromBaseKm`
  - direct haversine distance from the selected trip base to the POI
- `distanceToForecastSupportKm`
  - distance from the POI to the nearest modeled forecast cell, retained only as ranking provenance

### 4.2 Seasonal chart data

The chart uses weekly bars derived from the 366-day histogram:

- always 53 week buckets
- day-of-year values are clamped to `1..366`
- month labels are not read from data; they are hard-coded by week index

### 4.3 "Trip insights" data

`Typical activity` is derived from:

- `selectedCount / maxWeeklyBarCount`

`Most active waters` is derived from:

- the first two unique `region` values from recommended places
- if none exist, the hard-coded fallback string is used:
  - `San Juan Channel, Haro Strait`

## 5. Hard-coded business rules and literals in code

These values affect planner behavior even if no JSON changes.

### 5.1 Recommendation and scoring rules

From `src/features/watch/hooks/useSuggestedPlaces.ts`:

- `TOP_LOCATION_FRACTION = 0.05`
  - default recommendation set is top 5% of eligible POIs
- `POI_SCORE_RADIUS_KM = 16.0934`
  - each POI score uses planner cells within 10 miles
- `DEFAULT_RECOMMENDATION_RADIUS_MILES = 175`
  - used when the user leaves max travel distance blank
- `MILES_TO_KM = 1.609344`
- viewing potential thresholds:
  - `>= 0.66` => `high`
  - `>= 0.34` => `medium`
  - else => `low`

The planner page overrides the top-5% rule with a hard cap:

- `DEFAULT_RECOMMENDED_SPOTS_COUNT = 25`

That means the actual display target is:

- top 25 places, when at least 25 eligible places exist
- otherwise however many eligible places remain

### 5.2 Embedded POI metadata

These normalized POI names currently have hard-coded metadata in `PLANNER_POI_METADATA`:

- `lime-kiln-point-state-park`
  - reason: `Classic shore-based spot with frequent sightings.`
  - `scoreBoost: 0.22`
- `lime-kiln-point`
  - `photoSpotId: lime-kiln-point-state-park`
- `fort-worden-state-park`
  - reason: `Broad views with nearby active waters.`
  - `scoreBoost: 0.12`
- `alki-beach`
  - reason: `Accessible shoreline with wide views.`
  - `scoreBoost: 0.02`
- `bush-point`
  - reason: `Peaceful viewpoint near active waters.`
  - `scoreBoost: 0.06`
- `blind-island`
  - reason: `Close to strong orca corridors.`
  - `scoreBoost: 0.18`

Important note:

- the current ranking code preserves `scoreBoost` on the POI object
- but the displayed/ranked score is based on mean nearby planner cell score
- `scoreBoost` is not currently applied in the scoring formula in this file

### 5.3 Activity labels

From `computeActivityLabel()` in `PlanPage.tsx`:

- if `selectedCount / maxBar >= 0.72` => `High`
- if `>= 0.48` => `Medium–High`
- if `>= 0.26` => `Medium`
- else => `Low`

### 5.4 Legend and palette behavior

Hard-coded legend labels:

- `Very High`
- `High`
- `Medium`
- `Low`
- `Very Low`

Hard-coded fallback legend colors when a palette is empty:

- `#08364F`
- `#0B718D`
- `#278AA2`
- `#8EB5BD`
- `#D7E1DF`

Hard-coded legend sampling stops:

- when `colorNoData = on`: `[1, 0.8, 0.6, 0.4, 0.2, 0]`, then first 5 colors are used
- when `colorNoData = off`: `[1, 0.75, 0.5, 0.25, 0]`

### 5.5 Histogram / calendar rules

Hard-coded chart structure:

- 53 weekly buckets
- 366-day year assumption
- month labels anchored to week indexes:
  - `0 -> Jan`
  - `4 -> Feb`
  - `8 -> Mar`
  - `13 -> Apr`
  - `17 -> May`
  - `21 -> Jun`
  - `26 -> Jul`
  - `30 -> Aug`
  - `35 -> Sep`
  - `39 -> Oct`
  - `44 -> Nov`
  - `48 -> Dec`

### 5.6 Map preview capture values

Per-place preview thumbnails are generated from the live map with:

- `zoom: 11.6`
- `width: 340`
- `height: 200`

### 5.7 Map behavior on planner page

Planner map props are hard-coded to:

- `periods: []`
- `hotspotsEnabled: false`
- `hotspotMode: "modeled"`
- `hotspotPercentile: 1`
- `expectedActivityHotspotCellCount: null`
- `showLegendControl: false`

The planner still passes these data-driven props:

- `externalValues`
- `forecastOverlayEnabled`
- `suggestedPlaces`
- `selectedPlaceId`
- `baseLocation`
- `showTripHotspotMarkers`

### 5.8 Text fallbacks and labels

Hard-coded fallbacks used directly in the page:

- base city summary fallback: `Base location`
- trip date prompt fallback: `Choose dates`
- place region fallback on cards: `Salish Sea`
- top waters fallback: `San Juan Channel, Haro Strait`
- form validation error:
  - `Choose a base location from the available list.`
  - `Departure must be on or after arrival.`
- loading banner:
  - `Loading historical sightings and trip recommendations…`
- generic error fallback:
  - `Planner results are unavailable.`

## 6. What is actually required vs optional

### Strictly required for core planner usefulness

- `base_locations.json`
- selected-resolution trip occurrence JSON
- selected-resolution grid GeoJSON
- `places_of_interest.json`

Without any of those, the planner loses a core capability:

- no base locations => user cannot submit a valid plan
- no trip occurrence => no planner heatmap and no seasonal histogram
- no grid => no recommended-place ranking
- no POIs => no recommended-place ranking or POI overlays

### Optional but user-visible

- `viewing_spot_photos.json`
  - planner still works without it
  - cards fall back to map-generated previews or placeholder art
- optional POI fields:
  - `region`
  - `reason`
  - `imageUrl`
  - `hasLiveFeed`
  - `hasHydrophone`
- optional historical payload fields:
  - `histogram`
  - `year_min`
  - `year_max`
  - `source`

## 7. Minimal viable payload examples

### Base locations

```json
[
  {
    "name": "Friday Harbor, WA",
    "latitude": 48.534266,
    "longitude": -123.017124
  }
]
```

### Trip occurrence

```json
{
  "rows": [
    { "h3": "8428d0bffffffff", "day_of_year": 1, "count": 11 },
    { "h3": "8428d0bffffffff", "day_of_year": 2, "count": 8 }
  ],
  "histogram": [
    { "day_of_year": 1, "count": 79 },
    { "day_of_year": 2, "count": 64 }
  ],
  "year_min": 1980,
  "year_max": 2026,
  "source": "SIGHTINGS_DATA"
}
```

### Places of interest

```json
{
  "items": [
    {
      "type": "Park",
      "name": "Lime Kiln Point State Park",
      "latitude": 48.515,
      "longitude": -123.152,
      "region": "Haro Strait",
      "reason": "Classic shore-based spot with frequent sightings.",
      "hasLiveFeed": false,
      "hasHydrophone": true
    }
  ]
}
```

### Viewing spot photos

```json
{
  "lime-kiln-point-state-park": {
    "spotId": "lime-kiln-point-state-park",
    "imageSrc": "/spot-photos/lime-kiln-point-state-park.webp",
    "alt": "Lime Kiln Lighthouse overlooking the water at Lime Kiln Point State Park",
    "status": "approved",
    "sourceName": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lime_Kiln_Lighthouse_01.jpg",
    "license": "cc_by_sa_4_0"
  }
}
```

## 8. Short summary

The planner page is not driven by one payload. It is a composition of:

- user-entered trip dates and base location
- historical H3/day occurrence data
- H3 grid geometry
- POI coordinates and metadata
- optional photo overrides

The most important hard-coded product rules are:

- top 25 recommendations
- POI scoring within 10 miles
- default travel radius of 175 miles
- fixed activity-label thresholds
- fixed month tick mapping
- fixed legend labels and fallback colors
