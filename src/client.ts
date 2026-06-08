import { init, defaults } from "@immich/sdk";
import { Agent, fetch as undiciFetch } from "undici";
import type { Config } from "./config.js";

export function initImmichClient(config: Config): void {
  init({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });

  if (!config.verifySsl) {
    // Scope the TLS-verification bypass to *this* Immich client only.
    // Setting the process-global NODE_TLS_REJECT_UNAUTHORIZED="0" would disable
    // certificate validation for every outbound TLS connection in the process,
    // so instead we hand the SDK a dedicated fetch that routes through an
    // undici Agent confined to Immich requests.
    const insecureDispatcher = new Agent({
      connect: { rejectUnauthorized: false },
    });
    // The Immich SDK (oazapfts runtime) honours a `fetch` override on its
    // shared defaults. undici's fetch accepts a per-request `dispatcher`, so the
    // relaxed TLS check never leaks to any other fetch in the process.
    const scopedFetch = (
      input: Parameters<typeof undiciFetch>[0],
      requestInit?: Parameters<typeof undiciFetch>[1],
    ) =>
      undiciFetch(input, {
        ...requestInit,
        dispatcher: insecureDispatcher,
      });
    (defaults as { fetch?: typeof globalThis.fetch }).fetch =
      scopedFetch as unknown as typeof globalThis.fetch;
  }
}
