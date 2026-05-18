import { describe, it, expect } from "vitest";
import {
  requireWrites,
  requireConfirm,
  surfaceError,
  WriteDisabledError,
  ConfirmRequiredError,
} from "../src/tools/_util.js";

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
