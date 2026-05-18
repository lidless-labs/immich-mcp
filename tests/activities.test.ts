import { describe, it, expect } from "vitest";
import { installFakeSdk, resetFakeSdk, sdkCalls, mockSdkResponse } from "./_fake-sdk.js";
installFakeSdk();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerActivityTools } from "../src/tools/activities.js";

const cfgRead = { baseUrl: "https://x/api", apiKey: "k", allowWrites: false, verifySsl: true };
const cfgWrite = { ...cfgRead, allowWrites: true };
const UUID_A = "00000000-0000-0000-0000-000000000001";

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: (a: unknown, extra?: unknown) => Promise<unknown> }> })._registeredTools;
  return reg[name]!.handler(args, {});
}

describe("activity tools", () => {
  it("immich_list_activities calls getActivities", async () => {
    resetFakeSdk();
    mockSdkResponse("getActivities", []);
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerActivityTools(server, cfgRead);
    await callTool(server, "immich_list_activities", { albumId: UUID_A });
    expect(sdkCalls[0]?.fn).toBe("getActivities");
  });
  it("immich_get_activity_statistics calls getActivityStatistics", async () => {
    resetFakeSdk();
    mockSdkResponse("getActivityStatistics", { comments: 0 });
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerActivityTools(server, cfgRead);
    await callTool(server, "immich_get_activity_statistics", { albumId: UUID_A });
    expect(sdkCalls[0]?.fn).toBe("getActivityStatistics");
  });
  it("immich_create_activity refuses without writes", async () => {
    resetFakeSdk();
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerActivityTools(server, cfgRead);
    const out = await callTool(server, "immich_create_activity", { albumId: UUID_A, type: "like" }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_create_activity calls createActivity with writes", async () => {
    resetFakeSdk();
    mockSdkResponse("createActivity", { id: UUID_A });
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerActivityTools(server, cfgWrite);
    await callTool(server, "immich_create_activity", { albumId: UUID_A, type: "like" });
    expect(sdkCalls[0]?.fn).toBe("createActivity");
  });
  it("immich_delete_activity refuses without confirm", async () => {
    resetFakeSdk();
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerActivityTools(server, cfgWrite);
    const out = await callTool(server, "immich_delete_activity", { id: UUID_A }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_delete_activity with confirm proceeds", async () => {
    resetFakeSdk();
    mockSdkResponse("deleteActivity", undefined);
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerActivityTools(server, cfgWrite);
    const out = await callTool(server, "immich_delete_activity", { id: UUID_A, confirm: true }) as { isError?: boolean };
    expect(out.isError).toBeFalsy();
    expect(sdkCalls[0]?.fn).toBe("deleteActivity");
  });
});
