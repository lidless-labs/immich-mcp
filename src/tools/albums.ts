import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as sdk from "@immich/sdk";
import type { Config } from "../config.js";
import { Uuid, BulkIds } from "../types.js";
import { asMcpResponse, asMcpError, surfaceError, requireWrites, requireConfirm } from "./_util.js";

export function registerAlbumTools(server: McpServer, config: Config): void {
  server.tool("immich_list_albums", "List all albums visible to the API key user.", {
    shared: z.boolean().optional(),
    assetId: Uuid.optional(),
  }, async (args) => {
    try { return asMcpResponse(await sdk.getAllAlbums(args)); }
    catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_get_album", "Get album by id (with or without assets).", {
    id: Uuid,
    withoutAssets: z.boolean().optional(),
  }, async (args) => {
    try { return asMcpResponse(await sdk.getAlbumInfo(args)); }
    catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_get_album_statistics", "Owned vs shared vs not-shared album counts.", {}, async () => {
    try { return asMcpResponse(await sdk.getAlbumStatistics()); }
    catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_create_album", "Create an album (optionally with starter assets).", {
    albumName: z.string().min(1),
    description: z.string().optional(),
    assetIds: z.array(Uuid).optional(),
  }, async (args) => {
    try {
      requireWrites(config);
      return asMcpResponse(await sdk.createAlbum({ createAlbumDto: args as never }));
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_update_album", "Rename, set cover, or set description.", {
    id: Uuid,
    albumName: z.string().optional(),
    description: z.string().optional(),
    albumThumbnailAssetId: Uuid.optional(),
  }, async ({ id, ...rest }) => {
    try {
      requireWrites(config);
      return asMcpResponse(await sdk.updateAlbumInfo({ id, updateAlbumDto: rest as never }));
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_delete_album", "Delete an album (assets are NOT deleted). Requires confirm: true.", {
    id: Uuid,
    confirm: z.boolean().optional(),
  }, async ({ id, confirm }) => {
    try {
      requireWrites(config);
      requireConfirm("immich_delete_album", confirm);
      await sdk.deleteAlbum({ id });
      return asMcpResponse({ deleted: id });
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_add_assets_to_album", "Add assets to an album.", {
    id: Uuid,
    assetIds: BulkIds,
  }, async ({ id, assetIds }) => {
    try {
      requireWrites(config);
      return asMcpResponse(await sdk.addAssetsToAlbum({ id, bulkIdsDto: { ids: assetIds } as never }));
    } catch (e) { return asMcpError(surfaceError(e)); }
  });

  server.tool("immich_remove_assets_from_album", "Remove assets from an album.", {
    id: Uuid,
    assetIds: BulkIds,
  }, async ({ id, assetIds }) => {
    try {
      requireWrites(config);
      return asMcpResponse(await sdk.removeAssetFromAlbum({ id, bulkIdsDto: { ids: assetIds } as never }));
    } catch (e) { return asMcpError(surfaceError(e)); }
  });
}
