import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./config.js";
import { initImmichClient } from "./client.js";
import { registerSystemTools } from "./tools/system.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerSearchTools } from "./tools/search.js";
import { registerAlbumTools } from "./tools/albums.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerTagTools } from "./tools/tags.js";
import { registerSharedLinkTools } from "./tools/shared-links.js";
import { registerActivityTools } from "./tools/activities.js";
import { registerMemoryTools } from "./tools/memories.js";
import { registerDuplicateTools } from "./tools/duplicates.js";
import { registerStackTools } from "./tools/stacks.js";
import { registerDuplicateFlowTools } from "./tools/duplicate-flows.js";
import { registerMemoryFlowTools } from "./tools/memory-flows.js";
import { registerAlbumFlowTools } from "./tools/album-flows.js";
import { registerTrashTools } from "./tools/trash.js";
import { registerJobTools } from "./tools/jobs.js";

/**
 * Build the stdio MCP server and connect it. Extracted from the former
 * module-top-level `main()` so a guarded bin (mcp-bin.ts) and the `cli.ts mcp`
 * subcommand share one code path. Behavior is identical to the prior setup:
 * same config load, same client init, same tool registration, same transport.
 */
export async function serve(): Promise<void> {
  const config = getConfig();
  initImmichClient(config);

  const server = new McpServer({
    name: "immich-mcp",
    version: "0.1.0",
    description:
      "MCP server for Immich. Browse and search photos, manage albums, recognize people, surface memories, resolve duplicates, manage stacks, share links, and comment on activity, all as typed tool calls.",
  });

  registerSystemTools(server, config);
  registerAssetTools(server, config);
  registerSearchTools(server, config);
  registerAlbumTools(server, config);
  registerPeopleTools(server, config);
  registerTagTools(server, config);
  registerSharedLinkTools(server, config);
  registerActivityTools(server, config);
  registerMemoryTools(server, config);
  registerDuplicateTools(server, config);
  registerStackTools(server, config);
  registerDuplicateFlowTools(server, config);
  registerMemoryFlowTools(server, config);
  registerAlbumFlowTools(server, config);
  registerTrashTools(server, config);
  registerJobTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing so the
// back-compat direct-run of index.js still starts the server.
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
  serve().catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`immich-mcp fatal: ${msg}`);
    process.exit(1);
  });
}
