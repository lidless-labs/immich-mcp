import { serve } from "./index.js";

serve().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`immich-mcp fatal: ${msg}`);
  process.exit(1);
});
