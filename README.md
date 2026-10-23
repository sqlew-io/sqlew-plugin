# sqlew-plugin

Plugin for [sqlew](https://github.com/sqlew-io/sqlew) — context sharing MCP server with Plan-to-ADR integration. Supports **Claude Code**, **Grok Build** (v5.2+), **Codex** (v5.2.1+), **Hermes** (v5.3.0+), **oh-my-pi (omp)** (v5.4.0+), and **Cursor** (experimental Cloud Post-only hooks, v5.4.4+).

## Features

- **Plan-less by default**: Plan mode is **not required** for suggest / ADR. Research tasks inject Related Context; Write enqueues drafts; Stop flushes (upsert). Plan-mode ADR still works as before.
- **Skills**: Guidance for suggest, queue, and (optional) Plan Mode 📌/🚫 formatting
- **Hooks**: Automatic context suggestion and decision enqueue/flush
- **Cursor Cloud hooks** (experimental, **Post-only**): research suggest after `Grep` / `WebSearch` / `WebFetch`; Write=enqueue + stop=flush for ADR drafts

## Plan-less harness workflow

```text
Research PostToolUse / tool_result  → Related Context (suggest inject)
Write / Edit                        → enqueue → .sqlew/queue/pending.json  (NO DB)
Stop / on-stop / flush-queue        → upsert pending items
```

| Client | Suggest inject | ADR draft | Upsert |
|--------|----------------|-----------|--------|
| **Cursor Cloud** | `postToolUse` Grep\|WebSearch\|WebFetch | Write / `afterFileEdit` → enqueue | `stop` → flush |
| **omp** | `tool_result` → `additionalContext` | write/edit → enqueue | `session_stop` → flush |
| **Claude Code / Grok / Codex** | Pre/Post hooks + skills | `sqlew save` enqueue when plan-less | `on-stop` / flush |
| **Hermes** | **Unavailable** via hooks | Use Skill `/learn` (see below) | Plan file `save` if you write plans |

Plan-mode ExitPlanMode / 📌/🚫 extraction is unchanged when you opt into plan mode.

## Installation

### Prerequisites

Install the sqlew MCP server globally:

```bash
npm i -g sqlew
```

### Claude Code

**Install:**

```bash
claude plugin marketplace add sqlew-io/sqlew-plugin
claude plugin install sqlew
```

Plan mode is **not required** for suggest / ADR. Research and Write hooks follow Write=enqueue / Stop=flush; ExitPlanMode extraction still works when you use plan mode.

**Uninstall:**

```bash
claude plugin remove sqlew
```

### Grok Build

**Install:**

```bash
grok plugin install sqlew-io/sqlew-plugin --trust
grok plugin update
```

Configures MCP (`.mcp.json`), skills, and hooks (plan tracking, decision extraction, plan-less save enqueue + stop flush). Plan mode is optional for ADR/suggest.

> Do not duplicate hooks in `~/.grok/hooks/` or add `[mcp_servers.sqlew]` to `~/.grok/config.toml`.

**Uninstall:**

```bash
grok plugin remove sqlew
```

### Codex

**Install:**

```bash
codex plugin marketplace add sqlew-io/sqlew-plugin
codex plugin install sqlew --source sqlew-plugin
```

After install, open `/hooks` in Codex and trust the bundled sqlew hooks. **Plan mode is not required** for suggest/ADR (Write=enqueue / Stop=flush). Enable Plan mode only when you want collaboration Plan + 📌/🚫 extraction:

```toml
[features]
collaboration_modes = true
```

> Do not copy skills into `~/.codex/skills/` or add `[mcp_servers.sqlew]` to `config.toml` when using the plugin.

**Uninstall:**

```bash
codex plugin remove sqlew
```

### Hermes (Claude Code / Nous)

Requires sqlew MCP server **>= 5.3.0**. Uses the `.hermes-plugin/` bundle — separate from the Claude/Codex/Grok plugin manifests.

**Install:**

```bash
hermes plugins install sqlew-io/sqlew-plugin/.hermes-plugin
hermes plugins enable sqlew
```

On enable, the bundle registers `mcp_servers.sqlew`, wires shell hooks (`pre_llm_call`, `pre_tool_call`, `post_tool_call`, …), and copies skills to `~/.hermes/skills/`.

Verify:

```bash
hermes hooks list
hermes hooks test pre_tool_call --for-tool terminal
```

> Hermes has no native plan permission mode. Plan guidance is injected every turn via `pre_llm_call`. Plans live in `.hermes/plans/*.md`. See [HERMES_HOOKS.md](https://github.com/sqlew-io/sqlew/blob/main/docs/HERMES_HOOKS.md).

**Hooks automatic trigger is unavailable on Hermes** (no Post research → suggest inject / Write → enqueue like Cursor or omp). Plan mode is optional. Prefer a Skill via `/learn`:

```text
/learn 「調査開始時にsqlewを使ってサジェストを取得し、実装前にADRをsqlewで記録することを義務付けて」
```

**Uninstall:**

```bash
hermes plugins remove sqlew
```

Removes the plugin from `~/.hermes/plugins/`. Merged `config.yaml` entries and copied skills are not removed automatically — edit `~/.hermes/config.yaml` and delete `~/.hermes/skills/sqlew-*` if you want a full cleanup.

### Cursor (experimental — Cloud Agents, Post-only)

**Plan mode is not required.** Plan-less **Post** hooks for **Cursor Cloud Agents** (project command hooks only). Locked product flow (aligned with [PR #3](https://github.com/sqlew-io/sqlew-plugin/pull/3)):

```text
Post(Grep|WebSearch|WebFetch) → suggest inject (Related Context)
Post(Write) / afterFileEdit   → enqueue draft to .sqlew/queue/pending.json (NO DB)
stop                          → sqlew flush-queue / on-stop (upsert)
                              → optional short additional_context nudge if no draft yet
```

| Path | Cloud | Role |
|------|-------|------|
| `postToolUse` Grep\|WebSearch\|WebFetch → `additional_context` | **YES** (validated) | Research suggest |
| `postToolUse` Write → enqueue + optional nudge | intended | ADR approach 1 + 2 (no per-Write MCP set) |
| `afterFileEdit` → enqueue side-effect | intended | Approach 1 only (no model inject) |
| `stop` → flush-queue / on-stop | intended | Upsert pending queue (Cloud without watcher) |
| `beforeSubmitPrompt` (BSP) | **NO** (verifier 2026-10-21) | **Not for Cloud** — IDE leftover only |
| `beforeMCPExecution` / `sessionStart` | N/A on managed Cloud | Do not depend on |

**Install into a repo Cloud Agents will clone** (project hooks only; `~/.cursor/hooks.json` is not loaded on Cloud):

```bash
# From a checkout of sqlew-plugin — copy hooks into your project root:
cp -R .cursor /path/to/your-project/
# Ensure sqlew CLI is on PATH in the Cloud environment (env setup / snapshot):
npm i -g sqlew
```

Or open this plugin repo itself — it ships `.cursor/hooks.json` at the root.

**Marker mode (Cloud E2E without DB):**

```bash
export SQLEW_HOOK_TEST_MARKER=1
# optional stable id:
export SQLEW_HOOK_MARKER_ID=cloud-e2e-1
```

After Grep/WebSearch/WebFetch → `SQLEW_HOOK_MARKER_<id>`. After Write → `SQLEW_HOOK_MARKER_WRITE_<id>`.

**Smoke (local, no Cursor UI):**

```bash
node .cursor/hooks/smoke-test.mjs
```

**Knobs:** `SQLEW_HOOK_MIN_SCORE` (35), `SQLEW_HOOK_MAX_ITEMS` (5), `SQLEW_HOOK_SUGGEST_TIMEOUT_MS` / `SQLEW_HOOK_SAVE_TIMEOUT_MS`, `SQLEW_HOOK_APPROACH2=0` (disable Write nudge), `SQLEW_HOOK_DRAFT_MCP=0` / `SQLEW_HOOK_SAVE=0`. Fail-open on CLI errors.

Optional Cursor plugin manifest: `.cursor-plugin/plugin.json` (skills + hooks + MCP). Cloud delivery still requires project `.cursor/hooks.json`.

### oh-my-pi (omp)

Requires sqlew MCP server **>= 5.3.6** with the `sqlew/hooks` export. Uses an in-process Extension (not shell hooks). For Post `tool_result` → model `additionalContext`, prefer sqlew that exports `buildPostToolUseContextOutput` ([sqlew#136](https://github.com/sqlew-io/sqlew/pull/136)+); older peers keep side-effects and best-effort stdout parse.

**Install (user-persistent, from GitHub):**

```bash
npm i -g sqlew
omp plugin install github:sqlew-io/sqlew-plugin
omp plugin list
```

Loads:
- Extension: `.omp-plugin/extensions/sqlew-omp.ts` (via root `package.json` `omp.extensions`)
- Skills: `skills/sqlew-*`
- MCP fragment: `.mcp.json` (if project does not already register sqlew)

**Uninstall:**

```bash
omp plugin uninstall sqlew-omp
```

**Local development:**

```bash
omp plugin install ./sqlew-plugin
# or one-shot:
omp --extension ./sqlew-plugin/.omp-plugin
```

**Local development:**

```bash
hermes plugins install ./.hermes-plugin
```

## Why Use the Plugin?

- **Automatic Setup**: Skills, Hooks, and MCP config are installed per client
- **Clean Uninstall**: Each client has its own remove command (see sections above)
- **No Project Clutter**: No files left in your project directories

### Local Development

```bash
git clone https://github.com/sqlew-io/sqlew-plugin.git
cd sqlew-plugin

# Claude Code
claude plugin marketplace add .
claude plugin install sqlew

# Grok Build
grok plugin install . --trust

# Codex
codex plugin marketplace add .
codex plugin install sqlew

# Hermes
hermes plugins install ./.hermes-plugin
hermes plugins enable sqlew
```

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `sqlew-decision-format` | 📌/🚫 format when using (optional) Plan Mode; plan-less ADR needs no plan markers |
| `sqlew-plan-guidance` | Plan-less suggest/enqueue/flush + optional Plan-to-ADR; Hermes `/learn` note |
| `sqlew-pr-adr` | Enriches PR bodies with ADR context via diff-based decision reverse lookup |

### Hooks

Shared Claude / Grok / Codex hooks live in `hooks/hooks.json`. Cursor Cloud uses `.cursor/hooks.json` (Post-only). Plan mode is optional for ADR/suggest.

| Event | Action | Description |
|-------|--------|-------------|
| PreToolUse (Task) | `sqlew suggest` | Suggests related decisions before task execution |
| PreToolUse (Write\|write\|search_replace\|EnterPlanMode\|ExitPlanMode\|apply_patch) | `sqlew track-plan` | Tracks plans; Grok injects template; Grok exit_plan_mode gate if no filled 📌/🚫 |
| PostToolUse (Edit\|Write\|write\|search_replace\|apply_patch) | `sqlew track-plan` | Grok: re-injects plan.md template if overwritten |
| PreToolUse (Bash\|shell_command\|shell) | `sqlew pr-adr` | Blocks `gh pr create` without ADR markers |
| PostToolUse (ExitPlanMode\|exit_plan_mode) | `sqlew on-exit-plan` | Extracts decisions from plan on exit (**plan mode; still works**) |
| PostToolUse (Edit\|Write\|apply_patch) | `sqlew save` | Plan-less: **enqueue** draft to `.sqlew/queue/pending.json`; with plan: promote/extract |
| PostToolUse (TodoWrite) | `sqlew check-completion` | Checks task completion status |
| UserPromptSubmit / `pre_llm_call` | `sqlew on-prompt` | Injects plan guidance (Claude, Codex, Hermes) — optional |
| SessionStart | `sqlew on-session-start` | Session startup hooks |
| SubagentStop | `sqlew on-subagent-stop` | Processes subagent results |
| Stop | `sqlew on-stop` / `sqlew on-exit-plan` | **Flush** pending queue (upsert); Codex plan extraction on stop |
| Cursor `postToolUse` (Grep\|WebSearch\|WebFetch) | `.cursor/hooks/post-research-suggest.mjs` | Post-only Related Context via `additional_context` (Cloud) |
| Cursor `postToolUse` (Write) / `afterFileEdit` | `.cursor/hooks/post-write-draft.mjs` | Enqueue draft to pending.json (no MCP set) + optional nudge |
| Cursor `stop` | `.cursor/hooks/stop-flush.mjs` | `flush-queue` / `on-stop` upsert for Cloud |
| Cursor `beforeSubmitPrompt` (optional) | `.cursor/hooks/before-submit-fallback.mjs` | **Not for Cloud** (IDE leftover; does not deliver) |

## Version

Current version: **5.4.4** (Write=enqueue / Stop=flush; Cursor Cloud Post-only research + omp `tool_result` camel `additionalContext` — peer [sqlew#136](https://github.com/sqlew-io/sqlew/pull/136)+ preferred; Hermes >= 5.3.0; Grok multi-trigger plan template needs matching CLI).

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Related

- [sqlew MCP Server](https://github.com/sqlew-io/sqlew) - The MCP server that provides decision/constraint management
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) - Official plugin documentation

## License

Apache-2.0
