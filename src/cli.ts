import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getConfig } from "./config.js";
import { ImmichClient } from "./immich-client.js";
import pkg from "../package.json" with { type: "json" };

export class UsageError extends Error {}

export type Parsed =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "mcp" }
  | { kind: "ping"; json: boolean }
  | { kind: "server-info"; json: boolean }
  | { kind: "server-version"; json: boolean }
  | { kind: "server-about"; json: boolean }
  | { kind: "server-stats"; json: boolean }
  | { kind: "capabilities"; json: boolean }
  | { kind: "storage"; json: boolean }
  | { kind: "albums-list"; json: boolean; shared?: boolean }
  | { kind: "albums-get"; json: boolean; id: string; withoutAssets: boolean }
  | { kind: "albums-stats"; json: boolean }
  | { kind: "assets-stats"; json: boolean }
  | {
      kind: "assets-list";
      json: boolean;
      type?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      takenAfter?: string;
      takenBefore?: string;
      size: number;
      page: number;
    }
  | { kind: "people-list"; json: boolean; size: number; page: number; withHidden: boolean }
  | { kind: "tags-list"; json: boolean }
  | { kind: "duplicates"; json: boolean }
  | { kind: "jobs"; json: boolean }
  | {
      kind: "memories";
      json: boolean;
      for?: string;
      isSaved?: boolean;
      isTrashed?: boolean;
      size?: number;
    }
  | {
      kind: "search-metadata";
      json: boolean;
      query?: string;
      city?: string;
      country?: string;
      state?: string;
      type?: string;
      takenAfter?: string;
      takenBefore?: string;
      size: number;
      page: number;
    }
  | { kind: "search-smart"; json: boolean; query: string; size: number; page: number };

export const HELP = `immichctrl - read-only operator CLI for an Immich photo server

Usage:
  immichctrl <command> [subcommand] [options]

Server (read-only):
  ping                       Verify connectivity (server pong)
  server info                Server config (login page, OAuth, theme, ...)
  server version             Immich server version
  server about               Build / version / repository details
  server stats               Photo, video, and user counts + per-user storage
  capabilities               Enabled features (search, ML, OAuth, ...)
  storage                    Disk used / available / total + storage template

Library (read-only):
  albums list                List albums (--shared to filter)
  albums get <id>            Get one album (--without-assets to omit assets)
  albums stats               Owned vs shared vs not-shared album counts
  assets list                List/search assets (filters below)
  assets stats               Per-user image + video counts
  people list                List recognized people
  tags list                  List all tags
  duplicates                 Report detected duplicate asset groups
  jobs                       Background job queue status
  memories                   List memory lanes (years-ago, etc.)

Search (read-only):
  search metadata            Metadata search (date, location, type, ...)
  search smart <query>       CLIP / semantic search (natural language)

Other:
  help                       Show this help
  mcp                        Start the MCP server over stdio

Global options:
  --json                     Emit raw JSON instead of human-readable text
  --version, -v              Print version
  --help, -h                 Show help

assets list options:
  --type <t>                 IMAGE | VIDEO | AUDIO | OTHER
  --favorite                 Only favorites
  --archived                 Only archived
  --taken-after <iso>        ISO 8601 datetime lower bound
  --taken-before <iso>       ISO 8601 datetime upper bound
  --size <n>                 Page size, 1-1000               (default 50)
  --page <n>                 Page number, >= 1               (default 1)

people list options:
  --size <n>                 Page size, 1-1000               (default 100)
  --page <n>                 Page number, >= 1               (default 1)
  --with-hidden              Include hidden people

memories options:
  --for <iso>                Anchor date (ISO 8601 datetime)
  --saved                    Only saved memories
  --trashed                  Only trashed memories
  --size <n>                 Max entries, 1-1000

search metadata options:
  --query <text>             Free-text query
  --city / --country / --state <name>
  --type <t>                 IMAGE | VIDEO | AUDIO | OTHER
  --taken-after <iso> / --taken-before <iso>
  --size <n>                 Page size, 1-1000               (default 50)
  --page <n>                 Page number, >= 1               (default 1)

search smart options:
  --size <n>                 Page size, 1-1000               (default 50)
  --page <n>                 Page number, >= 1               (default 1)

Environment:
  IMMICH_BASE_URL            Immich API base URL (e.g. https://photos.example.com/api)
  IMMICH_API_KEY             Immich API key
  IMMICH_VERIFY_SSL          Set false/0 to skip TLS verification (default true)`;

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function takeOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) throw new UsageError(`${name} requires a value`);
  args.splice(i, 2);
  return v;
}

