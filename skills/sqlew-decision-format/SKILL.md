---
name: sqlew-decision-format
description: |
  REQUIRED format for decisions and constraints in plan mode.
  Plans MUST use 📌 Decision / 🚫 Constraint markers for auto-extraction on ExitPlanMode.
  Invoke this skill when writing plans to get the exact template.
---

## Plan Mode: Decision & Constraint Recording

When including decisions or constraints in your plan, use the following format.
They will be auto-detected on ExitPlanMode (Claude Code), `exit_plan_mode` approval (Grok Build),
or Codex Plan mode session stop, and registered via the hook queue in sqlew.

**Grok Build**: Write these blocks directly in `plan.md`. Hook stdout injection is not available;
this skill is the primary enforcement channel.

**Codex**: Write these blocks in the plan output during collaboration Plan mode.
Extraction runs from the session transcript on `Stop`.

---

## What to Record (and What NOT to Record)

sqlew stores facts that cannot be re-derived from the code. Before writing a
📌 Decision or 🚫 Constraint block, apply this filter:

**Record:**

- Choices where alternatives were considered and rejected — and WHY they lost
- Constraints imposed from outside the code: business rules, compliance,
  customer commitments, team agreements
- Non-obvious tradeoffs: workarounds for upstream bugs, deliberate deviations
  from the idiomatic approach (performance, past incidents)
- Anything a future agent might "helpfully" undo because the reason is
  invisible in the code

**Do NOT record:**

- Facts derivable from the code itself (dependencies, file structure,
  framework or library in use)
- Implementation details that can change freely without consequence
- Temporary or experimental choices that are not yet settled
- Restatements of what the code already says

Rule of thumb: if a future AI agent reading only the code would reach the same
conclusion, skip it. If it would guess the reason wrong — record it with the WHY.

---

### 📌 Decision: [hierarchical/key]

Record decisions using this format:

```markdown
### 📌 Decision: [key/path]
- **Value**: Description of the decision
- **Layer**: presentation | business | data | infrastructure | cross-cutting
- **Tags**: tag1, tag2 (optional)
- **Rationale**: Why this decision was made (strongly recommended — the WHY is the part future agents cannot infer from code)
- **Alternatives**: Option A, Option B (comma-separated; record what was rejected)
- **Tradeoffs**: Pros and cons description (optional)
```

When **Rationale** is provided, a Decision Context record is automatically created
alongside the decision, capturing the reasoning and alternatives considered.
A decision without Rationale loses most of its value — include it whenever
alternatives existed or the reason is not obvious from the code.

**Examples:**

### 📌 Decision: database/orm
- **Value**: Adopt Prisma
- **Layer**: data
- **Tags**: prisma, orm
- **Rationale**: Type-safe ORM needed for TypeScript backend with complex relations
- **Alternatives**: TypeORM, Drizzle, Knex
- **Tradeoffs**: Best TS integration but slower cold starts vs lighter alternatives

### 📌 Decision: auth/session-storage
- **Value**: Server-side sessions in Redis (not JWT)
- **Layer**: infrastructure
- **Tags**: auth, redis, security
- **Rationale**: Security team requires instant session revocation; JWT cannot be invalidated server-side
- **Alternatives**: JWT, database-backed sessions

---

### 🚫 Constraint: [category]

Record constraints using this format:

```markdown
### 🚫 Constraint: [category]
- **Rule**: Description of the constraint
- **Priority**: critical | high | medium | low
- **Tags**: tag1, tag2 (optional)
```

**Category options:** `architecture` | `security` | `code-style` | `performance`

**Examples:**

### 🚫 Constraint: code-style
- **Rule**: No inline styles, use CSS Modules
- **Priority**: medium
- **Tags**: css, styling

### 🚫 Constraint: security
- **Rule**: No hardcoded API keys, use environment variables
- **Priority**: critical
- **Tags**: security, env

---

## Automatic Processing Flow

1. **During Planning**: Write Decision/Constraint in the format above
2. **On ExitPlanMode**: Auto-detected → registered as draft/inactive
3. **Decision Context**: If Rationale is provided, context (rationale, alternatives, tradeoffs) is auto-registered
4. **On Implementation File Edit**: Auto-promoted to active
5. **Check command**: `mcp__sqlew__decision({ action: "list", status: "draft" })`
