import { describe, it, expect, beforeEach } from "vitest";
import { installFakeSdk, resetFakeSdk, sdkCalls, mockSdkResponse } from "./_fake-sdk.js";
installFakeSdk();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAlbumTools } from "../src/tools/albums.js";

const cfgRead = { baseUrl: "https://x/api", apiKey: "k", allowWrites: false, verifySsl: true };
const cfgWrite = { ...cfgRead, allowWrites: true };

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: (a: unknown, extra?: unknown) => Promise<unknown> }> })._registeredTools;
  return reg[name]!.handler(args, {});
}

describe("album tools - reads", () => {
  let server: McpServer;
  beforeEach(() => {
    resetFakeSdk();
    server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerAlbumTools(server, cfgRead);
  });
  it("immich_list_albums calls getAllAlbums", async () => {
    mockSdkResponse("getAllAlbums", []);
    await callTool(server, "immich_list_albums");
    expect(sdkCalls[0]?.fn).toBe("getAllAlbums");
  });
  it("immich_get_album calls getAlbumInfo", async () => {
    mockSdkResponse("getAlbumInfo", { id: "x" });
    await callTool(server, "immich_get_album", { id: "00000000-0000-0000-0000-000000000001" });
    expect(sdkCalls[0]?.fn).toBe("getAlbumInfo");
  });
  it("immich_get_album_statistics calls getAlbumStatistics", async () => {
    mockSdkResponse("getAlbumStatistics", { owned: 1, shared: 0, notShared: 1 });
    await callTool(server, "immich_get_album_statistics");
    expect(sdkCalls[0]?.fn).toBe("getAlbumStatistics");
  });
});

describe("album tools - gates", () => {
  it("immich_create_album refuses without writes", async () => {
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerAlbumTools(server, cfgRead);
    const out = await callTool(server, "immich_create_album", { albumName: "Trip" }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_delete_album refuses without confirm", async () => {
    resetFakeSdk();
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerAlbumTools(server, cfgWrite);
    const out = await callTool(server, "immich_delete_album", { id: "00000000-0000-0000-0000-000000000001" }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_delete_album with confirm proceeds", async () => {
    resetFakeSdk();
    mockSdkResponse("deleteAlbum", undefined);
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerAlbumTools(server, cfgWrite);
    const out = await callTool(server, "immich_delete_album", {
      id: "00000000-0000-0000-0000-000000000001",
      confirm: true,
    }) as { isError?: boolean };
    expect(out.isError).toBeFalsy();
    expect(sdkCalls[0]?.fn).toBe("deleteAlbum");
  });
});
