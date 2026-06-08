import { promises as fs } from "node:fs";
import path from "node:path";
import type { Config } from "../config.js";

export class WriteDisabledError extends Error {
  constructor() {
    super(
      "Writes disabled. Set IMMICH_ALLOW_WRITES=true to enable destructive and modifying tools.",
    );
    this.name = "WriteDisabledError";
  }
}

export class ConfirmRequiredError extends Error {
  constructor(toolName: string) {
    super(
      `${toolName} is destructive. Pass { confirm: true } in tool args to proceed.`,
    );
    this.name = "ConfirmRequiredError";
  }
}

export function requireWrites(config: Config): void {
  if (!config.allowWrites) {
    throw new WriteDisabledError();
  }
}

export function requireConfirm(toolName: string, confirm: boolean | undefined): void {
  if (confirm !== true) {
    throw new ConfirmRequiredError(toolName);
  }
}

export class UploadPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadPathError";
  }
}

/**
 * Confine a user-supplied upload path to the configured upload base directory.
 *
 * Returns the resolved real path of the file. Throws UploadPathError if
 * IMMICH_UPLOAD_BASE_DIR is unset, or if the requested file resolves (after
 * following symlinks) to anything outside that base directory. This blocks
 * arbitrary local-file exfiltration via path-based uploads.
 */
export async function resolveUploadPath(
  config: Config,
  filePath: string,
): Promise<string> {
  const baseDir = config.uploadBaseDir;
  if (!baseDir) {
    throw new UploadPathError(
      "Path-based upload is disabled. Set IMMICH_UPLOAD_BASE_DIR to an absolute directory to allow uploading local files, and place files inside it.",
    );
  }

  // Resolve the base dir's real path (it must exist and be a directory).
  let realBase: string;
  try {
    realBase = await fs.realpath(baseDir);
  } catch {
    throw new UploadPathError(
      `IMMICH_UPLOAD_BASE_DIR (${baseDir}) does not exist or is not accessible.`,
    );
  }
  const baseStat = await fs.stat(realBase);
  if (!baseStat.isDirectory()) {
    throw new UploadPathError(
      `IMMICH_UPLOAD_BASE_DIR (${baseDir}) is not a directory.`,
    );
  }

  // Resolve the requested file relative to the base dir, then realpath it so
  // symlinks pointing outside the base are caught.
  const requested = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(realBase, filePath);
  let realTarget: string;
  try {
    realTarget = await fs.realpath(requested);
  } catch {
    throw new UploadPathError(`File not found within upload base directory: ${filePath}`);
  }

  const rel = path.relative(realBase, realTarget);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new UploadPathError(
      `Refusing upload: ${filePath} resolves outside IMMICH_UPLOAD_BASE_DIR.`,
    );
  }
  return realTarget;
}

export function surfaceError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const status = (err as unknown as { status?: number; data?: { message?: string } }).status;
  const data = (err as unknown as { data?: { message?: string } }).data;
  const msg = data?.message ?? err.message;
  if (status === undefined) return err.message;
  if (status === 401) return "Immich auth failed - check IMMICH_API_KEY";
  if (status === 403) return `Immich forbidden (status 403) - API key lacks required permission: ${msg}`;
  if (status === 404) return `Immich not found (status 404): ${msg}`;
  if (status === 429) return `Immich rate-limited (status 429): ${msg}`;
  if (status >= 500 && status < 600) return `Immich server error ${status}: ${msg}`;
  return `Immich API ${status}: ${msg}`;
}

export function asMcpResponse(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export function asMcpError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
