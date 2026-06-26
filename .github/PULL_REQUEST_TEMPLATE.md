<!--
Thanks for sending a patch. Keep this short; delete sections that do not apply.
See CONTRIBUTING.md for what lands easily and what needs an issue first.
-->

## What and why

<!-- One or two sentences on the user-visible change and the problem it solves. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New tool or new input on an existing tool
- [ ] Docs
- [ ] Refactor with no tool-surface change
- [ ] Surface change (renamed tool, changed input schema, new env var) — opened an issue first per CONTRIBUTING.md

## Checklist

- [ ] `npm test` passes locally
- [ ] `npm run typecheck` passes locally
- [ ] Added or updated tests covering the change
- [ ] New or changed tools register only behind `IMMICH_ALLOW_WRITES` when they write, and require `confirm: true` when they are destructive
- [ ] Updated the `Unreleased` section of `CHANGELOG.md` for any user-visible effect (entries describe effects, not commit subjects)
- [ ] Updated the tool list in `README.md` if a tool was added, removed, or renamed
- [ ] No personal details, hostnames, real IPs, account names, tokens, or unredacted absolute paths in code, tests, or this PR (use `192.0.2.x` / `photos.example.com` for examples)
- [ ] Conventional commit messages, no AI co-authorship trailers
