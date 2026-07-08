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

let hydrophonePayloadPromise: Promise<OrcasoundHydrophonePayload> | null = null;

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
  const candidate = payload && typeof payload === "object" ? (payload as Partial<OrcasoundHydrophonePayload>) : null;
  const items = Array.isArray(candidate?.items) ? candidate.items.filter(isValidHydrophone) : [];
  return {
    listenUrl:
      typeof candidate?.listenUrl === "string" && candidate.listenUrl.trim().length > 0
        ? candidate.listenUrl
        : "https://live.orcasound.net/",
    items,
  };
}

async function fetchHydrophonePayload(): Promise<OrcasoundHydrophonePayload> {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const candidates = Array.from(
    new Set([
      `${normalizedBase}data/orcasound_hydrophones.json`,
      "/data/orcasound_hydrophones.json",
      "data/orcasound_hydrophones.json",
    ])
  );

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      return normalizePayload(await response.json());
    } catch {
      // Try next candidate URL.
    }
  }

  throw new Error("Failed to load Orcasound hydrophone data");
}

export function loadOrcasoundHydrophonePayload() {
  hydrophonePayloadPromise ??= fetchHydrophonePayload();
  return hydrophonePayloadPromise;
}

export async function loadOrcasoundHydrophones() {
  return (await loadOrcasoundHydrophonePayload()).items;
}

export function resetOrcasoundHydrophonesCacheForTests() {
  hydrophonePayloadPromise = null;
}
