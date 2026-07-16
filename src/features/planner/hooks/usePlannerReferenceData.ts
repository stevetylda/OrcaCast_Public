import { useEffect, useState } from "react";
import { loadPoiData, type PublicPoi } from "../../locations/poiData";
import type { ViewingLocation } from "../../locations/types";
import {
  loadOrcasoundHydrophonePayload,
  type OrcasoundHydrophone,
} from "../../../shared/data/orcasoundHydrophones";
import {
  loadPlannerBaseLocations,
  type PlannerBaseLocation,
} from "../../../shared/data/plannerBaseLocations";
import {
  loadViewingSpotPhotoManifest,
  type ViewingSpotPhotoManifest,
} from "../../../shared/data/viewingSpotPhotos";

const DEFAULT_ORCASOUND_URL = "https://live.orcasound.net/";

export function usePlannerReferenceData() {
  const [photoManifest, setPhotoManifest] = useState<ViewingSpotPhotoManifest>(
    {},
  );
  const [baseLocations, setBaseLocations] = useState<PlannerBaseLocation[]>([]);
  const [cameraLocations, setCameraLocations] = useState<ViewingLocation[]>([]);
  const [poiLocations, setPoiLocations] = useState<PublicPoi[]>([]);
  const [hydrophoneLocations, setHydrophoneLocations] = useState<
    OrcasoundHydrophone[]
  >([]);
  const [hydrophoneListenUrl, setHydrophoneListenUrl] = useState(
    DEFAULT_ORCASOUND_URL,
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      loadPlannerBaseLocations(),
      loadViewingSpotPhotoManifest(),
      loadPoiData(),
      loadOrcasoundHydrophonePayload(),
    ]).then(([baseResult, photoResult, poiResult, hydrophoneResult]) => {
      if (cancelled) return;
      if (baseResult.status === "fulfilled") setBaseLocations(baseResult.value);
      else
        console.warn(
          "[Planner] failed to load base locations",
          baseResult.reason,
        );

      if (photoResult.status === "fulfilled")
        setPhotoManifest(photoResult.value);

      if (poiResult.status === "fulfilled") {
        setPoiLocations(poiResult.value);
        setCameraLocations(
          poiResult.value
            .filter(
              (item) =>
                item.hasLiveFeed &&
                typeof item.liveCameraUrl === "string" &&
                item.liveCameraUrl.length > 0,
            )
            .map((item, index) => ({
              id: `camera-${index}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              name: item.name,
              region: item.region ?? "Viewing location",
              latitude: item.latitude,
              longitude: item.longitude,
              liveCameraUrl: item.liveCameraUrl,
            })),
        );
      } else
        console.warn(
          "[Planner] failed to load camera locations",
          poiResult.reason,
        );

      if (hydrophoneResult.status === "fulfilled") {
        setHydrophoneLocations(hydrophoneResult.value.items);
        setHydrophoneListenUrl(hydrophoneResult.value.listenUrl);
      } else
        console.warn(
          "[Planner] failed to load Orcasound hydrophones",
          hydrophoneResult.reason,
        );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    baseLocations,
    photoManifest,
    cameraLocations,
    poiLocations,
    hydrophoneLocations,
    hydrophoneListenUrl,
  };
}
