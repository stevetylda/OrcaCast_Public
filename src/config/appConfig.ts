import { envConfig } from "../../env.config";

export const appConfig: {
  kdeBandsRunId: string;
  kdeBandsFolder: string;
  kdeBandsAreaMinKm2: number;
  kdeBandsHoleMinKm2: number;
  bestModelId: string;
  featureFlags: typeof envConfig;
} = {
  kdeBandsRunId: "latest",
  kdeBandsFolder: "forecasts/latest/weekly_blurred",
  kdeBandsAreaMinKm2: 2.0,
  kdeBandsHoleMinKm2: 1.0,
  bestModelId: "best",
  featureFlags: envConfig,
};
