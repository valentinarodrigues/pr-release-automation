# PR Release Automation

Automated PR validation and release management — built entirely on GitHub Actions with no third-party services.

## What it does

| Trigger | Workflow | Output |
|---------|----------|--------|
| PR opened / updated → `main` | `pr-validation.yml` | Validation report comment on the PR |
| Merge to `main` | `release-automation.yml` | GitHub Release + updated `CHANGELOG.md` + release plan artifact |

---

## PR Validation (9 checks)

Every PR targeting `main` is automatically checked:

| # | Check | Pass criteria | Blocking? |
|---|-------|--------------|-----------|
| 1 | **Branch name** | Matches `<type>/JIRA-123-description` | ❌ Yes |
| 2 | **JIRA consistency** | Branch ticket appears in PR body | ⚠️ Warn |
| 3 | **PR title** | Follows Conventional Commits | ❌ Yes |
| 4 | **WIP / draft** | Not a draft or `[WIP]` title | ❌ Yes |
| 5 | **PR description** | ≥ 50 chars + `## What` `## Why` `## Testing` sections | ❌ / ⚠️ |
| 6 | **PR size** | ≤ 50 files and ≤ 1000 lines | ❌ / ⚠️ |
| 7 | **Commit messages** | Every commit follows Conventional Commits | ⚠️ Warn |
| 8 | **Sensitive data** | No credentials/keys in diff | ❌ Yes |
| 9 | **Reviewer assigned** | At least one reviewer | ⚠️ Warn |

The bot posts (and updates on each push) a report like this:

```
## 🔍 PR Validation Report
> 7 passed · 1 failed · 1 warning

| Status | Check          | Details                                      |
|:------:|----------------|----------------------------------------------|
| ✅     | Branch Name    | `feat/PROJ-123-add-login` — type: `feat` ... |
| ❌     | PR Title       | `add login` does not follow Conventional...  |
| ⚠️     | Reviewers      | No reviewers assigned                        |
```

---

## Release Automation

On every merge to `main` (excluding the bot's own changelog commit):

1. **Changelog generated** — collects commits since the last semver tag, groups by type
2. **Version bumped** — `BREAKING CHANGE` → major, `feat` → minor, everything else → patch
3. **`CHANGELOG.md` updated** — new entry prepended via GitHub API
4. **GitHub Release created** — tagged `vX.Y.Z` with generated release notes
5. **Release plan uploaded** — structured artifact with risk assessment, files changed, rollback plan

---

## Branch & Commit Conventions

### Branch naming
```
<type>/<JIRA-TICKET>-<short-description>

feat/PROJ-123-add-oauth-login
fix/PROJ-456-null-pointer-in-user-service
chore/PROJ-789-upgrade-to-node-20
docs/PROJ-012-update-api-reference
refactor/PROJ-345-extract-payment-service
test/PROJ-678-add-integration-tests
hotfix/PROJ-901-fix-500-on-checkout
release/PROJ-234-prepare-v2-0-0
```

### Commit messages (Conventional Commits)
```
feat(auth): add OAuth2 login via Google
fix(cart): resolve null pointer on empty cart
feat!: remove deprecated v1 API endpoints    ← BREAKING CHANGE (major bump)
chore(deps): upgrade boto3 to 1.34
docs(readme): add deployment instructions
```

### PR title
Same format as commit messages: `<type>(<scope>): description`

---

## Example end-to-end flow

```bash
# 1. Create a feature branch with the correct naming convention
git checkout -b feat/PROJ-123-add-user-notifications

# 2. Make changes and commit using Conventional Commits
git commit -m "feat(notifications): add email notification on order status change"
git commit -m "test(notifications): add unit tests for notification service"

# 3. Push and open a PR targeting main
git push origin feat/PROJ-123-add-user-notifications
# → Open PR with title: feat(notifications): add email notifications
# → Fill in the PR template (What / Why / Testing sections)
# → Assign a reviewer

# 4. pr-validation.yml triggers automatically
# → Bot posts a validation report on the PR
# → Fix any ❌ failures, re-push to re-run

# 5. After approval, merge the PR
# → release-automation.yml triggers
# → CHANGELOG.md updated
# → GitHub Release v0.2.0 created (minor bump for feat)
# → release-plan-v0.2.0.md artifact available for 90 days
```

---

## Overrides

| Scenario | Solution |
|----------|----------|
| Large PR (>1000 lines) is intentional | Add `large-pr` label to suppress size warning |
| Manually trigger a release | Use `workflow_dispatch` on `release-automation.yml` |
| Dry-run release (no tag/release created) | Set `dry_run: true` on `workflow_dispatch` |
| Skip release on a specific commit | Include `[skip-release]` in the commit message |

---

## Lifecycle diagram

See [`docs/lifecycle.md`](docs/lifecycle.md) for the full Mermaid flowchart.

---

## Repository structure

```
.github/
  PULL_REQUEST_TEMPLATE.md        ← pre-filled PR template
  workflows/
    pr-validation.yml             ← runs on every PR to main
    release-automation.yml        ← runs on every merge to main
scripts/
  validate-pr.js                  ← 9 validation checks
  generate-changelog.js           ← changelog + version bump logic
  generate-release-plan.js        ← risk assessment + release plan doc
docs/
  lifecycle.md                    ← Mermaid lifecycle diagram
CHANGELOG.md                      ← auto-updated by release workflow
```

---

## Technologies

- **GitHub Actions** — all orchestration
- **`actions/checkout@v4`** — GitHub official
- **`actions/github-script@v7`** — GitHub official (runs Node.js with Octokit)
- **`actions/upload-artifact@v4`** — GitHub official
- No external services, no third-party actions
