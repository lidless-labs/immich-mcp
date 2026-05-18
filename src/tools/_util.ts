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
