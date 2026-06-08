import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  requireWrites,
  requireConfirm,
  surfaceError,
  resolveUploadPath,
  WriteDisabledError,
  ConfirmRequiredError,
  UploadPathError,
} from "../src/tools/_util.js";
import type { Config } from "../src/config.js";

const cfg = (allowWrites: boolean) => ({
  baseUrl: "https://x/api",
  apiKey: "k",
  allowWrites,
  verifySsl: true,
});

describe("requireWrites", () => {
  it("throws when writes disabled", () => {
    expect(() => requireWrites(cfg(false))).toThrow(WriteDisabledError);
  });
  it("passes when writes enabled", () => {
    expect(() => requireWrites(cfg(true))).not.toThrow();
  });
});

describe("requireConfirm", () => {
  it("throws without confirm: true", () => {
    expect(() => requireConfirm("foo", undefined)).toThrow(ConfirmRequiredError);
    expect(() => requireConfirm("foo", false as unknown as boolean)).toThrow(ConfirmRequiredError);
  });
  it("passes with confirm: true", () => {
    expect(() => requireConfirm("foo", true)).not.toThrow();
  });
});

describe("surfaceError", () => {
  it("falls back to plain message", () => {
    expect(surfaceError(new Error("boom"))).toBe("boom");
  });

  it("401 returns auth-failed sentinel", () => {
    const e = new Error("unauthorized") as Error & { status: number };
    e.status = 401;
    expect(surfaceError(e)).toBe("Immich auth failed - check IMMICH_API_KEY");
  });

  it("403 includes 'forbidden' and the server message", () => {
    const e = new Error("no") as Error & { status: number; data: { message: string } };
    e.status = 403;
    e.data = { message: "API key lacks album.write" };
    const out = surfaceError(e);
    expect(out).toContain("forbidden");
    expect(out).toContain("API key lacks album.write");
  });

  it("404 includes 'not found' and the server message", () => {
    const e = new Error("nope") as Error & { status: number; data: { message: string } };
    e.status = 404;
    e.data = { message: "Album not found" };
    const out = surfaceError(e);
    expect(out).toContain("not found");
    expect(out).toContain("Album not found");
  });

  it("429 includes 'rate-limited'", () => {
    const e = new Error("slow down") as Error & { status: number };
    e.status = 429;
    expect(surfaceError(e)).toContain("rate-limited");
  });

  it("503 includes 'server error 503'", () => {
    const e = new Error("down") as Error & { status: number };
    e.status = 503;
    expect(surfaceError(e)).toContain("server error 503");
  });

  it("418 (custom) falls back to 'Immich API 418:'", () => {
    const e = new Error("teapot") as Error & { status: number; data: { message: string } };
    e.status = 418;
    e.data = { message: "i'm a teapot" };
    expect(surfaceError(e)).toBe("Immich API 418: i'm a teapot");
  });
});

describe("resolveUploadPath", () => {
  let root: string; // temp root containing base/ and an outside/ sibling
  let baseDir: string;
  let insideFile: string;
  let outsideFile: string;

  const withBase = (uploadBaseDir: string | undefined): Config => ({
    baseUrl: "https://x/api",
    apiKey: "k",
    allowWrites: true,
    verifySsl: true,
    uploadBaseDir,
  });

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "immich-upload-test-"));
    baseDir = path.join(root, "base");
    await fs.mkdir(baseDir);
    insideFile = path.join(baseDir, "photo.jpg");
    await fs.writeFile(insideFile, "inside");
    outsideFile = path.join(root, "secret.txt");
    await fs.writeFile(outsideFile, "secret");
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("refuses path-based upload when IMMICH_UPLOAD_BASE_DIR is unset", async () => {
    await expect(resolveUploadPath(withBase(undefined), insideFile)).rejects.toBeInstanceOf(
      UploadPathError,
    );
  });

  it("accepts a file inside the base dir (absolute path)", async () => {
    const out = await resolveUploadPath(withBase(baseDir), insideFile);
    expect(out).toBe(await fs.realpath(insideFile));
  });

  it("accepts a relative path resolved against the base dir", async () => {
    const out = await resolveUploadPath(withBase(baseDir), "photo.jpg");
    expect(out).toBe(await fs.realpath(insideFile));
  });

  it("rejects a file outside the base dir", async () => {
    await expect(resolveUploadPath(withBase(baseDir), outsideFile)).rejects.toBeInstanceOf(
      UploadPathError,
    );
  });

  it("rejects '..' traversal that escapes the base dir", async () => {
    await expect(
      resolveUploadPath(withBase(baseDir), path.join(baseDir, "..", "secret.txt")),
    ).rejects.toBeInstanceOf(UploadPathError);
  });

  it("rejects a symlink inside the base dir that points outside it", async () => {
    const link = path.join(baseDir, "link-to-secret");
    await fs.symlink(outsideFile, link);
    await expect(resolveUploadPath(withBase(baseDir), link)).rejects.toBeInstanceOf(
      UploadPathError,
    );
    await fs.rm(link, { force: true });
  });

  it("rejects when the base dir does not exist", async () => {
    await expect(
      resolveUploadPath(withBase(path.join(root, "nope")), insideFile),
    ).rejects.toBeInstanceOf(UploadPathError);
  });
});
