---
name: sqlew-plan-guidance
description: |
  Workflow for sqlew suggest + ADR with or without plan mode.
  Plan mode is NOT required for suggest/ADR. Research hooks inject Related Context;
  Write enqueues drafts; Stop flushes. Plan-mode ADR still works as before.
  Invoke for suggest steps, Related Context template, queue monitoring, and Hermes /learn.
---

## Plan-less workflow (default)

**Plan mode is no longer required** for suggest or ADR recording.

Research and implementation create ADRs automatically on harnesses that support Post hooks:

```text
Research (Grep / WebSearch / WebFetch / tool_result)
  → PostToolUse / tool_result injects Related Context (suggest)
Write / Edit (implementation)
  → enqueue draft to .sqlew/queue/pending.json  (NO DB yet)
Stop / on-stop / flush-queue / QueueWatcher
  → upsert pending items into the shared DB
```

| Phase | When | What |
|-------|------|------|
| Suggest inject | After research tools | Related Context from `sqlew suggest` |
| Enqueue | After Write / Edit (gated) | Draft create → `.sqlew/queue/pending.json` |
| Upsert | Stop / flush / QueueWatcher | DB register (Write=enqueue / Stop=flush) |

**Cursor Cloud** (Post-only): needs **plugin hooks** (`.cursor/hooks.json`) — MCP alone is not enough. `postToolUse` Grep|WebSearch|WebFetch → suggest; Write / `afterFileEdit` → enqueue; `stop` → flush. See Cursor Cloud Notes.  
**omp**: `tool_result` inject + write/edit enqueue; `session_stop` → flush.  
**Claude Code / Grok Build / Codex**: shared `sqlew save` (enqueue when plan-less) + `sqlew on-stop` / flush.  
**Hermes**: automatic Post inject is unavailable — use Skill via `/learn` (see Hermes Notes).

**Plan-mode ADR creation still works as before** (📌/🚫 extraction on ExitPlanMode / exit_plan_mode / plan file write / Codex Stop). Use the sections below when you choose plan mode.

---

## Cursor Cloud Notes

Plan-less suggest / ADR **auto-trigger** requires this plugin's Cursor hooks — `@sqlew/pg` MCP alone does not inject or enqueue.

1. **MCP:** per-repo `.cursor/mcp.json` → `npx -y @sqlew/pg`
2. **Secrets:** `SQLEW_DATABASE_URL` / `DATABASE_URL` from Cloud Environment Secrets (remote Postgres; not VM SQLite)
3. **Project name:** optional `SQLEW_PROJECT_NAME`; else git repo name; config last. Priority **env > git > config**
4. **Hooks:** project `.cursor/hooks.json` from this plugin (Post research inject; Write=enqueue; Stop=flush)

```text
Post(Grep|WebSearch|WebFetch) → Related Context
Post(Write) / afterFileEdit   → .sqlew/queue/pending.json  (NO DB)
stop                          → flush-queue / on-stop (upsert)
```

---

## REQUIRED: Suggest Search BEFORE Planning

**CRITICAL**: Before writing any plan, you MUST search for related context.
(In plan-less mode, research hooks often inject this for you — still run suggest if Related Context is missing.)

**Step 1**: Extract keywords from the user's task (e.g., migration, auth, database)

**Step 2**: Run suggest search:
```
suggest { action: "by_context", key: "<keyword>", tags: ["<relevant-tags>"] }
suggest { action: "by_context", target: "constraint", text: "<topic>" }
```

**Step 3**: Include results in plan (MANDATORY section):
```markdown
## Related Context (from sqlew)

### Past Decisions
| Key | Value | Score |
|-----|-------|-------|
| path/to/decision | description | 85 |

> If empty: "No related decisions found for: <keywords>"

### Applicable Constraints
- **[category]**: constraint text (Priority: high)

> If empty: "No constraints found for: <keywords>"
```

**FAILURE TO INCLUDE "Related Context" SECTION = INVALID PLAN**

---

## REQUIRED: Conflict Handling (Plan Overturns an Existing Decision)

If a decision found by the suggest search contradicts your new plan:

