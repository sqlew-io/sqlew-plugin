---
name: sqlew-decision-format
description: |
  REQUIRED format for decisions and constraints in plan mode.
  Plans MUST use 📌 Decision / 🚫 Constraint markers for auto-extraction on ExitPlanMode.
  Invoke this skill when writing plans to get the exact template.
---

## Plan Mode: Decision & Constraint Recording

When including decisions or constraints in your plan, use the following format.
They will be auto-detected on ExitPlanMode and registered as draft in sqlew.

---

### 📌 Decision: [hierarchical/key]

Record decisions using this format:

```markdown
### 📌 Decision: [key/path]
- **Value**: Description of the decision
- **Layer**: presentation | business | data | infrastructure | cross-cutting
- **Tags**: tag1, tag2 (optional)
- **Rationale**: Why this decision was made (optional)
- **Alternatives**: Option A, Option B (optional, comma-separated)
- **Tradeoffs**: Pros and cons description (optional)
```

When **Rationale** is provided, a Decision Context record is automatically created
alongside the decision, capturing the reasoning and alternatives considered.

**Examples:**

### 📌 Decision: frontend/framework
- **Value**: Use React 18
- **Layer**: presentation
- **Tags**: react, frontend

### 📌 Decision: database/orm
- **Value**: Adopt Prisma
- **Layer**: data
- **Tags**: prisma, orm
- **Rationale**: Type-safe ORM needed for TypeScript backend with complex relations
- **Alternatives**: TypeORM, Drizzle, Knex
- **Tradeoffs**: Best TS integration but slower cold starts vs lighter alternatives

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
