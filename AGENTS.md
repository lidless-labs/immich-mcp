# Repository Guidance

## Project Shape
- TypeScript MCP server for Immich. ~60 stdio tool calls across system, assets, search, albums, people, tags, shared links, activities, memories, duplicates, stacks, trash, jobs, and composed "flow" tools.
- Entry point `src/index.ts` registers every `registerXTools()` module from `src/tools/` (one domain per file). Config and env parsing in `src/config.ts`, Immich SDK client in `src/client.ts`, shared gates and helpers in `src/tools/_util.ts`.
- Built with tsup to `dist/index.js` (the `immich-mcp` bin). Unit tests in `tests/` run against the fake SDK in `tests/_fake-sdk.ts`, never a live server.
- Default branch is `master`, not `main`. CI triggers on `master`.

## Definition of Done
Before reporting any substantive change complete, run ALL of these and confirm each passes:
- `npm test` (full suite, not just the targeted file)
- `npm run typecheck`
- `npm run build`

These mirror CI exactly (`.github/workflows/ci.yml`: `npm ci`, typecheck, test, build on Node 20 and 22). Report the actual results you observed. If any command fails, report the failure output verbatim and do not claim success. While iterating, `npm test -- tests/<specific>.test.ts` is fine, but the full set above gates "done".

## Live Library: Hard Prohibitions
The production Immich instance holds irreplaceable family photos. Treat every live write as unrecoverable until proven otherwise.

- Tempted to verify a change against the real server: do not. Never run write or delete tools against the live library during development, tests, or review. Verify with the fake SDK in `tests/_fake-sdk.ts`; tests must stay fully mocked.
- `npm run test:integration` hits a LIVE Immich server (gated by `IMMICH_INTEGRATION=true` plus `IMMICH_BASE_URL`/`IMMICH_API_KEY`). Run it only when the user explicitly asks for a live check, and never as part of routine verification.
- Highest-impact tools, all of which bypass or empty trash and are NOT reversible:
  - `immich_delete_asset` with `permanent: true`
  - `immich_empty_trash`
  - `immich_resolve_duplicates` with `delete: true` (deletes with `force: true`)
  - `immich_resolve_with_keep_strategy` with `permanent: true`
  Never invoke these against the live library, and never loosen their gates or defaults.

## Safety Invariants (preserve when editing code)
- Adding or editing any write tool: it must call `requireWrites(config)` before any network request. Destructive tools must additionally call `requireConfirm(name, confirm)`. Both gates live in `src/tools/_util.ts`. Never remove, reorder after the SDK call, or conditionally skip them.
- Touching `immich_delete_asset`: soft delete (trash, recoverable) is the default; `permanent: true` is the confirm-gated path. Keep that asymmetry.
- Touching upload code: `immich_upload_asset_from_path` must resolve paths through `resolveUploadPath()`, which confines uploads to `IMMICH_UPLOAD_BASE_DIR` (realpath, symlinks followed) and refuses when unset. Never bypass or widen it.
- Tempted to relax TLS for debugging: `IMMICH_VERIFY_SSL=false` already does this for the Immich client only, via a dedicated undici dispatcher in `src/client.ts`. Never use `NODE_TLS_REJECT_UNAUTHORIZED` or anything process-wide.
- Touching transport setup in `src/index.ts`: keep the interceptor that strips the draft-07 `$schema` key from `tools/list` output. Some MCP clients reject schemas carrying that key.
- Adding error handling: route it through `surfaceError()` in `src/tools/_util.ts`, the single place API errors are translated for users.

## Tests and Blockers
- A test fails: fix the code or, if the test itself is provably wrong, fix the test with justification. Never skip, delete, loosen assertions, or mark it `.todo` to get green.
- Blocked (missing dependency, failing gate, unclear requirement): stop and report the exact blocker and error text. Do not work around it silently.

## Pushing
- Pushes run a content-guard pre-push hook (`hooks/pre-push`, installed by CI setup) that scans tracked files against `~/repos/content-guard/policies/public-repo.json`. The hook fails: fix the violation or add an inline allow. Never push with `--no-verify`.

## Docs and Specs
- Design specs in `docs/superpowers/specs/` are context only. When they drift from code and tests, code and tests win.
- Adding or removing a tool: update the README tool counts in the same change.

## Memory Handoff
At the end of any substantial task, write a handoff note to `.claude/memory-handoffs/` using that directory's `TEMPLATE.md`. Record durable discoveries, gotchas, and decisions made. Do not wait to be reminded.
