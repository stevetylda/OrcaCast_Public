export type ViewingPotential = "very-low" | "low" | "medium" | "high" | "very-high";

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
  distanceKm?: number;
  imageUrl?: string;
  hasLiveFeed?: boolean;
  hasHydrophone?: boolean;
};
