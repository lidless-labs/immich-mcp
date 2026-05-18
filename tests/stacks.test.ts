import { describe, it, expect } from "vitest";
import { installFakeSdk, resetFakeSdk, sdkCalls, mockSdkResponse } from "./_fake-sdk.js";
installFakeSdk();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStackTools } from "../src/tools/stacks.js";

const cfgRead = { baseUrl: "https://x/api", apiKey: "k", allowWrites: false, verifySsl: true };
const cfgWrite = { ...cfgRead, allowWrites: true };
const UUID_A = "00000000-0000-0000-0000-000000000001";
const UUID_B = "00000000-0000-0000-0000-000000000002";

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: (a: unknown, extra?: unknown) => Promise<unknown> }> })._registeredTools;
  return reg[name]!.handler(args, {});
}

describe("stack tools", () => {
  it("immich_list_stacks calls searchStacks", async () => {
    resetFakeSdk();
    mockSdkResponse("searchStacks", []);
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerStackTools(server, cfgRead);
    await callTool(server, "immich_list_stacks");
    expect(sdkCalls[0]?.fn).toBe("searchStacks");
  });
  it("immich_create_stack refuses without writes", async () => {
    resetFakeSdk();
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerStackTools(server, cfgRead);
    const out = await callTool(server, "immich_create_stack", { assetIds: [UUID_A, UUID_B] }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_create_stack calls createStack with writes", async () => {
    resetFakeSdk();
    mockSdkResponse("createStack", { id: UUID_A });
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerStackTools(server, cfgWrite);
    await callTool(server, "immich_create_stack", { assetIds: [UUID_A, UUID_B] });
    expect(sdkCalls[0]?.fn).toBe("createStack");
  });
  it("immich_update_stack calls updateStack", async () => {
    resetFakeSdk();
    mockSdkResponse("updateStack", { id: UUID_A });
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerStackTools(server, cfgWrite);
    await callTool(server, "immich_update_stack", { id: UUID_A, primaryAssetId: UUID_B });
    expect(sdkCalls[0]?.fn).toBe("updateStack");
  });
  it("immich_delete_stack refuses without confirm", async () => {
    resetFakeSdk();
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerStackTools(server, cfgWrite);
    const out = await callTool(server, "immich_delete_stack", { id: UUID_A }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_delete_stack with confirm proceeds", async () => {
    resetFakeSdk();
    mockSdkResponse("deleteStack", undefined);
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerStackTools(server, cfgWrite);
    const out = await callTool(server, "immich_delete_stack", { id: UUID_A, confirm: true }) as { isError?: boolean };
    expect(out.isError).toBeFalsy();
    expect(sdkCalls[0]?.fn).toBe("deleteStack");
  });
});
