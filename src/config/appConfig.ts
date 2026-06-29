import { envConfig } from "../../env.config";

export const appConfig: {
  compositeModelId: string;
  compositeModelLabel: string;
  modelVersion: string;
  featureFlags: typeof envConfig;
} = {
  compositeModelId: "composite_linear_logit",
  compositeModelLabel: "Composite",
  modelVersion: "vPhase2",
  featureFlags: envConfig,
};
