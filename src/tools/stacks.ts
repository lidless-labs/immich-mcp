import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as sdk from "@immich/sdk";
import type { Config } from "../config.js";
import { Uuid, BulkIds } from "../types.js";
import { asMcpResponse, asMcpError, surfaceError, requireWrites, requireConfirm } from "./_util.js";

export function registerStackTools(server: McpServer, config: Config): void {
  server.tool("immich_list_stacks", "List asset stacks. Filter by primary asset id.", {
    primaryAssetId: Uuid.optional(),
  }, async (args) => {
    try { return asMcpResponse(await sdk.searchStacks(args)); }
    catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_create_stack", "Stack multiple assets. First id becomes the primary.", {
    assetIds: BulkIds,
  }, async ({ assetIds }) => {
    try {
      requireWrites(config);
      return asMcpResponse(await sdk.createStack({ stackCreateDto: { assetIds } as never }));
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_update_stack", "Reassign the primary asset of a stack.", {
    id: Uuid,
    primaryAssetId: Uuid,
  }, async ({ id, primaryAssetId }) => {
    try {
      requireWrites(config);
      return asMcpResponse(await sdk.updateStack({ id, stackUpdateDto: { primaryAssetId } as never }));
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_delete_stack", "Delete a stack (assets stay). Requires confirm: true.", {
    id: Uuid,
    confirm: z.boolean().optional(),
  }, async ({ id, confirm }) => {
    try {
      requireWrites(config);
      requireConfirm("immich_delete_stack", confirm);
      await sdk.deleteStack({ id });
      return asMcpResponse({ deleted: id });
    } catch (e) { return asMcpError(surfaceError(e)); }
  });
}
