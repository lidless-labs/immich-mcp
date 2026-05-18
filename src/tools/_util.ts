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
  if (err instanceof Error) {
    const anyErr = err as unknown as { status?: number; data?: { message?: string } };
    if (anyErr.status !== undefined) {
      const msg = anyErr.data?.message ?? err.message;
      return `Immich API ${anyErr.status}: ${msg}`;
    }
    return err.message;
  }
  return String(err);
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
