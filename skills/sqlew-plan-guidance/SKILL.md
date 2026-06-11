---
name: sqlew-plan-guidance
description: |
  REQUIRED workflow for plan mode with sqlew integration.
  MUST search for related context before writing plans.
  Invoke for suggest search steps, Related Context template, and queue monitoring.
---

## REQUIRED: Suggest Search BEFORE Planning

**CRITICAL**: Before writing any plan, you MUST search for related context.

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

## Grok Build Notes (v5.2+)

**CRITICAL for Grok Build**: UserPromptSubmit hook stdout is **ignored** (passive hook).
Plan mode guidance is delivered via **this skill** and `sqlew-decision-format`, not hook injection.

When writing a plan in Grok Build (`/plan` or `enter_plan_mode`):
1. MUST search related context (suggest) BEFORE planning
2. Decision/Constraint template is **auto-appended to plan.md** on `enter_plan_mode` (file injection via hook)
3. Fill in the template placeholders before approving the plan
4. Patterns are auto-extracted on `exit_plan_mode` approval → queue → shared DB

**Note**: `/plan` (Shift+Tab) without `enter_plan_mode` tool may skip file injection until the agent calls `enter_plan_mode`. Use `/sqlew-decision-format` as fallback.

---

## Automatic Integration (with sqlew-plugin)

With the sqlew-plugin installed, everything is **automatic**:

| Event | Hook | Action |
|-------|------|--------|
| User prompt submitted | UserPromptSubmit | Auto-inject plan mode enforcement (Claude Code only; Grok uses skills) |
| Task tool called | PreToolUse | Auto-suggest related decisions |
| Plan file written | PreToolUse | Auto-track with plan ID |
| Code edited | PostToolUse | Auto-save decision (status: draft) |
| ExitPlanMode | PostToolUse | Auto-extract 📌/🚫 patterns |

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

## Queue Monitoring After Plan Mode

### When to Check

After ExitPlanMode or when Plan-to-ADR processing completes, check for unprocessed items.

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
