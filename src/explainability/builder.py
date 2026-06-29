from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class BuildConfig:
    run_id: str
    model_id: str
    target: str
    resolution: str
    sample_n: int
    top_k_interactions: int
    source_shap_dir: Path
    output_root: Path


def _feature_group(feature_name: str) -> str:
    lower = feature_name.lower()
    if any(token in lower for token in ("climat", "water", "temp", "season", "eras")):
        return "Environmental"
    if any(token in lower for token in ("lag", "rolling", "streak", "prior_period", "vector")):
        return "Temporal"
    if any(token in lower for token in ("shore", "distance", "spatial", "neighbor", "h3", "bathym")):
        return "Spatial"
    if any(token in lower for token in ("prey", "salmon", "fish")):
        return "Prey"
    if any(token in lower for token in ("human", "vessel", "traffic", "holiday")):
        return "Human"
    return "Other"


def _display_name(feature_name: str) -> str:
    cleaned = feature_name.replace("__", " ").replace("_", " ").strip()
    return re.sub(r"\s+", " ", cleaned).title()


def _week_to_iso(year: int, stat_week: int) -> str:
    return date.fromisocalendar(year, stat_week, 1).isoformat()


def _downsample_by_month(rows: list[dict[str, Any]], sample_n: int) -> list[dict[str, Any]]:
    if len(rows) <= sample_n:
        return rows

    monthly: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = str(row.get("time", ""))[:7]
        monthly[key].append(row)

    selected: list[dict[str, Any]] = []
    month_items = sorted(monthly.items(), key=lambda item: item[0])
    month_count = max(len(month_items), 1)
    per_month = max(math.floor(sample_n / month_count), 1)

    for _month, month_rows in month_items:
        selected.extend(month_rows[:per_month])

    if len(selected) < sample_n:
        remainder = [row for _month, month_rows in month_items for row in month_rows[per_month:]]
        selected.extend(remainder[: sample_n - len(selected)])

    return selected[:sample_n]


