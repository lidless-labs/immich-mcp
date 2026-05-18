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
  it("formats Immich HTTP errors", () => {
    const e = new Error("nope") as Error & { status: number; data: { message: string } };
    e.status = 404;
    e.data = { message: "Album not found" };
    expect(surfaceError(e)).toBe("Immich API 404: Album not found");
  });
  it("falls back to plain message", () => {
    expect(surfaceError(new Error("boom"))).toBe("boom");
  });
});
