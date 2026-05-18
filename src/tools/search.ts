import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as sdk from "@immich/sdk";
import type { Config } from "../config.js";
import { Uuid } from "../types.js";
import { asMcpResponse, asMcpError, surfaceError } from "./_util.js";

export function registerSearchTools(server: McpServer, _config: Config): void {
  server.tool(
    "immich_search_metadata",
    "Search assets by metadata: date range, location, camera, people, tags, albums.",
    {
      query: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      state: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      lensModel: z.string().optional(),
      takenAfter: z.string().datetime().optional(),
      takenBefore: z.string().datetime().optional(),
      personIds: z.array(Uuid).optional(),
      albumIds: z.array(Uuid).optional(),
      tagIds: z.array(Uuid).optional(),
      isFavorite: z.boolean().optional(),
      isArchived: z.boolean().optional(),
      type: z.enum(["IMAGE", "VIDEO", "AUDIO", "OTHER"]).optional(),
      size: z.number().int().min(1).max(1000).optional(),
      page: z.number().int().min(1).optional(),
    },
    async (args) => {
      try {
        const res = await sdk.searchAssets({ metadataSearchDto: args as never });
        return asMcpResponse(res);
      } catch (e) {
        return asMcpError(surfaceError(e));
      }
    },
  );

  server.tool(
    "immich_search_smart",
    "CLIP / semantic search. Pass a natural-language query (e.g., 'sunset over the ocean').",
    {
      query: z.string().min(1),
      personIds: z.array(Uuid).optional(),
      size: z.number().int().min(1).max(1000).optional(),
      page: z.number().int().min(1).optional(),
    },
    async (args) => {
      try {
        const res = await sdk.searchSmart({ smartSearchDto: args as never });
        return asMcpResponse(res);
      } catch (e) {
        return asMcpError(surfaceError(e));
      }
    },
  );

  server.tool(
    "immich_search_explore",
    "Random sample of assets - useful for discovery / 'explore' lanes.",
    {
      size: z.number().int().min(1).max(1000).optional(),
    },
    async ({ size }) => {
      try {
        const res = await sdk.searchRandom({ randomSearchDto: { size: size ?? 50 } as never });
        return asMcpResponse(res);
      } catch (e) {
        return asMcpError(surfaceError(e));
      }
    },
  );
}
