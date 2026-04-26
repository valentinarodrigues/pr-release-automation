# PR → Release Lifecycle

This document describes the full lifecycle from branch creation to a published GitHub Release.

---

## End-to-End Flow

```mermaid
flowchart TD
    A([👩‍💻 Developer]) -->|creates branch| B

    B["📌 Branch\n<code>feat/PROJ-123-add-login</code>"]
    B -->|commits work| C
    C["💾 Commits\n<code>feat(auth): add OAuth2 login</code>"]
    C -->|opens PR to main| D

    D{{"🔀 Pull Request\nOpened / Updated"}}
    D -->|triggers| E

    subgraph VALIDATE ["🔍 pr-validation.yml  (on: pull_request → main)"]
        E["actions/checkout@v4"]
        E --> F["actions/github-script@v7\n→ scripts/validate-pr.js"]
        F --> G1["1️⃣  Branch name\nfeat|fix|… / JIRA-000-desc"]
        F --> G2["2️⃣  JIRA consistency\nbranch ticket ∈ PR body"]
        F --> G3["3️⃣  PR title\nConventional Commits"]
        F --> G4["4️⃣  WIP / draft check"]
        F --> G5["5️⃣  PR description\nmin 50 chars + sections"]
        F --> G6["6️⃣  PR size\n≤50 files · ≤1000 lines"]
        F --> G7["7️⃣  Commit messages\nConventional Commits per commit"]
        F --> G8["8️⃣  Sensitive data scan\nregex over added lines"]
        F --> G9["9️⃣  Reviewer check"]
    end

    G1 & G2 & G3 & G4 & G5 & G6 & G7 & G8 & G9 --> H

    H{Any ❌ failures?}
    H -->|Yes| I["💬 Bot posts\nvalidation report comment\n\n🚫 Status check FAILS\n(merge blocked)"]
    H -->|No| J["💬 Bot posts ✅ report\n\nStatus check PASSES"]

    I -->|Developer fixes & pushes| D
    J -->|Code review| K

    K{Approved?}
    K -->|No — request changes| A
    K -->|Yes| L

    L(["🔀 PR merged to main"])
    L -->|triggers| M

    subgraph RELEASE ["🚀 release-automation.yml  (on: push → main)"]
        M["Skip if actor == github-actions[bot]\nor commit has [skip-release]"]
        M --> N["actions/checkout@v4\n(full history)"]
        N --> O["Step 1 — generate-changelog.js\n• Find latest semver tag\n• Collect commits since tag\n• Parse Conventional Commits\n• Determine semver bump\n• Build changelog entry"]
        O --> P["Step 2 — generate-release-plan.js\n• Risk assessment\n• Files changed table\n• JIRA ticket list\n• Rollback plan\n• Pre-release checklist"]
        P --> Q["Step 3 — Update CHANGELOG.md\nvia GitHub API (no git push)\ncommit msg: [skip-release]"]
        Q --> R["Step 4 — Create GitHub Release\n• Semver tag (v1.2.3)\n• Release notes from changelog\n• Marks breaking → major"]
        R --> S["Step 5 — Upload artifact\nrelease-plan-v1.2.3.md\n(retained 90 days)"]
    end

    S --> T(["📦 Release published\nGitHub Release + tag\nCHANGELOG.md updated\nRelease plan artifact"])

    style VALIDATE fill:#e8f4fd,stroke:#2196f3,stroke-width:2px
    style RELEASE  fill:#e8fdf0,stroke:#4caf50,stroke-width:2px
    style I        fill:#fde8e8,stroke:#f44336
    style T        fill:#e8fde8,stroke:#4caf50
```

---

## Validation Check Reference

| # | Check | Trigger | Result on fail |
|---|-------|---------|---------------|
| 1 | **Branch name** | Any PR event | ❌ Blocks merge |
| 2 | **JIRA consistency** | Any PR event | ⚠️ Warning only |
| 3 | **PR title** | Edited / opened | ❌ Blocks merge |
| 4 | **WIP / draft** | Any PR event | ❌ Blocks merge |
| 5 | **PR description** | Edited / opened | ❌ (<50 chars) / ⚠️ (missing sections) |
| 6 | **PR size** | Push to PR | ❌ (>50 files) / ⚠️ (>1000 lines) |
| 7 | **Commit messages** | Push to PR | ⚠️ Warning only |
| 8 | **Sensitive data** | Push to PR | ❌ Blocks merge |
| 9 | **Reviewer assigned** | Any PR event | ⚠️ Warning only |

---

## Version Bump Rules

| Condition | Bump | Example |
|-----------|------|---------|
| Any commit with `!` or `BREAKING CHANGE:` | **Major** `v1.0.0 → v2.0.0` | API removed |
| Any `feat:` commit | **Minor** `v1.0.0 → v1.1.0` | New endpoint |
| Only `fix:` / `chore:` / etc. | **Patch** `v1.0.0 → v1.0.1` | Bug fix |
| No prior tag | First release | `v0.1.0` |

---

## Branch Naming Convention

```
<type>/<JIRA-TICKET>-<short-description>

Types:
  feat      → new feature
  fix       → bug fix
  chore     → maintenance / dependency updates
  docs      → documentation only
  refactor  → code restructure, no behavior change
  test      → tests only
  hotfix    → urgent production fix
  release   → release preparation branch

Examples:
  feat/PROJ-123-oauth-login
  fix/PROJ-456-null-pointer-user-service
  chore/PROJ-789-upgrade-node-20
  hotfix/PROJ-901-fix-prod-500-error
```

---

## Release Artifact Structure

After every merge to `main` a GitHub Release is created containing:

```
GitHub Release (tag: v1.2.3)
├── Release notes   ← generated from Conventional Commits
│
Workflow Artifact (90-day retention)
└── release-plan-v1.2.3.md
    ├── Summary
    ├── Changes Included (grouped by type)
    ├── Files Changed (table)
    ├── Risk Assessment (LOW / MEDIUM / HIGH)
    ├── Test Plan (from PR body)
    ├── Rollback Plan
    └── Pre-Release Checklist
```