function ensureNoExtra(args: string[]): void {
  if (args.length) throw new UsageError(`Unexpected arguments: ${args.join(" ")}`);
}

function parseInt1000(v: string | undefined, name: string, dflt: number, min: number, max: number): number {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new UsageError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return n;
}

function parseType(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.toUpperCase();
  if (!["IMAGE", "VIDEO", "AUDIO", "OTHER"].includes(t)) {
    throw new UsageError("--type must be one of: IMAGE, VIDEO, AUDIO, OTHER");
  }
  return t;
}

// Dispatch a "<cmd> <subcommand>" pair to its Parsed kind.
function parseSub(
  args: string[],
  cmd: string,
  allowed: string[],
): { sub: string; rest: string[] } {
  const sub = args.shift();
  if (!sub) throw new UsageError(`${cmd} requires a subcommand: ${allowed.join(" | ")}`);
  if (!allowed.includes(sub)) {
    throw new UsageError(`Unknown ${cmd} subcommand: ${sub}. Expected: ${allowed.join(" | ")}`);
  }
  return { sub, rest: args };
}

export function parseArgs(argv: string[]): Parsed {
  const args = [...argv];
  if (args.includes("-h") || args.includes("--help")) return { kind: "help" };
  if (args.includes("-v") || args.includes("--version")) return { kind: "version" };

  const cmd = args.shift();
  if (!cmd || cmd === "help") return { kind: "help" };
  if (cmd === "mcp") {
    ensureNoExtra(args);
    return { kind: "mcp" };
  }

  const json = takeFlag(args, "--json");

  switch (cmd) {
    case "ping":
      ensureNoExtra(args);
      return { kind: "ping", json };
    case "capabilities":
      ensureNoExtra(args);
      return { kind: "capabilities", json };
    case "storage":
      ensureNoExtra(args);
      return { kind: "storage", json };
    case "duplicates":
      ensureNoExtra(args);
      return { kind: "duplicates", json };
    case "jobs":
      ensureNoExtra(args);
      return { kind: "jobs", json };
    case "tags": {
      const { sub } = parseSub(args, "tags", ["list"]);
      ensureNoExtra(args);
      void sub;
      return { kind: "tags-list", json };
    }
    case "server": {
      const { sub } = parseSub(args, "server", ["info", "version", "about", "stats"]);
      ensureNoExtra(args);
      if (sub === "info") return { kind: "server-info", json };
      if (sub === "version") return { kind: "server-version", json };
      if (sub === "about") return { kind: "server-about", json };
      return { kind: "server-stats", json };
    }
    case "albums": {
      const { sub } = parseSub(args, "albums", ["list", "get", "stats"]);
      if (sub === "list") {
        const shared = takeFlag(args, "--shared");
        ensureNoExtra(args);
        return { kind: "albums-list", json, shared: shared ? true : undefined };
      }
      if (sub === "get") {
        const withoutAssets = takeFlag(args, "--without-assets");
        const id = args.shift();
        if (!id || id.startsWith("--")) throw new UsageError("albums get requires an <id>");
        ensureNoExtra(args);
        return { kind: "albums-get", json, id, withoutAssets };
      }
      ensureNoExtra(args);
      return { kind: "albums-stats", json };
    }
    case "assets": {
      const { sub } = parseSub(args, "assets", ["list", "stats"]);
      if (sub === "stats") {
        ensureNoExtra(args);
        return { kind: "assets-stats", json };
      }
      const type = parseType(takeOption(args, "--type"));
      const isFavorite = takeFlag(args, "--favorite") ? true : undefined;
      const isArchived = takeFlag(args, "--archived") ? true : undefined;
      const takenAfter = takeOption(args, "--taken-after");
      const takenBefore = takeOption(args, "--taken-before");
      const size = parseInt1000(takeOption(args, "--size"), "--size", 50, 1, 1000);
      const page = parseInt1000(takeOption(args, "--page"), "--page", 1, 1, 1_000_000);
      ensureNoExtra(args);
      return { kind: "assets-list", json, type, isFavorite, isArchived, takenAfter, takenBefore, size, page };
    }
    case "people": {
      const { sub } = parseSub(args, "people", ["list"]);
      void sub;
      const size = parseInt1000(takeOption(args, "--size"), "--size", 100, 1, 1000);
      const page = parseInt1000(takeOption(args, "--page"), "--page", 1, 1, 1_000_000);
      const withHidden = takeFlag(args, "--with-hidden");
      ensureNoExtra(args);
      return { kind: "people-list", json, size, page, withHidden };
    }
    case "memories": {
      const forDate = takeOption(args, "--for");
      const isSaved = takeFlag(args, "--saved") ? true : undefined;
      const isTrashed = takeFlag(args, "--trashed") ? true : undefined;
      const sizeStr = takeOption(args, "--size");
      const size = sizeStr === undefined ? undefined : parseInt1000(sizeStr, "--size", 50, 1, 1000);
      ensureNoExtra(args);
      return { kind: "memories", json, for: forDate, isSaved, isTrashed, size };
    }
    case "search": {
      const { sub } = parseSub(args, "search", ["metadata", "smart"]);
      if (sub === "smart") {
        const size = parseInt1000(takeOption(args, "--size"), "--size", 50, 1, 1000);
        const page = parseInt1000(takeOption(args, "--page"), "--page", 1, 1, 1_000_000);
        const query = args.join(" ").trim();
        if (!query) throw new UsageError("search smart requires a <query>");
        return { kind: "search-smart", json, query, size, page };
      }
      const query = takeOption(args, "--query");
      const city = takeOption(args, "--city");
      const country = takeOption(args, "--country");
      const state = takeOption(args, "--state");
      const type = parseType(takeOption(args, "--type"));
      const takenAfter = takeOption(args, "--taken-after");
      const takenBefore = takeOption(args, "--taken-before");
      const size = parseInt1000(takeOption(args, "--size"), "--size", 50, 1, 1000);
      const page = parseInt1000(takeOption(args, "--page"), "--page", 1, 1, 1_000_000);
      ensureNoExtra(args);
      return { kind: "search-metadata", json, query, city, country, state, type, takenAfter, takenBefore, size, page };
    }
    default:
      throw new UsageError(`Unknown command: ${cmd}`);
  }
}

