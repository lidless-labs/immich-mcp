import { describe, expect, it, vi } from "vitest";
import { UsageError, parseArgs, run, type CliDeps } from "../src/cli.js";
import type { ImmichClient } from "../src/immich-client.js";

const UUID_A = "00000000-0000-0000-0000-000000000001";

function capture(
  client: Partial<Record<keyof ImmichClient, unknown>> = {},
  serve = vi.fn().mockResolvedValue(undefined),
) {
  const out: string[] = [];
  const err: string[] = [];
  let made = 0;
  const deps: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    makeClient: () => {
      made += 1;
      return client as unknown as ImmichClient;
    },
    serve,
  };
  return { out, err, deps, serve, madeCount: () => made };
}

describe("parseArgs", () => {
  it("routes flat read commands with defaults", () => {
    expect(parseArgs(["ping"])).toEqual({ kind: "ping", json: false });
    expect(parseArgs(["storage", "--json"])).toEqual({ kind: "storage", json: true });
    expect(parseArgs(["capabilities"])).toEqual({ kind: "capabilities", json: false });
    expect(parseArgs(["duplicates"])).toEqual({ kind: "duplicates", json: false });
    expect(parseArgs(["jobs"])).toEqual({ kind: "jobs", json: false });
  });

  it("routes server subcommands", () => {
    expect(parseArgs(["server", "info"])).toEqual({ kind: "server-info", json: false });
    expect(parseArgs(["server", "version"])).toEqual({ kind: "server-version", json: false });
    expect(parseArgs(["server", "about"])).toEqual({ kind: "server-about", json: false });
    expect(parseArgs(["server", "stats", "--json"])).toEqual({ kind: "server-stats", json: true });
  });

  it("routes album subcommands and the get positional", () => {
    expect(parseArgs(["albums", "list"])).toEqual({ kind: "albums-list", json: false, shared: undefined });
    expect(parseArgs(["albums", "list", "--shared"])).toEqual({ kind: "albums-list", json: false, shared: true });
    expect(parseArgs(["albums", "stats"])).toEqual({ kind: "albums-stats", json: false });
    expect(parseArgs(["albums", "get", UUID_A])).toEqual({
      kind: "albums-get",
      json: false,
      id: UUID_A,
      withoutAssets: false,
    });
    expect(parseArgs(["albums", "get", UUID_A, "--without-assets"])).toEqual({
      kind: "albums-get",
      json: false,
      id: UUID_A,
      withoutAssets: true,
    });
  });

  it("parses assets list filters with bounds and defaults", () => {
    expect(parseArgs(["assets", "list"])).toEqual({
      kind: "assets-list",
      json: false,
      type: undefined,
      isFavorite: undefined,
      isArchived: undefined,
      takenAfter: undefined,
      takenBefore: undefined,
      size: 50,
      page: 1,
    });
    expect(parseArgs(["assets", "list", "--type", "video", "--favorite", "--size", "10", "--page", "2"])).toEqual({
      kind: "assets-list",
      json: false,
      type: "VIDEO",
      isFavorite: true,
      isArchived: undefined,
      takenAfter: undefined,
      takenBefore: undefined,
      size: 10,
      page: 2,
    });
    expect(parseArgs(["assets", "stats"])).toEqual({ kind: "assets-stats", json: false });
  });

  it("parses people, tags, memories", () => {
    expect(parseArgs(["people", "list", "--with-hidden", "--size", "5"])).toEqual({
      kind: "people-list",
      json: false,
      size: 5,
      page: 1,
      withHidden: true,
    });
    expect(parseArgs(["tags", "list"])).toEqual({ kind: "tags-list", json: false });
    expect(parseArgs(["memories", "--saved", "--size", "3"])).toEqual({
      kind: "memories",
      json: false,
      for: undefined,
      isSaved: true,
      isTrashed: undefined,
      size: 3,
    });
  });

  it("parses search subcommands", () => {
    expect(parseArgs(["search", "metadata", "--city", "Madrid", "--type", "image"])).toEqual({
      kind: "search-metadata",
      json: false,
      query: undefined,
      city: "Madrid",
      country: undefined,
      state: undefined,
      type: "IMAGE",
      takenAfter: undefined,
      takenBefore: undefined,
      size: 50,
      page: 1,
    });
    expect(parseArgs(["search", "smart", "sunset", "over", "the", "ocean"])).toEqual({
      kind: "search-smart",
      json: false,
      query: "sunset over the ocean",
      size: 50,
      page: 1,
    });
  });

  it("routes help, version, and mcp", () => {
    expect(parseArgs([])).toEqual({ kind: "help" });
    expect(parseArgs(["help"])).toEqual({ kind: "help" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["-v"])).toEqual({ kind: "version" });
    expect(parseArgs(["mcp"])).toEqual({ kind: "mcp" });
  });

  it("rejects bad input with UsageError", () => {
    expect(() => parseArgs(["bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["ping", "extra"])).toThrow(UsageError);
    expect(() => parseArgs(["server"])).toThrow(UsageError);
    expect(() => parseArgs(["server", "restart"])).toThrow(UsageError);
    expect(() => parseArgs(["albums", "get"])).toThrow(UsageError);
    expect(() => parseArgs(["search", "smart"])).toThrow(UsageError);
    expect(() => parseArgs(["assets", "list", "--type", "bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["assets", "list", "--size", "9999"])).toThrow(UsageError);
    expect(() => parseArgs(["people", "list", "--size"])).toThrow(UsageError);
  });
});

describe("run", () => {
  it("prints human ping output and exits 0", async () => {
    const client = { ping: vi.fn().mockResolvedValue({ res: "pong" }) };
    const { out, deps, madeCount } = capture(client);
    expect(await run(["ping"], deps)).toBe(0);
    expect(client.ping).toHaveBeenCalledOnce();
    expect(madeCount()).toBe(1);
    expect(out.join("\n")).toContain("pong");
  });

  it("emits raw JSON with --json", async () => {
    const payload = { diskUse: "10 GiB", diskAvailable: "90 GiB" };
    const client = { storage: vi.fn().mockResolvedValue(payload) };
    const { out, deps } = capture(client);
    expect(await run(["storage", "--json"], deps)).toBe(0);
    expect(JSON.parse(out.join("\n"))).toEqual(payload);
  });

  it("passes album get id + withoutAssets to the client", async () => {
    const client = { getAlbum: vi.fn().mockResolvedValue({ albumName: "Trip", id: UUID_A, assets: [] }) };
    const { out, deps } = capture(client);
    expect(await run(["albums", "get", UUID_A, "--without-assets"], deps)).toBe(0);
    expect(client.getAlbum).toHaveBeenCalledWith(UUID_A, true);
    expect(out.join("\n")).toContain("Trip");
  });

  it("forwards asset list filters to the client", async () => {
    const client = { listAssets: vi.fn().mockResolvedValue({ assets: { items: [], total: 0 } }) };
    const { deps } = capture(client);
    expect(await run(["assets", "list", "--type", "image", "--favorite", "--size", "7"], deps)).toBe(0);
    expect(client.listAssets).toHaveBeenCalledWith(
      expect.objectContaining({ type: "IMAGE", isFavorite: true, size: 7, page: 1 }),
    );
  });

  it("renders the people list", async () => {
    const client = {
      listPeople: vi.fn().mockResolvedValue({ people: [{ id: UUID_A, name: "Ada" }], total: 1 }),
    };
    const { out, deps } = capture(client);
    expect(await run(["people", "list"], deps)).toBe(0);
    expect(client.listPeople).toHaveBeenCalledWith({ size: 100, page: 1, withHidden: false });
    expect(out.join("\n")).toContain("Ada");
  });

  it("runs smart search with the joined query", async () => {
    const client = { searchSmart: vi.fn().mockResolvedValue({ assets: { items: [] } }) };
    const { deps } = capture(client);
    expect(await run(["search", "smart", "red", "car"], deps)).toBe(0);
    expect(client.searchSmart).toHaveBeenCalledWith(expect.objectContaining({ query: "red car" }));
  });

  it("returns exit 1 and prints the error on client failure", async () => {
    const client = { serverStatistics: vi.fn().mockRejectedValue(new Error("Immich unreachable: ECONNREFUSED")) };
    const { err, deps } = capture(client);
    expect(await run(["server", "stats"], deps)).toBe(1);
    expect(err.join("\n")).toContain("ECONNREFUSED");
  });

  it("returns exit 2 and prints help on usage error", async () => {
    const { err, deps } = capture();
    expect(await run(["bogus"], deps)).toBe(2);
    expect(err.join("\n")).toContain("Usage:");
  });

  it("prints version without constructing a client", async () => {
    const make = vi.fn();
    const deps: CliDeps = {
      out: () => {},
      err: () => {},
      makeClient: make,
      serve: vi.fn().mockResolvedValue(undefined),
    };
    expect(await run(["--version"], deps)).toBe(0);
    expect(make).not.toHaveBeenCalled();
  });

  it("delegates `mcp` to serve()", async () => {
    const { deps, serve } = capture();
    expect(await run(["mcp"], deps)).toBe(0);
    expect(serve).toHaveBeenCalledOnce();
  });
});