def _compute_global_importance(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    agg: dict[str, dict[str, Any]] = {}
    for row in rows:
        feature = str(row["feature_name"])
        value = float(row["shap_value"])
        item = agg.setdefault(feature, {"abs_sum": 0.0, "sum": 0.0, "n": 0, "vals": []})
        item["abs_sum"] += abs(value)
        item["sum"] += value
        item["n"] += 1
        item["vals"].append(abs(value))

    out: list[dict[str, Any]] = []
    for feature, values in agg.items():
        n = max(int(values["n"]), 1)
        abs_vals = sorted(values["vals"])
        p95_idx = int((len(abs_vals) - 1) * 0.95) if abs_vals else 0
        p95 = abs_vals[p95_idx] if abs_vals else 0.0
        out.append(
            {
                "feature_name": feature,
                "mean_abs_shap": values["abs_sum"] / n,
                "mean_shap": values["sum"] / n,
                "p95_abs_shap": p95,
            }
        )

    out.sort(key=lambda row: float(row["mean_abs_shap"]), reverse=True)
    return out


def merge_symmetric_interactions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    agg: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        a = str(row["feature_a"])
        b = str(row["feature_b"])
        if a <= b:
            key = (a, b)
        else:
            key = (b, a)
        item = agg.setdefault(key, {"feature_a": key[0], "feature_b": key[1], "sum": 0.0, "count": 0})
        item["sum"] += float(row["mean_abs_interaction"])
        item["count"] += 1

    merged = []
    for pair, values in agg.items():
        mean_val = values["sum"] / max(values["count"], 1)
        merged.append(
            {
                "feature_a": pair[0],
                "feature_b": pair[1],
                "mean_abs_interaction": mean_val,
                "rank": 0,
            }
        )
    merged.sort(key=lambda row: float(row["mean_abs_interaction"]), reverse=True)
    for idx, row in enumerate(merged, start=1):
        row["rank"] = idx
    return merged


def validate_artifact_schema(artifacts: dict[str, Any]) -> None:
    required_files = ["meta", "features", "shap_samples", "global_importance"]
    for key in required_files:
        if key not in artifacts:
            raise ValueError(f"Missing artifact payload: {key}")

    meta = artifacts["meta"]
    for field in ("run_id", "model_id", "target", "time_min", "time_max", "n_total"):
        if field not in meta:
            raise ValueError(f"meta missing required field: {field}")

    sample_rows = artifacts["shap_samples"]
    if not isinstance(sample_rows, list):
        raise ValueError("shap_samples must be a list")
    for row in sample_rows[:10]:
        for field in ("sample_id", "time", "feature_name", "shap_value"):
            if field not in row:
                raise ValueError(f"shap_samples row missing {field}")


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def build_explainability_artifacts(config: BuildConfig) -> dict[str, Any]:
    pattern = f"*_{config.resolution}_{config.model_id}_shap.json"
    files = sorted(config.source_shap_dir.glob(pattern))
    if not files:
        raise FileNotFoundError(f"No SHAP files found for pattern {pattern} in {config.source_shap_dir}")

    shap_rows: list[dict[str, Any]] = []
    feature_names: set[str] = set()

    for path in files:
        payload = _load_json(path)
        year = int(payload.get("year", 1970))
        stat_week = int(payload.get("stat_week", 1))
        time_value = _week_to_iso(year, stat_week)
        rows = payload.get("rows", [])

        for row in rows:
            sample_id = f"{year}-{stat_week:02d}-{row.get('h3', 'unknown')}"
            top_features = row.get("top_features", [])
            for feat in top_features:
                feature_name = str(feat.get("feature", ""))
                if not feature_name:
                    continue
                feature_names.add(feature_name)
                shap_rows.append(
                    {
                        "sample_id": sample_id,
                        "time": time_value,
                        "feature_name": feature_name,
                        "feature_value": None,
                        "shap_value": float(feat.get("phi_logit", 0.0)),
                        "weight": 1,
                    }
                )

    shap_rows = _downsample_by_month(shap_rows, config.sample_n)
    global_importance = _compute_global_importance(shap_rows)

    features = [
        {
            "feature_name": feature_name,
            "feature_group": _feature_group(feature_name),
            "display_name": _display_name(feature_name),
            "unit": None,
            "is_categorical": False,
        }
        for feature_name in sorted(feature_names)
    ]

    times = sorted({str(row["time"]) for row in shap_rows})
    meta = {
        "run_id": config.run_id,
        "model_id": config.model_id,
        "target": config.target,
        "resolution": config.resolution,
        "created_at": date.today().isoformat(),
        "time_min": times[0] if times else "",
        "time_max": times[-1] if times else "",
        "n_total": len({str(row["sample_id"]) for row in shap_rows}),
        "units_default": "logit",
        "supports_interactions": False,
        "feature_schema_version": "1.0.0",
    }

    artifacts = {
        "meta": meta,
        "features": features,
        "shap_samples": shap_rows,
        "global_importance": global_importance,
        "interaction_ranking": [],
        "interaction_samples": [],
    }

    validate_artifact_schema(artifacts)
    return artifacts


def write_artifacts(artifacts: dict[str, Any], config: BuildConfig) -> Path:
    out_dir = config.output_root / config.run_id / config.model_id / config.target
    out_dir.mkdir(parents=True, exist_ok=True)

    files = {
        "meta.json": artifacts["meta"],
        "features.json": artifacts["features"],
        "shap_samples.json": artifacts["shap_samples"],
        "global_importance.json": artifacts["global_importance"],
        "interaction_ranking.json": artifacts.get("interaction_ranking", []),
        "interaction_samples.json": artifacts.get("interaction_samples", []),
    }

    for filename, payload in files.items():
        with (out_dir / filename).open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)

    return out_dir


def build_command(args: argparse.Namespace) -> int:
    config = BuildConfig(
        run_id=args.run_id,
        model_id=args.model_id,
        target=args.target,
        resolution=args.resolution,
        sample_n=args.sample_n,
        top_k_interactions=args.top_k_interactions,
        source_shap_dir=Path(args.source_shap_dir),
        output_root=Path(args.output_root),
    )

    artifacts = build_explainability_artifacts(config)
    out_dir = write_artifacts(artifacts, config)
    print(f"Explainability artifacts written to {out_dir}")
    return 0


def register_build_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--resolution", default="H4")
    parser.add_argument("--sample-n", type=int, default=50000)
    parser.add_argument("--top-k-interactions", type=int, default=50)
    parser.add_argument("--source-shap-dir", default="public/data/forecasts/latest/shap")
    parser.add_argument("--output-root", default="artifacts/explainability")
    parser.set_defaults(func=build_command)