1. **Never silently ignore it.** List the conflicting decision in the
   "Related Context" section and state that the plan overturns it.
2. **Read its context first**:
   `decision { action: "get", key: "<key>", include_context: true }`
   — the old rationale may encode a constraint (upstream bug, compliance,
   past incident) your plan has not considered.
3. **Same key, new direction**: register the new decision under the same key
   (sqlew keeps history). Explain in **Rationale** why the previous decision
   no longer applies.
4. **Different key**: register the new decision, then deprecate the old one:
   `decision { action: "set", key: "<old-key>", value: "Superseded by <new-key>", status: "deprecated" }`

A stale decision that contradicts the code is worse than no decision — it
becomes misinformation. Deprecating on reversal keeps the database trustworthy.

---

## Grok Build Notes (v5.2+ / multi-trigger template v5.5+)

**CRITICAL for Grok Build**: UserPromptSubmit hook **stdout** is ignored (passive hook).
Format guidance is delivered via **this skill** and `sqlew-decision-format`.
The 📌/🚫 **template block** is written to `plan.md` as a file side-effect (not stdout).

When writing a plan in Grok Build (`/plan` or `enter_plan_mode`):
1. MUST search related context (suggest) BEFORE planning
2. Decision/Constraint template is **auto-maintained on plan.md** via multi-trigger hooks:
   - `enter_plan_mode` PreToolUse
   - `UserPromptSubmit` while plan mode is Active/Pending (`plan_mode.json`)
   - PostToolUse after `plan.md` edits (re-appends if a full rewrite wiped the section)
3. Fill in the template placeholders (or write real 📌/🚫 blocks) before approving the plan
4. Patterns are auto-extracted on `exit_plan_mode` approval → queue → shared DB
5. **Exit gate**: approving with only empty template placeholders is **denied**. Fill real values, or set `- **Value**: N/A` / `- **Rule**: N/A` if nothing to record. Disable with `hooks.grok_require_patterns = false` in config.toml

**Note**: If the template section is missing, re-save `plan.md` or send another prompt in plan mode so hooks re-seed it. Use `/sqlew-decision-format` if you need the field reference. If `exit_plan_mode` is denied, add filled 📌/🚫 blocks and try again.

---

## Hermes Notes (v5.3.0+)

Install via the sqlew-plugin Hermes bundle:

```bash
npm i -g sqlew   # >= 5.3.0
hermes plugins install sqlew-io/sqlew-plugin/.hermes-plugin
hermes plugins enable sqlew
```

**Hooks automatic trigger (Post research → suggest inject / Write → ADR enqueue) is unavailable on Hermes.** Do not expect Cursor/omp-style `additional_context` after tools.

**Recommended:** create a Skill with `/learn` so the agent always suggests and records ADRs:

```text
/learn 「調査開始時にsqlewを使ってサジェストを取得し、実装前にADRをsqlewで記録することを義務付けて」
```

Plan mode is optional. When you do use plans (the `plan` skill → `.hermes/plans/*.md`):

1. MUST search related context (suggest) BEFORE planning (or rely on your `/learn` Skill)
2. `pre_llm_call` hook injects plan guidance every turn (FULL once, then SHORT)
3. Fill in `### 📌 Decision:` / `### 🚫 Constraint:` blocks in the plan file
4. Patterns are extracted on `write_file|patch` to `.hermes/plans/` via `track-plan` / `save`

**Differences from Claude Code**: No `ExitPlanMode` event — extraction happens when the plan markdown is written, not on plan-mode exit. No `permission_mode: plan` — guidance is always injected via `pre_llm_call`. No automatic research Post inject — Skill/`/learn` covers suggest + ADR.

---

## Codex Notes (v5.2.1+)

Install via `codex plugin marketplace add sqlew-io/sqlew-plugin` and `codex plugin install sqlew`.
Trust bundled hooks with `/hooks` on first use.

When writing a plan in Codex (`/plan` or Shift+Tab, requires `[features] collaboration_modes = true`):
1. MUST search related context (suggest) BEFORE planning
2. `UserPromptSubmit` hook injects plan enforcement (unlike Grok)
3. Fill in `### 📌 Decision:` / `### 🚫 Constraint:` blocks in the plan output
4. Patterns are extracted on session `Stop` from the Codex rollout transcript

