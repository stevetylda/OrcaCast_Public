export type LiveFeedType = "camera" | "hydrophone";

export type LiveFeed = {
  id: string;
  name: string;
  type: LiveFeedType;
  url: string;
  locationId?: string;
  provider?: string;
};