// ---------- renderers (concise human-readable; --json bypasses these) ----------

function rec(x: unknown): Record<string, unknown> {
  return (x ?? {}) as Record<string, unknown>;
}

function kv(...pairs: Array<[string, unknown]>): string {
  return pairs
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function renderPing(r: unknown): string {
  const res = rec(r).res;
  return `pong: ${res ?? JSON.stringify(r)}`;
}

function renderServerInfo(r: unknown): string {
  const s = rec(r);
  return kv(
    ["isInitialized", s.isInitialized],
    ["isOnboarded", s.isOnboarded],
    ["loginPageMessage", s.loginPageMessage],
    ["oauthEnabled", s.oauth],
  ) || JSON.stringify(r, null, 2);
}

function renderVersion(r: unknown): string {
  const s = rec(r);
  if (s.major !== undefined) return `version: ${s.major}.${s.minor}.${s.patch}`;
  return JSON.stringify(r, null, 2);
}

function renderAbout(r: unknown): string {
  const s = rec(r);
  return kv(
    ["version", s.version],
    ["versionUrl", s.versionUrl],
    ["repository", s.repository],
    ["sourceRef", s.sourceRef],
    ["nodejs", s.nodejs],
    ["build", s.build],
  ) || JSON.stringify(r, null, 2);
}

function renderServerStats(r: unknown): string {
  const s = rec(r);
  const lines = [
    ...["photos", "videos", "usage"].filter((k) => s[k] !== undefined).map((k) => `${k}: ${s[k]}`),
  ];
  const usersById = s.usageByUser;
  if (Array.isArray(usersById)) {
    lines.push(`users: ${usersById.length}`);
    for (const u of usersById.slice(0, 10)) {
      const uu = rec(u);
      lines.push(`  ${uu.userName ?? uu.userId}: photos=${uu.photos ?? "?"} videos=${uu.videos ?? "?"} usage=${uu.usage ?? "?"}`);
    }
  }
  return lines.length ? lines.join("\n") : JSON.stringify(r, null, 2);
}

function renderCapabilities(r: unknown): string {
  const s = rec(r);
  const entries = Object.entries(s);
  if (!entries.length) return JSON.stringify(r, null, 2);
  return entries.map(([k, v]) => `${k}: ${v}`).join("\n");
}

function renderStorage(r: unknown): string {
  const s = rec(r);
  return kv(
    ["diskUse", s.diskUse],
    ["diskAvailable", s.diskAvailable],
    ["diskSize", s.diskSize],
    ["diskUsagePercentage", s.diskUsagePercentage],
  ) || JSON.stringify(r, null, 2);
}

function renderAlbumsList(r: unknown): string {
  const albums = Array.isArray(r) ? r : [];
  if (!albums.length) return "No albums.";
  const lines = [`${albums.length} album(s):`];
  for (const a of albums) {
    const aa = rec(a);
    lines.push(`  ${aa.albumName ?? "?"}  assets=${aa.assetCount ?? "?"}  shared=${aa.shared ?? false}  id=${aa.id ?? "?"}`);
  }
  return lines.join("\n");
}

function renderAlbumGet(r: unknown): string {
  const a = rec(r);
  const assets = Array.isArray(a.assets) ? a.assets : [];
  return [
    kv(
      ["albumName", a.albumName],
      ["id", a.id],
      ["description", a.description],
      ["assetCount", a.assetCount],
      ["shared", a.shared],
    ),
    `assets returned: ${assets.length}`,
  ].join("\n");
}

function renderAlbumStats(r: unknown): string {
  const s = rec(r);
  return kv(["owned", s.owned], ["shared", s.shared], ["notShared", s.notShared]) || JSON.stringify(r, null, 2);
}

function renderAssetStats(r: unknown): string {
  const s = rec(r);
  return kv(["images", s.images], ["videos", s.videos], ["total", s.total]) || JSON.stringify(r, null, 2);
}

function assetItems(r: unknown): unknown[] {
  const a = rec(r).assets;
  const items = rec(a).items;
  return Array.isArray(items) ? items : [];
}

function renderAssetsList(r: unknown): string {
  const items = assetItems(r);
  if (!items.length) return "No assets matched.";
  const total = rec(rec(r).assets).total;
  const lines = [`${items.length} asset(s)${total !== undefined ? ` of ${total}` : ""}:`];
  for (const it of items) {
    const a = rec(it);
    lines.push(`  ${a.localDateTime ?? a.fileCreatedAt ?? "?"}  [${a.type ?? "?"}]  ${a.originalFileName ?? "?"}  id=${a.id ?? "?"}`);
  }
  return lines.join("\n");
}

function renderPeople(r: unknown): string {
  const s = rec(r);
  const people = Array.isArray(s.people) ? s.people : [];
  if (!people.length) return "No people.";
  const lines = [`${people.length} person(s)${s.total !== undefined ? ` of ${s.total}` : ""}:`];
  for (const p of people) {
    const pp = rec(p);
    lines.push(`  ${pp.name && String(pp.name).trim() ? pp.name : "(unnamed)"}  hidden=${pp.isHidden ?? false}  id=${pp.id ?? "?"}`);
  }
  return lines.join("\n");
}

function renderTags(r: unknown): string {
  const tags = Array.isArray(r) ? r : [];
  if (!tags.length) return "No tags.";
  const lines = [`${tags.length} tag(s):`];
  for (const t of tags) {
    const tt = rec(t);
    lines.push(`  ${tt.value ?? tt.name ?? "?"}  id=${tt.id ?? "?"}`);
  }
  return lines.join("\n");
}

function renderDuplicates(r: unknown): string {
  const groups = Array.isArray(r) ? r : [];
  if (!groups.length) return "No duplicate groups.";
  const lines = [`${groups.length} duplicate group(s):`];
  for (const g of groups) {
    const gg = rec(g);
    const assets = Array.isArray(gg.assets) ? gg.assets : [];
    lines.push(`  ${gg.duplicateId ?? "?"}: ${assets.length} asset(s)`);
  }
  return lines.join("\n");
}

function renderJobs(r: unknown): string {
  const s = rec(r);
  const entries = Object.entries(s);
  if (!entries.length) return JSON.stringify(r, null, 2);
  const lines: string[] = [];
  for (const [name, q] of entries) {
    const qq = rec(q);
    const counts = rec(qq.jobCounts);
    const active = counts.active ?? 0;
    const waiting = counts.waiting ?? 0;
    const failed = counts.failed ?? 0;
    const paused = rec(qq.queueStatus).isPaused ?? false;
    lines.push(`  ${name}: active=${active} waiting=${waiting} failed=${failed} paused=${paused}`);
  }
  return lines.join("\n");
}

function renderMemories(r: unknown): string {
  const mems = Array.isArray(r) ? r : [];
  if (!mems.length) return "No memories.";
  const lines = [`${mems.length} memory lane(s):`];
  for (const m of mems) {
    const mm = rec(m);
    const assets = Array.isArray(mm.assets) ? mm.assets : [];
    lines.push(`  ${mm.memoryAt ?? mm.createdAt ?? "?"}  [${mm.type ?? "?"}]  ${assets.length} asset(s)  id=${mm.id ?? "?"}`);
  }
  return lines.join("\n");
}

export interface CliDeps {
  out: (s: string) => void;
  err: (s: string) => void;
  makeClient: () => ImmichClient;
  serve: () => Promise<void>;
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    deps.err("");
    deps.err(HELP);
    return 2;
  }

  if (parsed.kind === "help") {
    deps.out(HELP);
    return 0;
  }
  if (parsed.kind === "version") {
    deps.out(pkg.version);
    return 0;
  }
  if (parsed.kind === "mcp") {
    await deps.serve();
    return 0;
  }

  const emit = (raw: unknown, render: () => string, json: boolean): void => {
    deps.out(json ? JSON.stringify(raw, null, 2) : render());
  };

  const client = deps.makeClient();
  try {
    switch (parsed.kind) {
      case "ping": {
        const r = await client.ping();
        emit(r, () => renderPing(r), parsed.json);
        return 0;
      }
      case "server-info": {
        const r = await client.serverInfo();
        emit(r, () => renderServerInfo(r), parsed.json);
        return 0;
      }
      case "server-version": {
        const r = await client.serverVersion();
        emit(r, () => renderVersion(r), parsed.json);
        return 0;
      }
      case "server-about": {
        const r = await client.serverAbout();
        emit(r, () => renderAbout(r), parsed.json);
        return 0;
      }
      case "server-stats": {
        const r = await client.serverStatistics();
        emit(r, () => renderServerStats(r), parsed.json);
        return 0;
      }
      case "capabilities": {
        const r = await client.capabilities();
        emit(r, () => renderCapabilities(r), parsed.json);
        return 0;
      }
      case "storage": {
        const r = await client.storage();
        emit(r, () => renderStorage(r), parsed.json);
        return 0;
      }
      case "albums-list": {
        const r = await client.listAlbums({ shared: parsed.shared });
        emit(r, () => renderAlbumsList(r), parsed.json);
        return 0;
      }
      case "albums-get": {
        const r = await client.getAlbum(parsed.id, parsed.withoutAssets);
        emit(r, () => renderAlbumGet(r), parsed.json);
        return 0;
      }
      case "albums-stats": {
        const r = await client.albumStatistics();
        emit(r, () => renderAlbumStats(r), parsed.json);
        return 0;
      }
      case "assets-stats": {
        const r = await client.assetStatistics();
        emit(r, () => renderAssetStats(r), parsed.json);
        return 0;
      }
      case "assets-list": {
        const r = await client.listAssets({
          type: parsed.type,
          isFavorite: parsed.isFavorite,
          isArchived: parsed.isArchived,
          takenAfter: parsed.takenAfter,
          takenBefore: parsed.takenBefore,
          size: parsed.size,
          page: parsed.page,
        });
        emit(r, () => renderAssetsList(r), parsed.json);
        return 0;
      }
      case "people-list": {
        const r = await client.listPeople({ size: parsed.size, page: parsed.page, withHidden: parsed.withHidden });
        emit(r, () => renderPeople(r), parsed.json);
        return 0;
      }
      case "tags-list": {
        const r = await client.listTags();
        emit(r, () => renderTags(r), parsed.json);
        return 0;
      }
      case "duplicates": {
        const r = await client.listDuplicates();
        emit(r, () => renderDuplicates(r), parsed.json);
        return 0;
      }
      case "jobs": {
        const r = await client.listJobs();
        emit(r, () => renderJobs(r), parsed.json);
        return 0;
      }
      case "memories": {
        const r = await client.listMemories({
          for: parsed.for,
          isSaved: parsed.isSaved,
          isTrashed: parsed.isTrashed,
          size: parsed.size,
        });
        emit(r, () => renderMemories(r), parsed.json);
        return 0;
      }
      case "search-metadata": {
        const r = await client.searchMetadata({
          query: parsed.query,
          city: parsed.city,
          country: parsed.country,
          state: parsed.state,
          type: parsed.type,
          takenAfter: parsed.takenAfter,
          takenBefore: parsed.takenBefore,
          size: parsed.size,
          page: parsed.page,
        });
        emit(r, () => renderAssetsList(r), parsed.json);
        return 0;
      }
      case "search-smart": {
        const r = await client.searchSmart({ query: parsed.query, size: parsed.size, page: parsed.page });
        emit(r, () => renderAssetsList(r), parsed.json);
        return 0;
      }
    }
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  return 0;
}

// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing.
const isEntrypoint = (() => {
  const arg = process.argv[1];
  if (typeof arg !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  run(process.argv.slice(2), {
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
    makeClient: () => new ImmichClient(getConfig()),
    serve: async () => {
      const { serve } = await import("./index.js");
      await serve();
    },
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
