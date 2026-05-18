import { describe, it, expect, beforeEach } from "vitest";
import { installFakeSdk, resetFakeSdk, sdkCalls, mockSdkResponse } from "./_fake-sdk.js";
installFakeSdk();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPeopleTools } from "../src/tools/people.js";

const cfgRead = { baseUrl: "https://x/api", apiKey: "k", allowWrites: false, verifySsl: true };
const cfgWrite = { ...cfgRead, allowWrites: true };

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: (a: unknown, extra?: unknown) => Promise<unknown> }> })._registeredTools;
  return reg[name]!.handler(args, {});
}

const UUID_A = "00000000-0000-0000-0000-000000000001";
const UUID_B = "00000000-0000-0000-0000-000000000002";

describe("people tools - reads", () => {
  let server: McpServer;
  beforeEach(() => {
    resetFakeSdk();
    server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerPeopleTools(server, cfgRead);
  });
  it("immich_list_people calls getAllPeople", async () => {
    mockSdkResponse("getAllPeople", { people: [], total: 0 });
    await callTool(server, "immich_list_people");
    expect(sdkCalls[0]?.fn).toBe("getAllPeople");
  });
  it("immich_get_person hits getPerson or getPersonStatistics", async () => {
    mockSdkResponse("getPerson", { id: UUID_A, name: "Mom" });
    mockSdkResponse("getPersonStatistics", { id: UUID_A });
    await callTool(server, "immich_get_person", { id: UUID_A });
    const fn = sdkCalls[0]?.fn;
    expect(fn === "getPerson" || fn === "getPersonStatistics").toBe(true);
  });
  it("immich_get_person_assets routes through searchAssets with personIds", async () => {
    mockSdkResponse("searchAssets", { assets: { items: [] } });
    await callTool(server, "immich_get_person_assets", { id: UUID_A });
    const call = sdkCalls.find((c) => c.fn === "searchAssets");
    expect(call).toBeTruthy();
    expect(JSON.stringify(call!.args)).toContain(UUID_A);
  });
});

describe("people tools - gates", () => {
  it("immich_update_person refuses without writes", async () => {
    resetFakeSdk();
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerPeopleTools(server, cfgRead);
    const out = await callTool(server, "immich_update_person", { id: UUID_A, name: "Mom" }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_hide_person calls updatePerson with isHidden:true when writes enabled", async () => {
    resetFakeSdk();
    mockSdkResponse("updatePerson", { id: UUID_A, isHidden: true });
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerPeopleTools(server, cfgWrite);
    await callTool(server, "immich_hide_person", { id: UUID_A });
    const call = sdkCalls.find((c) => c.fn === "updatePerson");
    expect(call).toBeTruthy();
    expect(JSON.stringify(call!.args)).toContain("isHidden");
  });
  it("immich_merge_people refuses without confirm", async () => {
    resetFakeSdk();
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerPeopleTools(server, cfgWrite);
    const out = await callTool(server, "immich_merge_people", { id: UUID_A, ids: [UUID_B] }) as { isError?: boolean };
    expect(out.isError).toBe(true);
  });
  it("immich_merge_people with confirm proceeds", async () => {
    resetFakeSdk();
    mockSdkResponse("mergePerson", []);
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerPeopleTools(server, cfgWrite);
    const out = await callTool(server, "immich_merge_people", { id: UUID_A, ids: [UUID_B], confirm: true }) as { isError?: boolean };
    expect(out.isError).toBeFalsy();
    expect(sdkCalls[0]?.fn).toBe("mergePerson");
  });
});

describe("people tools - immich_suggest_face_names", () => {
  it("returns top N unnamed sorted by faceCount desc, excludes named", async () => {
    resetFakeSdk();
    mockSdkResponse("getAllPeople", {
      people: [
        { id: "p1", name: "Mom", faceCount: 500, thumbnailPath: "/p1.jpg" },
        { id: "p2", name: "", faceCount: 120, thumbnailPath: "/p2.jpg" },
        { id: "p3", faceCount: 80, thumbnailPath: "/p3.jpg" },
        { id: "p4", name: "  ", faceCount: 200, thumbnailPath: "/p4.jpg" },
        { id: "p5", name: "Dad", faceCount: 1000, thumbnailPath: "/p5.jpg" },
      ],
    });
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerPeopleTools(server, cfgRead);
    const out = await callTool(server, "immich_suggest_face_names") as { content: { text: string }[] };
    const body = JSON.parse(out.content[0]!.text) as {
      totalUnnamedReturned: number;
      people: Array<{ personId: string; faceCount: number; thumbnailPath?: string }>;
    };
    expect(body.totalUnnamedReturned).toBe(3);
    expect(body.people.map((p) => p.personId)).toEqual(["p4", "p2", "p3"]);
    expect(body.people[0]!.faceCount).toBe(200);
    expect(body.people.find((p) => p.personId === "p1")).toBeUndefined();
    expect(body.people.find((p) => p.personId === "p5")).toBeUndefined();
  });

  it("returns at most `limit` entries", async () => {
    resetFakeSdk();
    const people = Array.from({ length: 20 }, (_, i) => ({
      id: `u${i}`,
      name: "",
      faceCount: 100 - i,
    }));
    mockSdkResponse("getAllPeople", { people });
    const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
    registerPeopleTools(server, cfgRead);
    const out = await callTool(server, "immich_suggest_face_names", { limit: 5 }) as { content: { text: string }[] };
    const body = JSON.parse(out.content[0]!.text) as {
      totalUnnamedReturned: number;
      people: Array<{ personId: string }>;
    };
    expect(body.totalUnnamedReturned).toBe(5);
    expect(body.people).toHaveLength(5);
    expect(body.people.map((p) => p.personId)).toEqual(["u0", "u1", "u2", "u3", "u4"]);
  });
});
