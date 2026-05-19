import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as sdk from "@immich/sdk";
import type { Config } from "../config.js";
import {
  asMcpResponse,
  asMcpError,
  surfaceError,
  requireWrites,
  requireConfirm,
} from "./_util.js";

interface DupAsset {
  id: string;
  originalFileName?: string;
  fileCreatedAt?: string;
  exifInfo?: { fileSizeInByte?: number | string };
}

interface DupGroup {
  duplicateId: string;
  assets: DupAsset[];
}

type Category = "byte_exact" | "resolution_variants" | "burst_sequence" | "edits" | "unknown";

function fileSize(a: DupAsset): number {
  return Number(a.exifInfo?.fileSizeInByte ?? 0);
}

function byteDupeSubgroups(group: DupGroup): Map<string, DupAsset[]> {
  const buckets = new Map<string, DupAsset[]>();
  for (const a of group.assets) {
    const key = `${a.originalFileName ?? ""}|${fileSize(a)}`;
    const arr = buckets.get(key) ?? [];
    arr.push(a);
    buckets.set(key, arr);
  }
  for (const k of [...buckets.keys()]) {
    if ((buckets.get(k) ?? []).length < 2) buckets.delete(k);
  }
  return buckets;
}

function categorize(g: DupGroup): Category {
  if (byteDupeSubgroups(g).size > 0) return "byte_exact";
  const names = g.assets.map((a) => a.originalFileName ?? "");
  if (names.some((n) => /1080p|4k|720p|480p|\bhd\b|\bsd\b|\blow\b|\bhigh\b/i.test(n))) {
    return "resolution_variants";
  }
  const tsRe = /^(\d{8}_\d{6})/;
  const prefixes = names.map((n) => n.match(tsRe)?.[1] ?? "");
  if (prefixes.every((p) => p && p === prefixes[0])) return "burst_sequence";
  if (names.some((n) => / - Copy\.|\(\d+\)\.|_edited\.|_retouch\./i.test(n))) return "edits";
  return "unknown";
}

function pickKeeper(bucket: DupAsset[], strategy: "oldest" | "largest"): DupAsset {
  const sorted = [...bucket];
  if (strategy === "oldest") {
    sorted.sort((a, b) => (a.fileCreatedAt ?? "").localeCompare(b.fileCreatedAt ?? ""));
  } else {
    sorted.sort((a, b) => fileSize(b) - fileSize(a));
  }
  return sorted[0]!;
}

// Bucket detail shape used by both find_byte_dupes and resolve_with_keep_strategy.
export type EnrichedAssetRef = {
  id: string;
  filename: string;
  size: number;
  fileCreatedAt: string | undefined;
  albumIds: string[];
  albumNames: string[];
  webUrl?: string;
};
export type EnrichedBucket = {
  duplicateId: string;
  filename: string;
  size: number;
  reclaimableBytes: number;
  matchReason: "byte-exact" | "perceptual-clip" | "resolution-variants" | "burst-sequence" | "edits";
  keeper: EnrichedAssetRef;
  discards: EnrichedAssetRef[];
  flagged?: { reason: string };
};

// Album lookup: returns Map<assetId, Array<{ id, name }>>.
export async function buildAssetAlbumIndex(): Promise<Map<string, { id: string; name: string }[]>> {
  const map = new Map<string, { id: string; name: string }[]>();
  try {
    const albums = (await sdk.getAllAlbums({})) as unknown as Array<{ id: string; albumName: string }>;
    for (const album of albums) {
      try {
        const detail = (await sdk.getAlbumInfo({ id: album.id })) as unknown as {
          albumName?: string;
          assets?: Array<{ id: string }>;
        };
        const name = detail.albumName ?? album.albumName;
        for (const a of detail.assets ?? []) {
          const arr = map.get(a.id) ?? [];
          arr.push({ id: album.id, name });
          map.set(a.id, arr);
        }
      } catch { /* skip unreadable album */ }
    }
  } catch { /* return empty if albums endpoint fails */ }
  return map;
}

export function enrichAsset(
  a: DupAsset,
  index: Map<string, { id: string; name: string }[]>,
  webBaseUrl?: string,
): EnrichedAssetRef {
  const albums = index.get(a.id) ?? [];
  return {
    id: a.id,
    filename: a.originalFileName ?? "",
    size: fileSize(a),
    fileCreatedAt: a.fileCreatedAt,
    albumIds: albums.map((x) => x.id),
    albumNames: albums.map((x) => x.name),
    webUrl: webBaseUrl ? `${webBaseUrl.replace(/\/+$/, "")}/photos/${a.id}` : undefined,
  };
}

// Keeper selection with optional album awareness.
export function pickKeeperWithAlbums(
  bucket: DupAsset[],
  strategy: "oldest" | "largest",
  albumIndex: Map<string, { id: string; name: string }[]>,
  albumAware: boolean,
): { keeper: DupAsset | null; flagged?: { reason: string } } {
  if (albumAware) {
    const inAlbum = bucket.filter((a) => (albumIndex.get(a.id) ?? []).length > 0);
    if (inAlbum.length === 1) return { keeper: inAlbum[0]! };
    if (inAlbum.length > 1) {
      return {
        keeper: null,
        flagged: { reason: `${inAlbum.length} assets in albums (split curation), skipped for safety` },
      };
    }
    // Fall through to strategy when none are in albums.
  }
  return { keeper: pickKeeper(bucket, strategy) };
}

// Restore note string emitted by resolve responses.
export const RESTORE_NOTE =
  "Trashed assets are recoverable for 30 days. Use immich_restore_by_query (or your Immich web UI > Library > Trash) to restore. Permanent removal: auto at 30d OR via immich_empty_trash (writes + confirm).";

