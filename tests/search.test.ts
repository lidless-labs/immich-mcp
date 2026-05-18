import { describe, it, expect, beforeEach } from "vitest";
import { installFakeSdk, resetFakeSdk, sdkCalls, mockSdkResponse } from "./_fake-sdk.js";
installFakeSdk();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTools } from "../src/tools/search.js";

const cfg = { baseUrl: "https://x/api", apiKey: "k", allowWrites: false, verifySsl: true };

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: (a: unknown, extra?: unknown) => Promise<unknown> }> })._registeredTools;
  return reg[name]!.handler(args, {});
}

describe("search tools", () => {
  let server: McpServer;
  beforeEach(() => {
    resetFakeSdk();
    server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerSearchTools(server, cfg);
  });

  it("immich_search_metadata calls searchAssets", async () => {
    mockSdkResponse("searchAssets", { assets: { items: [] } });
    await callTool(server, "immich_search_metadata", { city: "Madrid" });
    expect(sdkCalls[0]?.fn).toBe("searchAssets");
  });

  it("immich_search_smart calls searchSmart with query", async () => {
    mockSdkResponse("searchSmart", { assets: { items: [] } });
    await callTool(server, "immich_search_smart", { query: "sunset over the ocean" });
    const call = sdkCalls.find((c) => c.fn === "searchSmart");
    expect(call).toBeTruthy();
    expect(JSON.stringify(call!.args)).toContain("sunset over the ocean");
  });

  it("immich_search_explore calls searchRandom", async () => {
    mockSdkResponse("searchRandom", []);
    await callTool(server, "immich_search_explore", { size: 25 });
    expect(sdkCalls[0]?.fn).toBe("searchRandom");
  });
});
