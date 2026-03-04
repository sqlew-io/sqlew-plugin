---
name: sqlew-pr-adr
description: |
  REQUIRED for all PR creation. When creating a pull request, composing a PR body,
  or about to run `gh pr create`, this skill MUST be applied.
  Enriches the PR body with Architecture Decision Records (ADR) from sqlew
  so reviewers understand WHY changes were made, not just what changed.
  Uses diff-based reverse lookup: git diff → suggest → ADR-grouped description.
---

## REQUIRED: Enrich PRs with Decision Context

When creating a pull request, reviewers need **WHY** context, not just what changed.
MUST query sqlew for decisions related to the actual code changes and group the PR description by decision.

---

## Step 1: Get the Diff

```bash
# Get changed files and content vs base branch
git diff <base-branch>...HEAD --stat    # File list
git diff <base-branch>...HEAD           # Full diff
```

Extract keywords from the diff:
- **File paths**: directory names, module names (e.g., `auth`, `migration`, `database`)
- **Function/struct names**: key identifiers added or modified
- **Package/import changes**: new dependencies or module references

---

## Step 2: Reverse-Lookup Decisions via Suggest

For each extracted keyword, query sqlew to find related decisions:

```
suggest { action: "by_context", key: "<keyword>" }
suggest { action: "by_context", key: "<module-name>", tags: ["<relevant-tag>"] }
```

For each matched decision key, fetch full context:

```
decision { action: "get", key: "<matched-key>", include_context: true }
```

This retrieves: **Rationale**, **Alternatives Considered**, **Tradeoffs**.

**Selection rules:**
- Include decisions with score >= 35 from suggest results
- Deduplicate across keyword searches
- Cap at 5 decisions (keep PR readable)
- Skip deprecated decisions

---

## Step 3: Group Files Under Decisions

Organize the PR body so each decision/constraint lists its related files directly:

```markdown
## Summary

<!-- 1-3 bullet points: what this PR does overall -->

## Decision: <title> (<reason>)

- `path/to/file1.ts`: what changed and why
- `path/to/file2.ts`: what changed and why

## Decision: <another title> (<reason>)

- `path/to/file3.ts`: what changed and why

## Constraint: <rule description>

- `path/to/file4.ts`: what changed to comply

## Other Changes

<!-- Changes not tied to any Decision/Constraint -->
- `path/to/file5.ts`: minor cleanup

## Test Plan

- [ ] Test step 1
- [ ] Test step 2
```

**Format rules:**
- `## Decision: <title> (<reason>)` — decision key and rationale in one line
- `## Constraint: <rule>` — constraint text in one line
- Each file entry: `- \`file\`: description` — what changed in that file
- A file may appear under multiple decisions if relevant
- `## Other Changes` — for files not tied to any ADR

---

## Step 4: Create the PR

```bash
gh pr create \
  --title "<title>" \
  --body "$(cat <<'EOF'
## Summary
...

## Decision: <title> (<reason>)
- `file.ts`: description

## Other Changes
- `file.ts`: description

## Test Plan
...
EOF
)"
```

---

## Edge Cases

- **No decisions found**: Use only `## Other Changes`. This is fine for pure refactors or chore PRs.
- **Many decisions (>5)**: Include the top 5 by suggest score. Add a note: "See `/sqlew` for full decision history."
- **Decisions without context**: Use `## Decision: <key> — <value>` without reason parenthetical.
- **Mixed**: Some files under decisions, others under `## Other Changes`.
