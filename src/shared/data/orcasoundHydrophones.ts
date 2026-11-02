import { createCachedLoader } from "./cachedLoader";
import { fetchJson } from "./fetchClient";
import { getDataVersionToken } from "./meta";
export type OrcasoundHydrophone = {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
};

type OrcasoundHydrophonePayload = {
  listenUrl: string;
  items: OrcasoundHydrophone[];
};

const hydrophones = createCachedLoader(
  fetchHydrophonePayload,
  getDataVersionToken,
);

function isValidHydrophone(value: unknown): value is OrcasoundHydrophone {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OrcasoundHydrophone>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.region === "string" &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  );
}

function normalizePayload(payload: unknown): OrcasoundHydrophonePayload {
  const candidate =
    payload && typeof payload === "object"
      ? (payload as Partial<OrcasoundHydrophonePayload>)
      : null;
  const items = Array.isArray(candidate?.items)
    ? candidate.items.filter(isValidHydrophone)
    : [];
  return {
    listenUrl:
      typeof candidate?.listenUrl === "string" &&
      candidate.listenUrl.trim().length > 0
        ? candidate.listenUrl
        : "https://live.orcasound.net/",
    items,
  };
}

async function fetchHydrophonePayload(): Promise<OrcasoundHydrophonePayload> {
  const url = resolveAppAssetPath("data/orcasound_hydrophones.json");
  const { data } = await fetchJson<unknown>(url, {
    cacheToken: getDataVersionToken(),
  });
  return normalizePayload(data);
}

export function loadOrcasoundHydrophonePayload() {
  return hydrophones.load();
}

export function resetOrcasoundHydrophonesCacheForTests() {
  hydrophones.reset();
}
import { resolveAppAssetPath } from "../config/basePath";
