export const envConfig = {
  ENABLE_VIEWABILITY: false,
  ENABLE_EXPLAINABILITY: false,
  ENABLE_MODELS: false,
  ENABLE_DATA: false,
} as const satisfies Record<string, boolean>;
