# Copilot Instructions

## Commit messages

Always follow Conventional Commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer: BREAKING CHANGE: ...]
```

**Types:** `feat` `fix` `chore` `docs` `refactor` `test` `hotfix` `perf` `ci` `build` `revert`

- Extract the JIRA ticket from the branch name (e.g. `feat/PROJ-123-add-login` → `PROJ-123`) and append it to the description
- Keep the description under 72 characters, imperative mood ("add" not "added")
- Use `!` after the type for breaking changes: `feat!: remove v1 API`
- Use `BREAKING CHANGE:` in the footer to explain what breaks and how to migrate

**Examples:**
```
feat(auth): add OAuth2 login via Google (PROJ-123)
fix(cart): resolve null pointer on empty cart (PROJ-456)
chore(deps): upgrade boto3 to 1.34 (PROJ-789)
feat!: remove deprecated v1 API endpoints (PROJ-012)
```

---

## Branch names

Always suggest branch names in one of these formats:

```
<type>/<JIRA-TICKET>-<short-description>
<username>/<type>/<JIRA-TICKET>/<short-description>
```

**Examples:**
```
feat/PROJ-123-add-oauth-login
Vr/feat/PROJ-123/add-oauth-login

fix/PROJ-456-null-pointer-user-service
Vr/fix/PROJ-456/null-pointer-user-service

hotfix/PROJ-901-fix-prod-500-error
```

---

## Pull request titles

Follow the same Conventional Commits format as commit messages.

---

## Pull request descriptions

Always structure PR descriptions with these sections:

```markdown
## What
<!-- What changes does this PR make? -->

## Why
<!-- Why is this change needed? Include JIRA ticket reference. -->

## Testing
<!-- Steps to verify the change works. -->
```

---

## Code style

- Prefer explicit over clever
- No comments explaining *what* the code does — only *why* when non-obvious
- No TODO/FIXME left in committed code
- No hardcoded secrets, API keys, tokens, or passwords