export function registerDuplicateFlowTools(server: McpServer, config: Config): void {
  server.tool(
    "immich_categorize_duplicates",
    "Bin duplicate groups by shape: byte_exact, resolution_variants, burst_sequence, edits, unknown. Returns counts plus up to 3 sample groups per category.",
    {},
    async () => {
      try {
        const raw = await sdk.getAssetDuplicates();
        const groups = raw as unknown as DupGroup[];
        const cats: Record<Category, DupGroup[]> = {
          byte_exact: [],
          resolution_variants: [],
          burst_sequence: [],
          edits: [],
          unknown: [],
        };
        for (const g of groups) cats[categorize(g)].push(g);
        const byCategory = Object.fromEntries(
          (Object.entries(cats) as [Category, DupGroup[]][]).map(([k, v]) => [k, v.length]),
        );
        const samples = Object.fromEntries(
          (Object.entries(cats) as [Category, DupGroup[]][]).map(([k, v]) => [k, v.slice(0, 3)]),
        );
        return asMcpResponse({ total: groups.length, byCategory, samples });
      } catch (e) {
        return asMcpError(surfaceError(e));
      }
    },
  );

  server.tool(
    "immich_find_byte_dupes",
    "Return ready-to-trash candidates: per (filename, size) bucket inside each duplicate group, keep the oldest, list the rest as discardIds.",
    { minSizeBytes: z.number().int().min(0).optional() },
    async ({ minSizeBytes }) => {
      try {
        const raw = await sdk.getAssetDuplicates();
        const groups = raw as unknown as DupGroup[];
        const min = minSizeBytes ?? 0;
        const candidates: Array<{
          duplicateId: string;
          filename: string;
          size: number;
          keeperId: string;
          discardIds: string[];
          reclaimableBytes: number;
          matchReason: "byte-exact";
        }> = [];
        let totalDiscardAssets = 0;
        let totalReclaimable = 0;
        for (const g of groups) {
          const buckets = byteDupeSubgroups(g);
          for (const [key, bucket] of buckets.entries()) {
            const keeper = pickKeeper(bucket, "oldest");
            const size = fileSize(keeper);
            if (size < min) continue;
            const discards = bucket.filter((a) => a.id !== keeper.id);
            const reclaim = discards.reduce((s, a) => s + fileSize(a), 0);
            const [filename] = key.split("|");
            candidates.push({
              duplicateId: g.duplicateId,
              filename: filename ?? "",
              size,
              keeperId: keeper.id,
              discardIds: discards.map((a) => a.id),
              reclaimableBytes: reclaim,
              matchReason: "byte-exact",
            });
            totalDiscardAssets += discards.length;
            totalReclaimable += reclaim;
          }
        }
        return asMcpResponse({
          candidates,
          totalCandidates: candidates.length,
          totalDiscardAssets,
          totalReclaimableBytes: totalReclaimable,
        });
      } catch (e) {
        return asMcpError(surfaceError(e));
      }
    },
  );

  server.tool(
    "immich_resolve_with_keep_strategy",
    "End-to-end dedupe. Dry-run by default. delete: true + writes enabled = soft trash (recoverable). permanent: true + confirm: true = bypass trash.",
    {
      strategy: z.enum(["byte_dupes_keep_oldest", "byte_dupes_keep_largest"]),
      minSizeBytes: z.number().int().min(0).optional(),
      delete: z.boolean().optional(),
      permanent: z.boolean().optional(),
      confirm: z.boolean().optional(),
      maxDiscards: z.number().int().min(1).max(20000).optional(),
    },
    async (args) => {
      try {
        const cap = args.maxDiscards ?? 5000;
        const raw = await sdk.getAssetDuplicates();
        const groups = raw as unknown as DupGroup[];
        const keepBy = args.strategy === "byte_dupes_keep_largest" ? "largest" : "oldest";
        const discardIds: string[] = [];
        let reclaim = 0;
        let buckets = 0;
        const min = args.minSizeBytes ?? 0;
        for (const g of groups) {
          for (const bucket of byteDupeSubgroups(g).values()) {
            const keeper = pickKeeper(bucket, keepBy);
            if (fileSize(keeper) < min) continue;
            buckets++;
            for (const a of bucket) {
              if (a.id === keeper.id) continue;
              discardIds.push(a.id);
              reclaim += fileSize(a);
            }
          }
        }
        const plan = {
          strategy: args.strategy,
          bucketsResolved: buckets,
          discardCount: discardIds.length,
          reclaimableBytes: reclaim,
        };
        if (args.delete !== true) {
          return asMcpResponse({ dryRun: true, plan, restoreNote: RESTORE_NOTE });
        }
        requireWrites(config);
        if (args.permanent === true) requireConfirm("immich_resolve_with_keep_strategy", args.confirm);
        if (discardIds.length > cap) {
          return asMcpError(
            `discard list is ${discardIds.length}, exceeds maxDiscards=${cap}. Raise maxDiscards or lower scope.`,
          );
        }
        const BATCH = 500;
        let deleted = 0;
        for (let i = 0; i < discardIds.length; i += BATCH) {
          const slice = discardIds.slice(i, i + BATCH);
          await sdk.deleteAssets({ assetBulkDeleteDto: { ids: slice, force: args.permanent ?? false } as never });
          deleted += slice.length;
        }
        return asMcpResponse({
          dryRun: false,
          executed: true,
          strategy: args.strategy,
          deletedCount: deleted,
          reclaimedBytes: reclaim,
          permanent: args.permanent ?? false,
          restoreNote: RESTORE_NOTE,
        });
      } catch (e) {
        return asMcpError(surfaceError(e));
      }
    },
  );
}
