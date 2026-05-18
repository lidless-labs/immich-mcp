import { init } from "@immich/sdk";
import type { Config } from "./config.js";

export function initImmichClient(config: Config): void {
  if (!config.verifySsl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  init({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
}
