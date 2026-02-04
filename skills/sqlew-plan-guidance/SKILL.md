---
name: sqlew-plan-guidance
description: |
  Quick reference for sqlew integration.
  Provides usage patterns for Plan mode with Claude Code Hooks automation.
---

## Automatic Integration (v4.1.0+)

With `sqlew init --hooks`, everything is **automatic**:

| Event | Hook | Action |
|-------|------|--------|
| Task tool called | PreToolUse | Auto-suggest related decisions |
| Plan file written | PreToolUse | Auto-track with plan ID |
| Code edited | PostToolUse | Auto-save decision (status: draft) |
| All todos completed | PostToolUse | Auto-update status to active |
| Git merge/rebase | Git hooks | Auto-mark as implemented |

## Manual Commands (Slash Command)

```bash
/sqlew                           # Show status
/sqlew search for <topic>        # Find related decisions
/sqlew record <decision>         # Record decision
/sqlew show remaining tasks      # List active tasks
```

## Direct MCP Tool Usage (Advanced)

### Research

```typescript
mcp__sqlew__suggest action="by_tags" tags=["tag"]
```

### Decision Recording

```typescript
mcp__sqlew__decision action="set"
  key="decision-key"
  value="chosen approach"
```

### Decision Context (Why + Alternatives)

```typescript
mcp__sqlew__decision action="add_decision_context"
  key="decision-key"
  rationale="Why this decision was made"
  alternatives_considered=["Option A", "Option B"]
  tradeoffs="Pros and cons description"
```

> **Tip**: In plan mode, use `- **Rationale**:` field in 📌 Decision blocks for auto-extraction.

### Task Creation

```typescript
mcp__sqlew__task action="create_batch" tasks=[
  { title: "Task title", layer: "business", priority: 3 }
]
```

## Decision Workflow (Hooks)

```
Code Edit      All Todos Done    Git Merge
    │               │                │
    ▼               ▼                ▼
 [draft] ──────→ [active] ──────→ [active]
         (workflow:in_progress)  (workflow:in_review)  (workflow:implemented)
```
