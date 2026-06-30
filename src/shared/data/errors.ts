export type DataErrorKind = "network" | "timeout" | "http" | "invalid_json" | "invalid_content" | "validation";

export class DataLoadError extends Error {
  kind: DataErrorKind;
  url: string;
  status?: number;
  cause?: unknown;
  details?: string;

  constructor(params: {
    kind: DataErrorKind;
    url: string;
    message: string;
    status?: number;
    cause?: unknown;
    details?: string;
  }) {
    super(params.message);
    this.name = "DataLoadError";
    this.kind = params.kind;
    this.url = params.url;
    this.status = params.status;
    this.cause = params.cause;
    this.details = params.details;
  }

  get path(): string {
    return this.url;
  }
}

export function formatDataPath(path: string): string {
  try {
    const url = new URL(path, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

export function normalizeDataLoadError(error: unknown, fallbackUrl: string): DataLoadError {
  if (error instanceof DataLoadError) return error;
  if (error instanceof Error) {
    return new DataLoadError({
      kind: "network",
      url: fallbackUrl,
      message: error.message,
      cause: error,
      details: error.stack,
    });
  }
  return new DataLoadError({
    kind: "network",
    url: fallbackUrl,
    message: "Unknown data loading error",
    cause: error,
  });
}
