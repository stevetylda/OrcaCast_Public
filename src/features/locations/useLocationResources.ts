import { useMemo } from "react";
import { loadOrcasoundHydrophonePayload } from "../../shared/data/orcasoundHydrophones";
import {
  loadWebcamSites,
  mergePoiCamerasIntoWebcamSites,
} from "../../shared/data/webcams";
import { useAsyncResource } from "../../shared/data/useAsyncResource";
import type { PublicPoi } from "./poiData";
import type { OrcasoundHydrophone } from "../../shared/data/orcasoundHydrophones";
import { loadPoiData } from "./poiData";

const EMPTY_POIS: PublicPoi[] = [];
const EMPTY_HYDROPHONES: OrcasoundHydrophone[] = [];

/** Optional POI enrichment must never prevent usable cameras from appearing. */
export function useLocationResources() {
  const pois = useAsyncResource(loadPoiData);
  const webcams = useAsyncResource(loadWebcamSites);
  const hydrophones = useAsyncResource(loadOrcasoundHydrophonePayload);
  const cameraLocations = useMemo(
    () => mergePoiCamerasIntoWebcamSites(webcams.data ?? [], pois.data ?? []),
    [webcams.data, pois.data],
  );
  const unavailable = [
    pois.status === "error" ? "viewing places" : null,
    webcams.status === "error" ? "cameras" : null,
    hydrophones.status === "error" ? "hydrophones" : null,
  ].filter((label): label is string => label !== null);
  return {
    cameraLocations,
    poiLocations: pois.data ?? EMPTY_POIS,
    hydrophoneLocations: hydrophones.data?.items ?? EMPTY_HYDROPHONES,
    hydrophoneListenUrl:
      hydrophones.data?.listenUrl ?? "https://live.orcasound.net/",
    unavailable,
    retry() {
      if (pois.status === "error") pois.retry();
      if (webcams.status === "error") webcams.retry();
      if (hydrophones.status === "error") hydrophones.retry();
    },
  };
}
