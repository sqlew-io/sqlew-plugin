# Muse Code integration — handoff from sqlew (mcp-sqlew) Phase 1

Status: Phase 1 (MCP connectivity) is complete and verified in the
[mcp-sqlew](https://github.com/sqlew-io/sqlew) repository. This document hands
over the research results and the remaining work to add a **Muse Code**
bundle (hooks + skills) to this plugin repository.

## What already works (Phase 1, verified 2026-11-12, Muse Code 1.4.15)

Muse Code can use the sqlew MCP server with no sqlew code changes —
manual MCP tool calls only ("Other harness" level; see
`docs/HARNESS_COMPATIBILITY.md` in mcp-sqlew).

- Registration (macOS/Linux style): `muse mcp add sqlew --user -- sqlew`
- **Windows**: the npm `sqlew.cmd` shim cannot be spawned by Muse (tools
  silently never appear). Use `muse mcp add sqlew --user -- cmd /c sqlew`
  (verified). `node <abs path>/dist/index.js` also works.
- If the workspace `.mcp.json` already defines a server named `sqlew`, it
  shadows the user registration. Register under a different name in that case.
- Project auto-detection works from the workspace root (no
  `SQLEW_PROJECT_ROOT` needed).
- Smoke-tested end-to-end via `muse exec --disable-approval`:
  `decision set → get` (values match, same project_id as other clients),
  `suggest by_context`, `queue list`, `help query_tool`, `constraint help`,
  `example list_all`, `use_case list_all` — all OK.
- sqlew tools carry no MCP read-only annotations; calls may prompt for
  approval depending on the user's permission profile. Do **not** add
  `readOnlyHint: true` to write-capable multiplexed tools
  (decision/constraint/queue/project) — that would bypass approval prompts.

Phase 1 artifacts (mcp-sqlew working copy, gitignored): exec logs
`.sqlew/tmp/muse-exec-*.jsonl`, hook research notes
`.sqlew/tmp/muse-hook-samples/NOTES.md`, wire schema dumps
`.sqlew/tmp/muse-schema*`.

## Muse hooks — verified specification

Full details: `mcp-sqlew/.sqlew/tmp/muse-hook-samples/NOTES.md`.
Primary sources: [Extending and automating](https://dev.meta.ai/docs/muse-code/extending#hooks),
`muse schema generate-json-schema` output from Muse Code 1.4.15.

- Config sources: project `<repo>/.muse/hooks.json`; user `hooks` block in
  `~/.config/muse/settings.json`; managed file via `managed_hooks_path`.
- Shape: matcher groups, very close to this repo's existing
  `hooks/hooks.json`:

  ```json
  { "hooks": {
      "SessionStart": [
        { "matcher": "startup",
          "hooks": [ { "type": "command", "command": "./x.sh", "timeout": 30 } ] }
      ] } }
  ```

- Event names in config files are **PascalCase** (camelCase is rejected with
  `UnsupportedEvent`). 17 events: SessionStart, UserPromptSubmit, PreToolUse,
  PermissionRequest, PostToolUse, PostToolUseFailure, PostToolBatch,
  PreLLMCall, PostLLMCall, PreCompact, PostCompact, SubagentStart,
  SubagentStop, Notification, Stop, StopFailure, SessionEnd.
  All event names already used by `hooks/hooks.json` in this repo are in
  this set.
- Handler fields: `type` (`"command"` only), `command` (args inlined — no
  separate `args`), `timeout` (integer **seconds**), `statusMessage`,
  `async`, `commandWindows`. Unknown handler fields are skipped with a
  precise warning (`UnsupportedHandler: D66: unknown handler field ...`).
  Matcher-group keys: `matcher`, `hooks` only. Matchers are Rust regex
  (no lookarounds/backreferences).
- Hooks run **outside** the sandbox and approval layer, with a cleared
  environment (small allowlist) — use absolute interpreter paths.
- Project hooks run only after workspace trust; user/managed hooks do not.
- **Headless caveat**: `muse exec` discovers and validates hooks (startup
  warnings did appear for invalid configs) but handlers never fired in
  testing. Payload capture requires an interactive session.
- MSP plugin hooks (`hook/declare` / `hook/request`, experimental) exist but
  are limited to 5 events (sessionStart, userPromptSubmit, preToolUse,
  postToolUse, stop) with a 2s default deadline — shell hooks are the
  primary integration path.

## Remaining work (Phase 2, this repository)

1. **Capture real hook payloads (interactive).** Add a temporary user
   `hooks` block in `~/.config/muse/settings.json` pointing at
   `mcp-sqlew/.sqlew/tmp/muse-hook-capture.cjs` (ready-made; writes stdin
   verbatim per event) for SessionStart, UserPromptSubmit, PreToolUse,
   PostToolUse, Stop. Run one interactive session in a real repo, perform a
   read and an edit, then inspect the samples. Remove the block afterwards.
2. **Normalize stdin into the sqlew hook CLI.** Compare captured payloads
   against `mcp-sqlew/src/cli/hooks/stdin-parser.ts`
   (`HookClient`, `normalizeHookInput`). If field names differ, that is the
   one expected mcp-sqlew-side change (add a `'muse'` client). Confirm which
   key carries context injection output (additionalContext equivalent) and
   whether PostToolUse stdout reaches the model (Grok-style passive vs
   Claude-style active injection).
3. **Adapt `hooks/hooks.json` matchers.** Muse built-in tool names differ
   from Claude Code's (e.g. `muse.read_file`, `muse.write_file`,
   `muse.powershell`, `muse.web_search`; MCP tools appear as
   `mcp__<server>__<tool>`). Map the existing matcher groups (research →
   suggest inject, Write/Edit → enqueue, Stop → flush) onto Muse's names.
4. **Decide bundle layout and install story.** Muse loads project hooks
   from `.muse/hooks.json` and skills from `<repo>/.agents/skills`,
   `.codex/skills`, `.claude/skills` (project) and
   `$XDG_CONFIG_HOME/muse/skills` / `~/.agents/skills` (user); SKILL.md
   needs YAML frontmatter. Muse also has a plugin system
   (`muse plugins`) — check whether hooks/skills can ship as a Muse plugin
   bundle (parallel to `.claude-plugin/`, `.codex-plugin/`,
   `.hermes-plugin/`, `.omp-plugin/` here) or whether installation is
   copy-based.
5. **Skills.** Port `sqlew-plan-guidance` / `sqlew-decision-format` /
   `sqlew-pr-adr` to Muse's skill format. Muse ships a built-in `/plan`
   skill; Plan-to-ADR hinges on where Muse persists plans and which event
   signals approval (unknown until step 1–2 are done).
6. **Windows command form.** Hook `command` strings and MCP registration
   must survive the `.cmd` shim problem: prefer `cmd /c` or absolute
   `node.exe` paths (there is a `commandWindows` handler field for
   Windows-specific overrides).
7. **Docs.** Add a "Muse Code" install section to this repo's README, and
   update mcp-sqlew `docs/HARNESS_COMPATIBILITY.md` (currently marks Muse
   Code as MCP-only ✎/—) once automation lands.

## Acceptance criteria (suggested)

- Fresh `Muse` session in a sqlew-tracked repo shows session-context
  injection (or an explicit MCP-only fallback), and a research + edit turn
  enqueues a draft that `Stop` flushes into the DB, matching the Claude
  Code bundle's behavior where the platform allows it.
- Degraded paths (no stdout injection, plan-approval signal missing) are
  documented per cell in the compatibility matrix, like the Grok/Hermes
  columns today.

## Phase 2 outcome (2026-11-12, this repository)

All steps above are implemented and verified end-to-end on this machine
(Muse Code 1.4.15). The mcp-sqlew side changes are **not committed** yet
(by request); they must land there before the bundle works for anyone
installing sqlew from npm.

1. **Payloads captured** from an interactive TUI session (pty + prompt
   argument). Full notes appended to
   `mcp-sqlew/.sqlew/tmp/muse-hook-samples/NOTES.md`. Muse sends
   Claude-shaped snake_case payloads (`model_provider` is the Muse-only
   marker; tool names are `read_file` / `write_file` / `edit_file` /
   `search` / `powershell` … with `tool_input.path`, `find`/`replace`).
   Verified injection matrix: SessionStart/UserPromptSubmit = plain-text
   stdout only; PreToolUse = no injection, exit 2 + stderr blocks (and a
   plain `{"continue":true}` is *rejected* there); PostToolUse =
   Claude `hookSpecificOutput.additionalContext` JSON. Beware: stdout
   beginning with `[` is misparsed as JSON by Muse (sqlew's `[sqlew] …`
   prefix needed rewriting to `sqlew: …` on plain-text paths).
2. **mcp-sqlew**: `'muse'` added to `HookClient` in `stdin-parser.ts`
   (detection via `model_provider` / `MUSE_SESSION_ID`, ordered before
   Hermes whose tool names collide), `MUSE_TOOL_MAP`, `path`/`find`/
   `replace` normalization, plain-text SessionStart output, silent
   PreToolUse `sendContinue`, `on-session-start` enabled for muse.
   Tests: `src/tests/unit/hooks/muse-hook-normalization.test.ts`
   (65 hook tests pass). Built to `dist/` locally.
3. **Matchers**: native Muse plugin hooks do not support matchers at all
   (validator: "`matcher` is a Claude/Codex hook field"). The bundle
   registers each hook per event and relies on sqlew's internal tool
   gating after normalization.
4. **Bundle**: native `.muse-plugin/plugin.json` in this repo (Muse
   selects it over `.claude-plugin/`). `muse plugins install <repo>
   --scope user` + `muse plugins approve sqlew` activates hooks and MCP.
5. **Skills**: existing `skills/*/SKILL.md` validate and load unchanged.
   Muse `/plan` persistence remains unwired (no plan-file convention
   found); plan-less flow is the supported path.
6. **Windows**: plugin hook argv is spawned directly, so `["sqlew", …]`
   never runs (npm `.cmd` shim). The bundle ships `hooks/sqlew-hook.cjs`
   (+ per-hook `hooks/muse-*.cjs` entries; Muse forbids sharing one
   hook source file across capabilities) and invokes hooks and MCP as
   `["node", "hooks/muse-<hook>.cjs"]`; the launcher resolves sqlew
   through a shell on Windows only. `node` must be on `PATH`.
7. **Docs**: README gained a "Muse Code" section here.
   `mcp-sqlew/docs/HARNESS_COMPATIBILITY.md` still needs updating,
   together with the uncommitted mcp-sqlew changes.

Verified acceptance flow: fresh Muse session shows session-context
constraints injected; a write enqueues `muse/auto/<file>` to
`.sqlew/queue/pending.json`; `Stop` flushes it into the shared DB; the
plugin MCP server answers as `mcp__plugin_sqlew_sqlew__*`.

Note: this work intentionally touched mcp-sqlew (`stdin-parser.ts`,
`on-session-start.ts`, `on-prompt.ts`, new tests) following this
handoff's step 2, even though the sqlew project constraint
"プラグイン実装は `sqlew-plugin` リポジトリ内で完結させること" exists.
Reconcile that constraint when committing.
