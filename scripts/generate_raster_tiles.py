#!/usr/bin/env python3
"""Convert This Week smooth GeoTIFFs into static value-encoded XYZ tiles.

Each source raster produces one palette-independent tile pyramid. Values in
the inclusive range 0..1 are encoded into the red channel as bytes 1..255;
byte 0 is reserved for nodata. MapLibre decodes those values with a custom
``raster-dem`` source and colors them with the currently selected UI palette.

Requires GDAL's Python bindings and ``gdal2tiles.py``. The script deliberately
has no OrcaCast package imports so it can move into the publishing pipeline.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
osr.UseExceptions()

DATED_RASTER = re.compile(r"^\d{4}-\d{2}-\d{2}\.tif$")
NODATA_VALUE = -9999.0
TILE_ENCODING_VERSION = "red-byte-normalized-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-root",
        type=Path,
        default=Path("public/data/forecasts/latest/weekly"),
        help="Root containing <ecotype>/<model>/smoothed/*.tif",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=None,
        help="Output root; defaults to --input-root so tiles sit beside rasters",
    )
    parser.add_argument("--min-zoom", type=int, default=5)
    parser.add_argument("--max-zoom", type=int, default=9)
    parser.add_argument(
        "--processes",
        type=int,
        default=4,
        help="gdal2tiles worker processes",
    )
    parser.add_argument(
        "--max-tile-files",
        type=int,
        default=18_000,
        help="Fail if generated PNG tile count exceeds this deployment guardrail",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Replace each generated tiles directory before writing",
    )
    return parser.parse_args()


def wgs84_bounds(dataset: gdal.Dataset) -> list[float]:
    transform = dataset.GetGeoTransform()
    width = dataset.RasterXSize
    height = dataset.RasterYSize
    corners = [
        gdal.ApplyGeoTransform(transform, 0, 0),
        gdal.ApplyGeoTransform(transform, width, 0),
        gdal.ApplyGeoTransform(transform, width, height),
        gdal.ApplyGeoTransform(transform, 0, height),
    ]
    source = osr.SpatialReference()
    source.ImportFromWkt(dataset.GetProjection())
    target = osr.SpatialReference()
    target.ImportFromEPSG(4326)
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    converter = osr.CoordinateTransformation(source, target)
    lng_lats = [converter.TransformPoint(x, y) for x, y in corners]
    longitudes = [point[0] for point in lng_lats]
    latitudes = [point[1] for point in lng_lats]
    return [
        min(longitudes),
        min(latitudes),
        max(longitudes),
        max(latitudes),
    ]


def encode_value_raster(source_path: Path, destination_path: Path) -> list[float]:
    source = gdal.Open(str(source_path), gdal.GA_ReadOnly)
    if source is None:
        raise RuntimeError(f"Could not open {source_path}")
    values = source.GetRasterBand(1).ReadAsArray().astype(np.float32, copy=False)

    # Zero is a valid activity value. Only -9999/non-finite values are nodata.
    # Current legacy forecasts also carry their water/domain mask in the alpha
    # band of the companion PNG because their TIFF metadata still says nodata=0.
    valid = np.isfinite(values) & (values != NODATA_VALUE)
    companion_png = source_path.with_suffix(".png")
    if companion_png.exists():
        preview = gdal.Open(str(companion_png), gdal.GA_ReadOnly)
        if (
            preview is None
            or preview.RasterCount < 4
            or preview.RasterXSize != source.RasterXSize
            or preview.RasterYSize != source.RasterYSize
        ):
            raise RuntimeError(f"Companion PNG mask does not align with {source_path}")
        valid &= preview.GetRasterBand(4).ReadAsArray() > 0
        preview = None

    red = np.zeros(values.shape, dtype=np.uint8)
    red[valid] = (
        np.rint(np.clip(values[valid], 0.0, 1.0) * 254.0).astype(np.uint8) + 1
    )
    zero = np.zeros(values.shape, dtype=np.uint8)
    alpha = np.where(valid, 255, 0).astype(np.uint8)

    driver = gdal.GetDriverByName("GTiff")
    output = driver.Create(
        str(destination_path),
        source.RasterXSize,
        source.RasterYSize,
        4,
        gdal.GDT_Byte,
        options=["TILED=YES", "COMPRESS=DEFLATE", "PREDICTOR=2"],
    )
    if output is None:
        raise RuntimeError(f"Could not create {destination_path}")
    output.SetGeoTransform(source.GetGeoTransform())
    output.SetProjection(source.GetProjection())
    for index, (data, interpretation) in enumerate(
        (
            (red, gdal.GCI_RedBand),
            (zero, gdal.GCI_GreenBand),
            (zero, gdal.GCI_BlueBand),
            (alpha, gdal.GCI_AlphaBand),
        ),
        start=1,
    ):
        band = output.GetRasterBand(index)
        band.WriteArray(data)
        band.SetColorInterpretation(interpretation)
    output.FlushCache()
    output = None
    bounds = wgs84_bounds(source)
    source = None
    return bounds


def source_cache_key(source_path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(TILE_ENCODING_VERSION.encode("utf-8"))
    digest.update(source_path.read_bytes())
    companion_png = source_path.with_suffix(".png")
    if companion_png.exists():
        digest.update(companion_png.read_bytes())
    return digest.hexdigest()[:12]


def write_tilejson(
    directory: Path,
    *,
    tiles: str,
    bounds: list[float],
    min_zoom: int,
    max_zoom: int,
    source: str,
    cache_key: str,
) -> None:
    payload = {
        "tilejson": "3.0.0",
        "name": f"OrcaCast smooth activity values: {source}",
        "scheme": "xyz",
        "tiles": [tiles],
        "bounds": [round(value, 7) for value in bounds],
        "minzoom": min_zoom,
        "maxzoom": max_zoom,
        "tileSize": 256,
        "encoding": {
            "format": "png",
            "channel": "red",
            "nodataCode": 0,
            "valueCodeMin": 1,
            "valueCodeMax": 255,
            "decodedValue": "(red - 1) / 254",
            "sourceNodata": NODATA_VALUE,
            "version": TILE_ENCODING_VERSION,
        },
        "cacheKey": cache_key,
    }
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "tilejson.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def generate_tiles(
    source_path: Path,
    destination: Path,
    *,
    min_zoom: int,
    max_zoom: int,
    processes: int,
    clean: bool,
) -> dict[str, object]:
    if clean and destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="orcacast-raster-tiles-") as temp_dir:
        encoded_path = Path(temp_dir) / "encoded-values.tif"
        bounds = encode_value_raster(source_path, encoded_path)
        command = [
            "gdal2tiles.py",
            "--xyz",
            "--profile=mercator",
            f"--zoom={min_zoom}-{max_zoom}",
            "--resampling=bilinear",
            "--webviewer=none",
            "--no-kml",
            "--quiet",
            f"--processes={max(1, processes)}",
            str(encoded_path),
            str(destination),
        ]
        subprocess.run(command, check=True)

    cache_key = source_cache_key(source_path)
    write_tilejson(
        destination,
        tiles=f"./{{z}}/{{x}}/{{y}}.png?v={cache_key}",
        bounds=bounds,
        min_zoom=min_zoom,
        max_zoom=max_zoom,
        source=source_path.name,
        cache_key=cache_key,
    )
    tile_count = sum(1 for _ in destination.glob("*/*/*.png"))
    return {
        "periodStart": source_path.stem,
        "source": source_path.name,
        "tilejson": f"./{source_path.stem}/tilejson.json",
        "bounds": bounds,
        "tileCount": tile_count,
        "cacheKey": cache_key,
    }


def main() -> int:
    args = parse_args()
    if args.min_zoom < 0 or args.max_zoom < args.min_zoom:
        raise SystemExit("Invalid zoom range")
    input_root = args.input_root.resolve()
    output_root = (args.output_root or args.input_root).resolve()
    sources = sorted(
        path
        for path in input_root.glob("*/*/smoothed/*.tif")
        if DATED_RASTER.match(path.name)
    )
    if not sources:
        raise SystemExit(f"No dated smooth GeoTIFFs found below {input_root}")

    if args.clean:
        for source_path in sources:
            relative = source_path.relative_to(input_root)
            tiles_root = output_root / relative.parent / "tiles"
            if tiles_root.exists():
                shutil.rmtree(tiles_root)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    total_tiles = 0
    indexes: dict[Path, list[dict[str, object]]] = {}
    for source_path in sources:
        relative = source_path.relative_to(input_root)
        tiles_root = output_root / relative.parent / "tiles"
        destination = tiles_root / source_path.stem
        print(f"Tiling {relative} -> {destination.relative_to(output_root)}")
        item = generate_tiles(
            source_path,
            destination,
            min_zoom=args.min_zoom,
            max_zoom=args.max_zoom,
            processes=args.processes,
            clean=False,
        )
        total_tiles += int(item["tileCount"])
        if total_tiles > args.max_tile_files:
            raise SystemExit(
                f"Generated {total_tiles} PNGs, above --max-tile-files "
                f"{args.max_tile_files}"
            )
        indexes.setdefault(tiles_root, []).append(item)

    for tiles_root, items in indexes.items():
        items.sort(key=lambda item: str(item["periodStart"]))
        latest = max(items, key=lambda item: str(item["periodStart"]))
        write_tilejson(
            tiles_root / "latest",
            tiles=(
                f"../{latest['periodStart']}/{{z}}/{{x}}/{{y}}.png"
                f"?v={latest['cacheKey']}"
            ),
            bounds=list(latest["bounds"]),
            min_zoom=args.min_zoom,
            max_zoom=args.max_zoom,
            source=str(latest["source"]),
            cache_key=str(latest["cacheKey"]),
        )
        index = {
            "version": 1,
            "generatedAt": generated_at,
            "minzoom": args.min_zoom,
            "maxzoom": args.max_zoom,
            "encoding": TILE_ENCODING_VERSION,
            "items": items,
            "latest": str(latest["periodStart"]),
        }
        (tiles_root / "index.json").write_text(
            json.dumps(index, indent=2) + "\n", encoding="utf-8"
        )

    print(
        f"Generated {total_tiles} value PNG tiles from {len(sources)} rasters "
        f"across zooms {args.min_zoom}-{args.max_zoom}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
