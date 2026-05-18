import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as sdk from "@immich/sdk";
import type { Config } from "../config.js";
import { Uuid } from "../types.js";
import { asMcpResponse, asMcpError, surfaceError, requireWrites, requireConfirm } from "./_util.js";

export function registerActivityTools(server: McpServer, config: Config): void {
  server.tool("immich_list_activities", "List comments and likes on albums or assets.", {
    albumId: Uuid.optional(),
    assetId: Uuid.optional(),
    userId: Uuid.optional(),
    level: z.enum(["album", "asset"]).optional(),
    type: z.enum(["comment", "like"]).optional(),
  }, async (args) => {
    try { return asMcpResponse(await sdk.getActivities(args as never)); }
    catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_create_activity", "Create a comment or like on an album/asset.", {
    albumId: Uuid,
    assetId: Uuid.optional(),
    comment: z.string().optional(),
    type: z.enum(["comment", "like"]),
  }, async (args) => {
    try {
      requireWrites(config);
      return asMcpResponse(await sdk.createActivity({ activityCreateDto: args as never }));
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_delete_activity", "Delete an activity. Requires confirm: true.", {
    id: Uuid,
    confirm: z.boolean().optional(),
  }, async ({ id, confirm }) => {
    try {
      requireWrites(config);
      requireConfirm("immich_delete_activity", confirm);
      await sdk.deleteActivity({ id });
      return asMcpResponse({ deleted: id });
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_get_activity_statistics", "Activity counts per album or asset.", {
    albumId: Uuid,
    assetId: Uuid.optional(),
  }, async (args) => {
    try { return asMcpResponse(await sdk.getActivityStatistics(args as never)); }
    catch (e) { return asMcpError(surfaceError(e)); }
  });
}