**Hook coverage caveat**: Codex may not fire hooks for every `apply_patch` call ([openai/codex#16732](https://github.com/openai/codex/issues/16732)). Shell-based workflows (`shell_command`) and `UserPromptSubmit` hooks are the reliable automation path today.

---

## Automatic Integration (with sqlew-plugin)

With the sqlew-plugin installed, plan-less and plan-mode paths both run:

| Event | Hook | Action |
|-------|------|--------|
| Research tools (Grep / WebSearch / WebFetch / omp `tool_result`) | PostToolUse / tool_result | Inject Related Context (suggest) — plan mode not required |
| Code written / edited | PostToolUse / afterFileEdit | **Enqueue** draft → `.sqlew/queue/pending.json` (Write=enqueue; no per-Write DB) |
| Session stop | Stop / on-stop / flush-queue / session_stop | **Flush** pending queue → upsert DB (Stop=flush) |
| User prompt submitted | UserPromptSubmit | Plan guidance (Claude Code / Codex; Grok uses skills) — optional plan mode |
| Task tool called | PreToolUse | Auto-suggest related decisions |
| Plan file written | PreToolUse | Auto-track with plan ID (plan mode) |
| ExitPlanMode / exit_plan_mode | PostToolUse | Auto-extract 📌/🚫 patterns (plan mode; still works) |

Hermes: no automatic research/Write inject — use `/learn` Skill (see Hermes Notes).

## Manual Commands (Slash Command)

```bash
/sqlew                           # Show status
/sqlew search for <topic>        # Find related decisions
/sqlew record <decision>         # Record decision
```

## Direct MCP Tool Usage (Advanced)

### Research

```
suggest { action: "by_context", key: "<keyword>", tags: ["<tags>"] }
suggest { action: "by_tags", tags: ["tag1", "tag2"] }
```

### Decision Recording

```
decision { action: "set", key: "decision-key", value: "chosen approach" }
```

### Decision Context (Why + Alternatives)

```
decision { action: "add_decision_context", key: "decision-key", rationale: "Why", alternatives_considered: ["A", "B"], tradeoffs: "Pros and cons" }
```

> **Tip**: In plan mode, use `- **Rationale**:` field in 📌 Decision blocks for auto-extraction.

---

## Queue Monitoring (plan-less flush + plan mode)

### When to Check

After Stop / flush (plan-less Write=enqueue), after ExitPlanMode, or when Plan-to-ADR processing completes, check for unprocessed items.

**Queue file locations:**
- Pending: `.sqlew/queue/pending.json`
- Failed: `.sqlew/queue/failed.json`

### How to Check

```
queue { action: "list" }
```

Response includes `count` (pending) and `failedCount` (failed items).

### Failed Queue

Items that fail processing (e.g., HighSimilarity errors) are moved to `failed.json`.

**Why items fail:**
- **HighSimilarity (60%+)**: Item is too similar to an existing decision
- **Validation errors**: Invalid layer, category, or other data issues

**Resolution:**
1. Check `failedItems` in `queue { action: "list" }` response
2. For duplicates: `queue { action: "clear", target: "failed" }`
3. For different intent: Re-register manually with a more specific key via `/sqlew record <decision>`

### Queue Tool Actions

| Action | Description | Example |
|--------|-------------|---------|
| `list` | Show pending and failed items | `queue { action: "list" }` |
| `remove` | Remove specific pending item | `queue { action: "remove", index: 0 }` |
| `clear` | Clear pending queue (default) | `queue { action: "clear" }` |
| `clear` | Clear failed queue | `queue { action: "clear", target: "failed" }` |
| `clear` | Clear both queues | `queue { action: "clear", target: "all" }` |

---

## Decision Workflow (Hooks)

```
Code Edit      All Todos Done    Git Merge
    │               │                │
    ▼               ▼                ▼
 [draft] ──────→ [active] ──────→ [active]
         (workflow:in_progress)  (workflow:in_review)  (workflow:implemented)
```
