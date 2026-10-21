# sqlew-plugin

Plugin for [sqlew](https://github.com/sqlew-io/sqlew) — context sharing MCP server with Plan-to-ADR integration. Supports **Claude Code**, **Grok Build** (v5.2+), **Codex** (v5.2.1+), **Hermes** (v5.3.0+), **oh-my-pi (omp)** (v5.4.0+), and **Cursor** (experimental Cloud research hooks, v5.4.2+).

## Features

- **Skills**: Auto-triggered guidance for Plan Mode decision/constraint formatting
- **Hooks**: Automatic context suggestion and decision saving
- **Cursor Cloud hooks** (experimental): after `Grep` / `WebSearch` / `WebFetch`, inject a compact Related Context block via `postToolUse` → `additional_context`

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

Configures MCP (`.mcp.json`), skills, and hooks (plan tracking, decision extraction).

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

After install, open `/hooks` in Codex and trust the bundled sqlew hooks. Enable Plan mode when needed:

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

**Uninstall:**

```bash
hermes plugins remove sqlew
```

Removes the plugin from `~/.hermes/plugins/`. Merged `config.yaml` entries and copied skills are not removed automatically — edit `~/.hermes/config.yaml` and delete `~/.hermes/skills/sqlew-*` if you want a full cleanup.

### Cursor (experimental — Cloud Agents)

Plan-less context injection for **Cursor Cloud Agents** via project hooks (command-only).

**Primary path (Cloud-validated):** `postToolUse` on `Grep` | `WebSearch` | `WebFetch` → `{ additional_context }` with a compact Related Context block from `sqlew suggest` / MCP `suggest by_context`.

**Not relied on for Cloud:** `beforeSubmitPrompt` → `additional_context` (staff-recommended for IDE Agents Window; **Cloud verifier 2026-10-21: does not deliver**). Optional gated fallback remains for IDE best-effort only.

Cloud also does **not** run `beforeMCPExecution` / `sessionStart` — do not depend on those.

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

After a matching Grep/WebSearch/WebFetch, the model should see `SQLEW_HOOK_MARKER_<id>` in injected context.

**Smoke (local, no Cursor UI):**

```bash
node .cursor/hooks/smoke-test.mjs
```

**Knobs:** `SQLEW_HOOK_MIN_SCORE` (default 35), `SQLEW_HOOK_MAX_ITEMS` (default 5), `SQLEW_HOOK_SUGGEST_TIMEOUT_MS` (default 10000). Fail-open on CLI errors (empty `additional_context`).

Optional Cursor plugin manifest: `.cursor-plugin/plugin.json` (skills + hooks + MCP). Cloud delivery still requires project `.cursor/hooks.json`.

### oh-my-pi (omp)

Requires sqlew MCP server **>= 5.3.6** with the `sqlew/hooks` export. Uses an in-process Extension (not shell hooks).

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
| `sqlew-decision-format` | Guides Plan Mode decision/constraint formatting with Markdown patterns |
| `sqlew-plan-guidance` | Quick reference for sqlew Plan-to-ADR integration |
| `sqlew-pr-adr` | Enriches PR bodies with ADR context via diff-based decision reverse lookup |

### Hooks

| Event | Action | Description |
|-------|--------|-------------|
| PreToolUse (Task) | `sqlew suggest` | Suggests related decisions before task execution |
| PreToolUse (Write\|write\|search_replace\|EnterPlanMode\|ExitPlanMode\|apply_patch) | `sqlew track-plan` | Tracks plans; Grok injects template; Grok exit_plan_mode gate if no filled 📌/🚫 |
| PostToolUse (Edit\|Write\|write\|search_replace\|apply_patch) | `sqlew track-plan` | Grok: re-injects plan.md template if overwritten |
| PreToolUse (Bash\|shell_command\|shell) | `sqlew pr-adr` | Blocks `gh pr create` without ADR markers |
| PostToolUse (ExitPlanMode\|exit_plan_mode) | `sqlew on-exit-plan` | Extracts decisions from plan on exit |
| PostToolUse (Edit\|Write\|apply_patch) | `sqlew save` | Auto-saves decisions from edited files |
| PostToolUse (TodoWrite) | `sqlew check-completion` | Checks task completion status |
| UserPromptSubmit / `pre_llm_call` | `sqlew on-prompt` | Injects plan guidance (Claude, Codex, Hermes) |
| SessionStart | `sqlew on-session-start` | Session startup hooks |
| SubagentStop | `sqlew on-subagent-stop` | Processes subagent results |
| Stop | `sqlew on-stop` / `sqlew on-exit-plan` | Cleanup; Codex plan extraction on stop |
| Cursor `postToolUse` (Grep\|WebSearch\|WebFetch) | `.cursor/hooks/post-research-suggest.mjs` | Plan-less Related Context via `additional_context` (Cloud primary) |
| Cursor `beforeSubmitPrompt` (optional) | `.cursor/hooks/before-submit-fallback.mjs` | Gated IDE fallback; **unreliable on Cloud** |

## Version

Current version: **5.4.2** (Cursor Cloud research hooks experimental; omp Extension pairs with sqlew >= 5.3.7; Hermes >= 5.3.0; Grok multi-trigger plan template needs matching CLI).

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Related

- [sqlew MCP Server](https://github.com/sqlew-io/sqlew) - The MCP server that provides decision/constraint management
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) - Official plugin documentation

## License

Apache-2.0
