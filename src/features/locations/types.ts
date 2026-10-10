export type ViewingPotential =
  "very-low" | "low" | "medium" | "high" | "very-high";

export type ViewingLocation = {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  liveCameraUrl?: string;
  hydrophoneUrl?: string;
};

export type WebcamStatus =
  | "verified-current"
  | "current-frame-verified"
  | "landing-verified"
  | "directory-current"
  | "seasonal"
  | "listed";

export type WebcamFeed = {
  id: string;
  name: string;
  operator: string;
  accessUrl: string;
  feedFormat: string;
  status: WebcamStatus;
  statusEvidence?: string;
  verifiedAt?: string;
  tier?: 1 | 2;
  priorityScore: number;
  targetSpecies?: string;
  seasonality?: string;
  caveat?: string;
  appMode?: string;
  evidenceUrl?: string;
};

export type WebcamSite = ViewingLocation & {
  locality: string;
  waterbody: string;
  coordinateQuality: string;
  priorityScore: number;
  feeds: WebcamFeed[];
};

export type PoiType = "Park" | "Marina" | "Ferry" | "Other";

export type SuggestedPlace = {
  id: string;
  spotId: string;
  name: string;
  region?: string;
  type: PoiType;
  latitude: number;
  longitude: number;
  viewingPotential: ViewingPotential;
  score: number;
  reason: string;
  distanceFromBaseKm?: number;
  distanceToForecastSupportKm?: number;
  imageUrl?: string;
  hasLiveFeed?: boolean;
  liveCameraUrl?: string;
  hasHydrophone?: boolean;
  isRankedRecommendation?: boolean;
};
