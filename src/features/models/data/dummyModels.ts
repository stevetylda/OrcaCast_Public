export type ModelFamily = "baseline" | "composite" | "hybrid";

export type ModelRow = {
  key: string;
  label: string;
  value: string;
  hint?: string;
};

export type ModelInfo = {
  id: string;
  name: string;
  family: ModelFamily;
  tags: string[];
  hero: { label: string; value: string; hint?: string };
  rows: ModelRow[];
  blurb: string;
  ribbon?: string;
};

const ROW_LABELS: Record<string, string> = {
  precision_k: "Precision@20",
  recall_k: "Recall@20",
  ndcg_k: "NDCG@20",
  lift_k: "Lift@20",
  coverage: "Coverage",
  horizon: "Forecast horizon",
  train_window: "Training window",
  h3_res: "H3 resolution",
};

function makeRows(values: Record<string, string | { value: string; hint?: string }>): ModelRow[] {
  return Object.keys(ROW_LABELS).map((key) => {
    const entry = values[key];
    if (typeof entry === "string") {
      return { key, label: ROW_LABELS[key], value: entry };
    }
    return {
      key,
      label: ROW_LABELS[key],
      value: entry?.value ?? "–",
      hint: entry?.hint,
    };
  });
}

export const DUMMY_MODELS: ModelInfo[] = [
  {
    id: "st-neighbor-climatology",
    name: "Spatiotemporal Neighbor Climatology",
    family: "baseline",
    tags: ["SRKW", "weekly", "H5"],
    hero: { label: "NDCG@20", value: "0.412", hint: "Baseline seasonal lift" },
    rows: makeRows({
      precision_k: "0.29",
      recall_k: "0.33",
      ndcg_k: "0.41",
      lift_k: "1.12",
      coverage: "74%",
      horizon: "4 weeks",
      train_window: "18 months",
      h3_res: "H5",
    }),
    blurb:
      "Neighborhood climatology baseline trained on the last 18 months of seasonal patterns. It blends spatially adjacent cells with a rolling seasonal prior to smooth sparse signals.",
  },
  {
    id: "composite-linear-logit",
    name: "Composite Linear Logit",
    family: "composite",
    tags: ["r4", "biweekly", "H5"],
    hero: { label: "Precision@20", value: "0.62", hint: "Strong cold-start" },
    rows: makeRows({
      precision_k: "0.62",
      recall_k: "0.48",
      ndcg_k: "0.56",
      lift_k: "1.38",
      coverage: "82%",
      horizon: "6 weeks",
      train_window: "24 months",
      h3_res: "H5",
    }),
    blurb:
      "Composite logit trained on a 24‑month feature window with calibrated priors for cold‑start regions. Uses linear embeddings plus domain features to stabilize early precision.",
  },
  {
    id: "exp-smoothing",
    name: "Exponential Smoothing",
    family: "baseline",
    tags: ["weekly", "H4"],
    hero: { label: "Recall@20", value: "0.44", hint: "Seasonally stable" },
    rows: makeRows({
      precision_k: "0.38",
      recall_k: "0.44",
      ndcg_k: "0.47",
      lift_k: "1.21",
      coverage: "71%",
      horizon: "3 weeks",
      train_window: "12 months",
      h3_res: "H4",
    }),
    blurb:
      "Classic exponential smoothing trained on 12 months of weekly signals. Emphasizes stability and trend continuity for short horizons.",
  },
  {
    id: "rolling-mean-w13",
    name: "Rolling Mean (W13)",
    family: "baseline",
    tags: ["SRKW", "weekly", "H4"],
    hero: { label: "Lift@20", value: "1.18", hint: "Smooth trend" },
    rows: makeRows({
      precision_k: "0.31",
      recall_k: "0.39",
      ndcg_k: "0.43",
      lift_k: "1.18",
      coverage: "68%",
      horizon: "2 weeks",
      train_window: "13 weeks",
      h3_res: "H4",
    }),
    blurb:
      "13‑week rolling mean baseline trained on recent windowed averages. Good for short‑term trend smoothing with minimal lag.",
  },
  {
    id: "xgboost-meta-v2",
    name: "XGBoost Meta (v2)",
    family: "hybrid",
    tags: ["r4", "weekly", "H6"],
    hero: { label: "NDCG@20", value: "0.78", hint: "Top overall" },
    rows: makeRows({
      precision_k: "0.71",
      recall_k: "0.63",
      ndcg_k: "0.78",
      lift_k: "1.74",
      coverage: "89%",
      horizon: "8 weeks",
      train_window: "36 months",
      h3_res: "H6",
    }),
    blurb:
      "Hybrid stack with XGBoost meta‑learner trained across 36 months. Combines temporal, spatial, and event features for top‑line ranking performance.",
  },
  {
    id: "bayesian-hybrid",
    name: "Bayesian Hybrid Blend",
    family: "hybrid",
    tags: ["SRKW", "biweekly", "H5"],
    hero: { label: "Precision@20", value: "0.66", hint: "Balanced lift" },
    rows: makeRows({
      precision_k: "0.66",
      recall_k: "0.57",
      ndcg_k: "0.69",
      lift_k: "1.52",
      coverage: "85%",
      horizon: "6 weeks",
      train_window: "30 months",
      h3_res: "H5",
    }),
    blurb:
      "Bayesian ensemble trained on 30 months of history with uncertainty‑aware blending. Balances lift and recall for stable deployments.",
  },
  {
    id: "spatial-lag-ensemble",
    name: "Spatial Lag Ensemble",
    family: "composite",
    tags: ["weekly", "H6"],
    hero: { label: "Coverage", value: "93%", hint: "Wide spatial reach" },
    rows: makeRows({
      precision_k: "0.59",
      recall_k: "0.61",
      ndcg_k: "0.65",
      lift_k: "1.43",
      coverage: "93%",
      horizon: "5 weeks",
      train_window: "20 months",
      h3_res: "H6",
    }),
    blurb:
      "Ensemble with spatial‑lag features trained across 20 months. Optimized for coverage across adjacent cells and continuity of spatial patterns.",
  },
  {
    id: "kalman-surge",
    name: "Kalman Surge Filter",
    family: "composite",
    tags: ["r4", "daily", "H5"],
    hero: { label: "Recall@20", value: "0.59", hint: "Event-sensitive" },
    rows: makeRows({
      precision_k: "0.54",
      recall_k: "0.59",
      ndcg_k: "0.61",
      lift_k: "1.33",
      coverage: "80%",
      horizon: "10 days",
      train_window: "9 months",
      h3_res: "H5",
    }),
    blurb:
      "Kalman filter variant trained on daily signals for event spikes. Focuses on rapid recovery after surges with minimal lag.",
  },
  {
    id: "graphwave-forecast",
    name: "GraphWave Forecast",
    family: "hybrid",
    tags: ["SRKW", "weekly", "H6"],
    hero: { label: "Lift@20", value: "1.61", hint: "Network-aware" },
    rows: makeRows({
      precision_k: "0.68",
      recall_k: "0.58",
      ndcg_k: "0.73",
      lift_k: "1.61",
      coverage: "87%",
      horizon: "7 weeks",
      train_window: "28 months",
      h3_res: "H6",
    }),
    blurb:
      "Graph‑aware hybrid trained on 28 months with spatial network embeddings. Captures adjacency ripple effects for higher lift.",
  },
  {
    id: "seasonal-diffusion",
    name: "Seasonal Diffusion",
    family: "baseline",
    tags: ["weekly", "H5"],
    hero: { label: "NDCG@20", value: "0.52", hint: "Strong mid-season" },
    rows: makeRows({
      precision_k: "0.42",
      recall_k: "0.46",
      ndcg_k: "0.52",
      lift_k: "1.25",
      coverage: "77%",
      horizon: "4 weeks",
      train_window: "15 months",
      h3_res: "H5",
    }),
    blurb:
      "Diffusion baseline trained on 15 months of seasonal transitions. Smooths mid‑season volatility while preserving directional shifts.",
  },
  {
    id: "h3-cluster-gmm",
    name: "H3 Cluster GMM",
    family: "composite",
    tags: ["r4", "monthly", "H4"],
    hero: { label: "Coverage", value: "90%", hint: "Cluster stability" },
    rows: makeRows({
      precision_k: "0.51",
      recall_k: "0.55",
      ndcg_k: "0.60",
      lift_k: "1.29",
      coverage: "90%",
      horizon: "2 months",
      train_window: "18 months",
      h3_res: "H4",
    }),
    blurb:
      "Gaussian mixture model trained on 18 months of clustered H3 behavior. Prioritizes stability across cluster boundaries.",
  },
  {
    id: "meta-ensemble-v4",
    name: "Meta Ensemble (v4)",
    family: "hybrid",
    tags: ["SRKW", "weekly", "H6"],
    hero: { label: "Precision@20", value: "0.73", hint: "High confidence" },
    rows: makeRows({
      precision_k: "0.73",
      recall_k: "0.65",
      ndcg_k: "0.76",
      lift_k: "1.69",
      coverage: "88%",
      horizon: "6 weeks",
      train_window: "40 months",
      h3_res: "H6",
    }),
    blurb:
      "Meta ensemble trained across 40 months with diversified base learners. Optimized for consistent precision at top ranks.",
  },
];
