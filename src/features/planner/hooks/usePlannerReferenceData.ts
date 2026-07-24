import { useEffect, useState } from "react";
import { loadPoiData, type PublicPoi } from "../../locations/poiData";
import type { WebcamSite } from "../../locations/types";
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
import {
  loadWebcamSites,
  mergePoiCamerasIntoWebcamSites,
} from "../../../shared/data/webcams";

const DEFAULT_ORCASOUND_URL = "https://live.orcasound.net/";

export function usePlannerReferenceData() {
  const [photoManifest, setPhotoManifest] = useState<ViewingSpotPhotoManifest>(
    {},
  );
  const [baseLocations, setBaseLocations] = useState<PlannerBaseLocation[]>([]);
  const [cameraLocations, setCameraLocations] = useState<WebcamSite[]>([]);
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
      loadWebcamSites(),
    ]).then(
      ([
        baseResult,
        photoResult,
        poiResult,
        hydrophoneResult,
        webcamResult,
      ]) => {
        if (cancelled) return;
        if (baseResult.status === "fulfilled")
          setBaseLocations(baseResult.value);
        else
          console.warn(
            "[Planner] failed to load base locations",
            baseResult.reason,
          );

        if (photoResult.status === "fulfilled")
          setPhotoManifest(photoResult.value);

        if (poiResult.status === "fulfilled") {
          setPoiLocations(poiResult.value);
        } else
          console.warn(
            "[Planner] failed to load camera locations",
            poiResult.reason,
          );

        if (webcamResult.status === "rejected") {
          console.warn(
            "[Planner] failed to load webcam locations",
            webcamResult.reason,
          );
        }
        const webcamSites =
          webcamResult.status === "fulfilled" ? webcamResult.value : [];
        const poiItems =
          poiResult.status === "fulfilled" ? poiResult.value : [];
        setCameraLocations(
          mergePoiCamerasIntoWebcamSites(webcamSites, poiItems),
        );

        if (hydrophoneResult.status === "fulfilled") {
          setHydrophoneLocations(hydrophoneResult.value.items);
          setHydrophoneListenUrl(hydrophoneResult.value.listenUrl);
        } else
          console.warn(
            "[Planner] failed to load Orcasound hydrophones",
            hydrophoneResult.reason,
          );
      },
    );
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
