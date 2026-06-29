import {
  // System / server (read-only)
  pingServer,
  getServerConfig,
  getServerStatistics,
  getServerFeatures,
  getStorage,
  getAboutInfo,
  getServerVersion,
  // Albums (read-only)
  getAllAlbums,
  getAlbumInfo,
  getAlbumStatistics,
  // Assets (read-only)
  searchAssets,
  getAssetInfo,
  getAssetStatistics,
  // People (read-only)
  getAllPeople,
  // Tags (read-only)
  getAllTags,
  // Duplicates (read-only report)
  getAssetDuplicates,
  // Jobs (read-only queue status)
  getQueuesLegacy,
  // Memories (read-only)
  searchMemories,
  // Search (read-only)
  searchSmart,
} from "@immich/sdk";
import { init } from "@immich/sdk";
import type { Config } from "./config.js";

/**
 * Read-only Immich client for the CLI. Every method below maps to a GET-style
 * `@immich/sdk` function. No create/update/delete/upload/merge/run-job/trash
 * mutation is imported or reachable from this module, so the CLI structurally
 * cannot touch a write path. The MCP server (src/index.ts) keeps the full
 * write surface behind its IMMICH_ALLOW_WRITES gate; this client never does.
 */
export class ImmichClient {
  constructor(config: Config) {
    if (!config.verifySsl) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    init({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  }

  // --- system / server ---
  ping(): Promise<unknown> {
    return pingServer();
  }
  serverInfo(): Promise<unknown> {
    return getServerConfig();
  }
  serverVersion(): Promise<unknown> {
    return getServerVersion();
  }
  serverAbout(): Promise<unknown> {
    return getAboutInfo();
  }
  serverStatistics(): Promise<unknown> {
    return getServerStatistics();
  }
  capabilities(): Promise<unknown> {
    return getServerFeatures();
  }
  storage(): Promise<unknown> {
    return getStorage();
  }

  // --- albums ---
  listAlbums(args: { shared?: boolean; assetId?: string } = {}): Promise<unknown> {
    return getAllAlbums(args);
  }
  getAlbum(id: string, withoutAssets?: boolean): Promise<unknown> {
    return getAlbumInfo({ id, withoutAssets });
  }
  albumStatistics(): Promise<unknown> {
    return getAlbumStatistics();
  }

  // --- assets ---
  listAssets(metadata: Record<string, unknown>): Promise<unknown> {
    return searchAssets({ metadataSearchDto: metadata as never });
  }
  getAsset(id: string): Promise<unknown> {
    return getAssetInfo({ id });
  }
  assetStatistics(): Promise<unknown> {
    return getAssetStatistics({});
  }

  // --- people ---
  listPeople(args: { page?: number; size?: number; withHidden?: boolean } = {}): Promise<unknown> {
    return getAllPeople(args);
  }

  // --- tags ---
  listTags(): Promise<unknown> {
    return getAllTags();
  }

  // --- duplicates ---
  listDuplicates(): Promise<unknown> {
    return getAssetDuplicates();
  }

  // --- jobs (queue status only) ---
  listJobs(): Promise<unknown> {
    return getQueuesLegacy();
  }

  // --- memories ---
  listMemories(args: {
    for?: string;
    isSaved?: boolean;
    isTrashed?: boolean;
    order?: "asc" | "desc";
    size?: number;
    type?: string;
  }): Promise<unknown> {
    return searchMemories({
      $for: args.for,
      isSaved: args.isSaved,
      isTrashed: args.isTrashed,
      order: args.order as never,
      size: args.size,
      $type: args.type as never,
    });
  }

  // --- search ---
  searchMetadata(metadata: Record<string, unknown>): Promise<unknown> {
    return searchAssets({ metadataSearchDto: metadata as never });
  }
  searchSmart(smart: Record<string, unknown>): Promise<unknown> {
    return searchSmart({ smartSearchDto: smart as never });
  }
}
