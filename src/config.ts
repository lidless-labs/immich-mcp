export interface Config {
  baseUrl: string;
  apiKey: string;
  allowWrites: boolean;
  verifySsl: boolean;
  /**
   * Absolute directory that path-based uploads are confined to. When unset,
   * `immich_upload_asset_from_path` refuses to read any local file. Set via
   * IMMICH_UPLOAD_BASE_DIR.
   */
  uploadBaseDir?: string | undefined;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

export function getConfig(): Config {
  const baseUrl = process.env.IMMICH_BASE_URL;
  if (!baseUrl) {
    throw new Error("IMMICH_BASE_URL is required (e.g. https://photos.example.com/api)");
  }
  const apiKey = process.env.IMMICH_API_KEY;
  if (!apiKey) {
    throw new Error("IMMICH_API_KEY is required");
  }
  return {
    baseUrl,
    apiKey,
    allowWrites: bool(process.env.IMMICH_ALLOW_WRITES, false),
    verifySsl: bool(process.env.IMMICH_VERIFY_SSL, true),
    uploadBaseDir: process.env.IMMICH_UPLOAD_BASE_DIR || undefined,
  };
}
