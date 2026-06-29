from __future__ import annotations

import geopandas as gpd

try:
    from shapely.validation import make_valid as _make_valid
except Exception:  # pragma: no cover - shapely < 2.0
    _make_valid = None


def _safe_make_valid(geom):
    if geom is None:
        return None
    if _make_valid:
        return _make_valid(geom)
    try:
        return geom.buffer(0)
    except Exception:
        return geom


def load_kde_bands_geojson(path: str) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326", allow_override=True)
    gdf["geometry"] = gdf.geometry.apply(_safe_make_valid)
    if "band_index" not in gdf.columns and "bin" in gdf.columns:
        gdf["band_index"] = gdf["bin"]
    if "color" not in gdf.columns and "fill" in gdf.columns:
        gdf["color"] = gdf["fill"]
    if "band_index" in gdf.columns:
        gdf = gdf.sort_values("band_index").reset_index(drop=True)
    return gdf
