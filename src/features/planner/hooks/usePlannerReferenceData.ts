import { useLocationResources } from "../../locations/useLocationResources";
import { loadPlannerBaseLocations } from "../../../shared/data/plannerBaseLocations";
import { loadViewingSpotPhotoManifest } from "../../../shared/data/viewingSpotPhotos";
import { useAsyncResource } from "../../../shared/data/useAsyncResource";

export function usePlannerReferenceData() {
  const locations = useLocationResources();
  const bases = useAsyncResource(loadPlannerBaseLocations);
  const photos = useAsyncResource(loadViewingSpotPhotoManifest);
  return {
    ...locations,
    baseLocations: bases.data ?? [],
    photoManifest: photos.data ?? {},
    unavailable: [
      ...locations.unavailable,
      ...(bases.status === "error" ? ["base locations"] : []),
      ...(photos.status === "error" ? ["place photos"] : []),
    ],
    retry() {
      locations.retry();
      if (bases.status === "error") bases.retry();
      if (photos.status === "error") photos.retry();
    },
  };
}
