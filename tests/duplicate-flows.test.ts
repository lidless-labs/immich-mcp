import { describe, it, expect } from "vitest";
import { installFakeSdk, resetFakeSdk, sdkCalls, mockSdkResponse } from "./_fake-sdk.js";
installFakeSdk();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDuplicateFlowTools } from "../src/tools/duplicate-flows.js";

const cfgRead = { baseUrl: "https://x/api", apiKey: "k", allowWrites: false, verifySsl: true };
const cfgWrite = { ...cfgRead, allowWrites: true };

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: (a: unknown, extra?: unknown) => Promise<unknown> }> })._registeredTools;
  return reg[name]!.handler(args, {});
}

const mkAsset = (id: string, name: string, size: number, when: string) => ({
  id,
  originalFileName: name,
  fileCreatedAt: when,
  exifInfo: { fileSizeInByte: size },
});

interface ToolResult {
  isError?: boolean;
  content: { text: string }[];
}

function parsePayload(out: unknown): Record<string, unknown> {
  const r = out as ToolResult;
  return JSON.parse(r.content[0]!.text) as Record<string, unknown>;
}

describe("duplicate-flows", () => {
  describe("immich_categorize_duplicates", () => {
    it("bins 5 synthetic groups into the right categories", async () => {
      resetFakeSdk();
      const groups = [
        // byte_exact: same name + size
        {
          duplicateId: "g1",
          assets: [
            mkAsset("a1", "IMG_0001.jpg", 1024, "2024-01-01T00:00:00Z"),
            mkAsset("a2", "IMG_0001.jpg", 1024, "2024-01-02T00:00:00Z"),
          ],
        },
        // resolution_variants: 1080p/4k pattern
        {
          duplicateId: "g2",
          assets: [
            mkAsset("b1", "movie_1080p.mp4", 1000, "2024-02-01T00:00:00Z"),
            mkAsset("b2", "movie_4k.mp4", 5000, "2024-02-01T00:00:00Z"),
          ],
        },
        // burst_sequence: same YYYYMMDD_HHMMSS prefix
        {
          duplicateId: "g3",
          assets: [
            mkAsset("c1", "20240301_120000_001.jpg", 2000, "2024-03-01T00:00:00Z"),
            mkAsset("c2", "20240301_120000_002.jpg", 2100, "2024-03-01T00:00:00Z"),
          ],
        },
        // edits: " - Copy." pattern
        {
          duplicateId: "g4",
          assets: [
            mkAsset("d1", "photo.jpg", 3000, "2024-04-01T00:00:00Z"),
            mkAsset("d2", "photo - Copy.jpg", 3050, "2024-04-02T00:00:00Z"),
          ],
        },
        // unknown
        {
          duplicateId: "g5",
          assets: [
            mkAsset("e1", "alpha.jpg", 4000, "2024-05-01T00:00:00Z"),
            mkAsset("e2", "beta.jpg", 4100, "2024-05-02T00:00:00Z"),
          ],
        },
      ];
      mockSdkResponse("getAssetDuplicates", groups);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgRead);
      const out = await callTool(server, "immich_categorize_duplicates");
      const body = parsePayload(out);
      expect(body.total).toBe(5);
      const byCategory = body.byCategory as Record<string, number>;
      expect(byCategory.byte_exact).toBe(1);
      expect(byCategory.resolution_variants).toBe(1);
      expect(byCategory.burst_sequence).toBe(1);
      expect(byCategory.edits).toBe(1);
      expect(byCategory.unknown).toBe(1);
    });
  });

  describe("immich_find_byte_dupes", () => {
    it("returns 0 candidates when no (name,size) bucket has >=2 assets", async () => {
      resetFakeSdk();
      mockSdkResponse("getAssetDuplicates", [
        {
          duplicateId: "g1",
          assets: [
            mkAsset("a1", "one.jpg", 100, "2024-01-01T00:00:00Z"),
            mkAsset("a2", "two.jpg", 200, "2024-01-02T00:00:00Z"),
          ],
        },
      ]);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgRead);
      const out = await callTool(server, "immich_find_byte_dupes");
      const body = parsePayload(out);
      expect(body.totalCandidates).toBe(0);
      expect(body.candidates).toEqual([]);
    });

    it("returns 1 candidate with right keeperId and discardIds for a paired bucket", async () => {
      resetFakeSdk();
      mockSdkResponse("getAssetDuplicates", [
        {
          duplicateId: "g1",
          assets: [
            mkAsset("newer", "same.jpg", 500, "2024-06-01T00:00:00Z"),
            mkAsset("older", "same.jpg", 500, "2024-01-01T00:00:00Z"),
          ],
        },
      ]);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgRead);
      const out = await callTool(server, "immich_find_byte_dupes");
      const body = parsePayload(out);
      expect(body.totalCandidates).toBe(1);
      const candidates = body.candidates as Array<{ keeperId: string; discardIds: string[]; reclaimableBytes: number; filename: string; size: number }>;
      expect(candidates[0]!.keeperId).toBe("older");
      expect(candidates[0]!.discardIds).toEqual(["newer"]);
      expect(candidates[0]!.reclaimableBytes).toBe(500);
      expect(candidates[0]!.filename).toBe("same.jpg");
      expect(candidates[0]!.size).toBe(500);
      expect(body.totalDiscardAssets).toBe(1);
      expect(body.totalReclaimableBytes).toBe(500);
    });

    it("respects minSizeBytes filter", async () => {
      resetFakeSdk();
      mockSdkResponse("getAssetDuplicates", [
        {
          duplicateId: "g1",
          assets: [
            mkAsset("a1", "small.jpg", 100, "2024-01-01T00:00:00Z"),
            mkAsset("a2", "small.jpg", 100, "2024-01-02T00:00:00Z"),
          ],
        },
        {
          duplicateId: "g2",
          assets: [
            mkAsset("b1", "big.jpg", 5000, "2024-01-01T00:00:00Z"),
            mkAsset("b2", "big.jpg", 5000, "2024-01-02T00:00:00Z"),
          ],
        },
      ]);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgRead);
      const out = await callTool(server, "immich_find_byte_dupes", { minSizeBytes: 1000 });
      const body = parsePayload(out);
      expect(body.totalCandidates).toBe(1);
      const candidates = body.candidates as Array<{ filename: string }>;
      expect(candidates[0]!.filename).toBe("big.jpg");
    });
  });

  describe("immich_resolve_with_keep_strategy", () => {
    const dupeFixture = [
      {
        duplicateId: "g1",
        assets: [
          mkAsset("newer", "same.jpg", 500, "2024-06-01T00:00:00Z"),
          mkAsset("older", "same.jpg", 500, "2024-01-01T00:00:00Z"),
        ],
      },
    ];

    it("defaults to dry-run (no SDK delete)", async () => {
      resetFakeSdk();
      mockSdkResponse("getAssetDuplicates", dupeFixture);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgRead);
      const out = await callTool(server, "immich_resolve_with_keep_strategy", {
        strategy: "byte_dupes_keep_oldest",
      }) as ToolResult;
      expect(out.isError).toBeFalsy();
      const body = parsePayload(out);
      expect(body.dryRun).toBe(true);
      expect(sdkCalls.some((c) => c.fn === "deleteAssets")).toBe(false);
    });

    it("delete: true with writes disabled returns WriteDisabledError", async () => {
      resetFakeSdk();
      mockSdkResponse("getAssetDuplicates", dupeFixture);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgRead);
      const out = await callTool(server, "immich_resolve_with_keep_strategy", {
        strategy: "byte_dupes_keep_oldest",
        delete: true,
      }) as ToolResult;
      expect(out.isError).toBe(true);
      expect(out.content[0]!.text).toMatch(/Writes disabled/);
    });

    it("delete: true + permanent: true without confirm returns ConfirmRequiredError", async () => {
      resetFakeSdk();
      mockSdkResponse("getAssetDuplicates", dupeFixture);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgWrite);
      const out = await callTool(server, "immich_resolve_with_keep_strategy", {
        strategy: "byte_dupes_keep_oldest",
        delete: true,
        permanent: true,
      }) as ToolResult;
      expect(out.isError).toBe(true);
      expect(out.content[0]!.text).toMatch(/confirm: true/);
    });

    it("delete: true, permanent: false (trash) calls deleteAssets with force:false and right ids", async () => {
      resetFakeSdk();
      mockSdkResponse("getAssetDuplicates", dupeFixture);
      mockSdkResponse("deleteAssets", undefined);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgWrite);
      const out = await callTool(server, "immich_resolve_with_keep_strategy", {
        strategy: "byte_dupes_keep_oldest",
        delete: true,
      }) as ToolResult;
      expect(out.isError).toBeFalsy();
      const delCall = sdkCalls.find((c) => c.fn === "deleteAssets");
      expect(delCall).toBeDefined();
      const arg = (delCall!.args[0] as { assetBulkDeleteDto: { ids: string[]; force: boolean } }).assetBulkDeleteDto;
      expect(arg.ids).toEqual(["newer"]);
      expect(arg.force).toBe(false);
      const body = parsePayload(out);
      expect(body.executed).toBe(true);
      expect(body.deletedCount).toBe(1);
      expect(body.permanent).toBe(false);
    });

    it("refuses when discardCount > maxDiscards", async () => {
      resetFakeSdk();
      // Build a fixture with 3 discards
      const groups = [
        {
          duplicateId: "g1",
          assets: [
            mkAsset("k", "f.jpg", 100, "2024-01-01T00:00:00Z"),
            mkAsset("d1", "f.jpg", 100, "2024-06-01T00:00:00Z"),
            mkAsset("d2", "f.jpg", 100, "2024-07-01T00:00:00Z"),
            mkAsset("d3", "f.jpg", 100, "2024-08-01T00:00:00Z"),
          ],
        },
      ];
      mockSdkResponse("getAssetDuplicates", groups);
      const server = new McpServer({ name: "immich-mcp", version: "0.0.0-test" });
      registerDuplicateFlowTools(server, cfgWrite);
      const out = await callTool(server, "immich_resolve_with_keep_strategy", {
        strategy: "byte_dupes_keep_oldest",
        delete: true,
        maxDiscards: 2,
      }) as ToolResult;
      expect(out.isError).toBe(true);
      expect(out.content[0]!.text).toMatch(/exceeds maxDiscards/);
      expect(sdkCalls.some((c) => c.fn === "deleteAssets")).toBe(false);
    });
  });
});
