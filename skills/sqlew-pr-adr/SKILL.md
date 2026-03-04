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

## Step 3: Group Changes by Decision

Organize the PR body around decisions, not files:

```markdown
## Summary

<!-- 1-3 bullet points: what this PR does overall -->

## Architecture Decisions

### [decision/key] — [Decision Value]

- **Rationale**: Why this decision was made
- **Alternatives**: Options that were considered
- **Tradeoffs**: Pros and cons of the chosen approach
- **Changes**:
  - `path/to/file1.ts` — what changed and why
  - `path/to/file2.ts` — what changed and why

### [another/decision] — [Value]

- **Rationale**: ...
- **Alternatives**: ...
- **Tradeoffs**: ...
- **Changes**:
  - `path/to/file3.ts` — ...

## Other Changes

<!-- Changes not tied to any ADR (refactors, typo fixes, formatting, etc.) -->
- `path/to/file4.ts` — Minor cleanup

## Test Plan

- [ ] Test step 1
- [ ] Test step 2
```

---

## Step 4: Create the PR

```bash
gh pr create \
  --title "<title>" \
  --body "$(cat <<'EOF'
## Summary
...

## Architecture Decisions
...

## Other Changes
...

## Test Plan
...
EOF
)"
```

---

## Edge Cases

- **No decisions found**: Omit the "Architecture Decisions" section entirely. Use standard PR format.
- **Many decisions (>5)**: Include the top 5 by suggest score. Add a note: "See `/sqlew` for full decision history."
- **Decisions without context**: Include the decision key and value, but omit Rationale/Alternatives/Tradeoffs sub-items.
- **All changes are "Other"**: Skip ADR section. This is fine for pure refactors or chore PRs.
