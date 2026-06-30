# Contributing to immich-mcp

immich-mcp is an MCP server that exposes a self-hosted Immich photo and video library as typed LLM tool calls. Patches are welcome. Before you start, please skim this file so we both spend our time on the right things.

## What kinds of changes land easily

- **Bug fixes** in any tool: wrong result, bad pagination, a crash, an unhandled Immich API shape.
- **New tools** that map onto a real Immich API capability the server does not cover yet.
- **New inputs / filters** on existing tools, as long as they stay schema-validated.
- **Sharper tool descriptions** that help an LLM pick the right tool.
- **Test coverage** for any of the above.

## What needs a conversation first

- **Renaming or removing a tool**, or changing an input schema in a breaking way. These are the public surface that MCP clients depend on. Open an issue first.
- **A new environment variable** or a change to the writes / confirm safety model.
- **Anything that adds a runtime dependency.** The dependency set is deliberately small.

## The safety model is not optional

This server can delete photos. New and changed tools must respect the existing two-tier guard:

- A tool that writes or deletes must register **only** when `IMMICH_ALLOW_WRITES=true`.
- A destructive tool (bulk update, permanent delete, merge, empty trash, and similar) must additionally require a per-call `confirm: true` and refuse to act without it.
- Dedupe and resolution tools should default to a dry run.
- Any URL input must be validated to `http(s)` only. Any path input that reads the local filesystem must be confined to a configured base directory.

A PR that adds a destructive capability without these guards will not land.

## Local dev

```bash
git clone https://github.com/lidless-labs/immichctl.git
cd immichctl
npm install
npm run build
npm test
npm run typecheck
```

To run the server against a real Immich instance for manual testing:

```bash
IMMICH_BASE_URL=https://photos.example.com/api \
IMMICH_API_KEY=your_key \
npm run dev
```

Integration tests (opt-in, hit a real Immich server) run with:

```bash
IMMICH_INTEGRATION=true npm run test:integration
```

## Adding a tool

1. Add the `server.tool(...)` registration in the appropriate file under `src/tools/`.
2. Give it a clear name (`immich_<verb>_<noun>`) and a description an LLM can route on.
3. Validate inputs with a zod schema.
4. If it writes, gate it behind `IMMICH_ALLOW_WRITES`; if it is destructive, require `confirm: true`.
5. Add tests under `tests/`.
6. Add the tool to the tool list in `README.md` and bump the per-domain count.
7. Add a `CHANGELOG.md` entry under `## [Unreleased]`.

## What does not land

- Personal details, hostnames, real IPs, account IDs, or live API keys in code, tests, or fixtures. Use `192.0.2.x` and `photos.example.com` for examples. CI scans for this.
- Destructive tools without the writes + confirm guards described above.
- AI-co-authorship trailers on commits (`Co-Authored-By: <model>`). Conventional commits only.

## License

By contributing you agree that your contribution is licensed under the MIT License, same as the rest of the repo.
