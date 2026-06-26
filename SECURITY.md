# Security Policy

## Supported versions

immich-mcp is pre-1.0. Only the latest minor release on the `master` branch receives security fixes. Pin to a released version if you need a known-good build.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems. Email **me@solomonneas.dev** with: <!-- content-guard: allow pii/email -->

- A short description of the issue.
- Steps to reproduce (or a minimal proof of concept).
- The version or commit you tested against.
- Whether you would like to be credited in the release notes.

You should get an acknowledgment within 72 hours. If you do not, please follow up, the mail may have been filtered.

## In scope

- Path traversal or symlink-attack flaws in `immich_upload_asset_from_path` that escape `IMMICH_UPLOAD_BASE_DIR`.
- Write or delete tools that act without `IMMICH_ALLOW_WRITES=true`, or destructive tools that act without a per-call `confirm: true`.
- Server-side request forgery or URL-scheme injection through `IMMICH_BASE_URL`, `webBaseUrl`, or other URL inputs (for example, accepting `javascript:` or `file:`).
- Leaking the Immich API key or other secrets into tool output, logs, error messages, or exported files.
- CSV / formula injection in any `exportTo` manifest writer.
- TLS verification being weakened process-wide rather than scoped to the Immich client when `IMMICH_VERIFY_SSL=false`.

## Out of scope

- Bugs in Immich itself, the `@immich/sdk`, or the MCP SDK. Report those to their respective projects.
- Bugs in Claude Desktop, Claude Code, OpenClaw, or Codex CLI. Report those to their projects.
- Issues that require an attacker to already have the Immich API key, write access to the host, or the ability to edit the MCP client config.
- An agent doing something destructive that you explicitly enabled (writes on, confirm passed). That is the operator's call, not a vulnerability.

## A note on trust boundaries

This server runs with your Immich API key and, when `IMMICH_ALLOW_WRITES=true`, can modify and delete photos. Treat the MCP client driving it as you would any process holding that key. Keep writes disabled unless an agent needs them, and review what the agent intends to do before approving a destructive call.

## Disclosure

We aim to ship a fix within 14 days of confirming a valid report. A coordinated disclosure timeline can be negotiated for issues that need longer.
