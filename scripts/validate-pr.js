/**
 * PR Validation Script
 * Runs 9 checks and posts a summary comment on the PR.
 * Called by pr-validation.yml via actions/github-script.
 */
module.exports = async ({ github, context, core }) => {
  const pr = context.payload.pull_request;
  const repo = context.repo;
  const results = [];
  let hasFailure = false;

  const pass = (name, msg) => results.push({ status: '✅', name, msg });
  const fail = (name, msg) => { results.push({ status: '❌', name, msg }); hasFailure = true; };
  const warn = (name, msg) => results.push({ status: '⚠️', name, msg });

  // ── 1. Branch naming ────────────────────────────────────────────────────────
  const branch = pr.head.ref;
  // Supports both patterns:
  //   feat/PROJ-123-description
  //   Vr/feat/PROJ-123/description  (username prefix, slash separator)
  // JIRA ticket is required for feat/fix/refactor/test; optional (warn) for chore/docs/release/hotfix/ci
  const BRANCH_RE = /^(?:[A-Za-z0-9]+\/)?(feat(?:ure)?|fix|chore|docs|refactor|test|hotfix|release|ci|build)\/([A-Z][A-Z0-9]+-\d+)?[\/\-]?[\w-]+$/;
  const JIRA_REQUIRED_TYPES = new Set(['feat', 'feature', 'fix', 'refactor', 'test']);
  const branchMatch = BRANCH_RE.exec(branch);
  let jiraFromBranch = null;
  let branchType = null;

  if (!branchMatch) {
    fail(
      'Branch Name',
      `\`${branch}\` does not match the required pattern.\n` +
      '**Required format:** `<type>/JIRA-123-short-description`\n' +
      '**Valid types:** `feat` `fix` `chore` `docs` `refactor` `test` `hotfix` `release`\n' +
      '**Examples:** `feat/PROJ-123-add-oauth-login` or `Vr/feat/PROJ-123/add-oauth-login`'
    );
  } else {
    branchType = branchMatch[1];
    jiraFromBranch = branchMatch[2] || null;
    const ticketNote = jiraFromBranch ? `, ticket: \`${jiraFromBranch}\`` : ' _(no JIRA ticket)_';
    pass('Branch Name', `\`${branch}\` — type: \`${branchType}\`${ticketNote}`);
  }

  // ── 2. JIRA ticket consistency ───────────────────────────────────────────────
  if (branchMatch) {
    const needsJira = JIRA_REQUIRED_TYPES.has(branchType);
    if (!jiraFromBranch && needsJira) {
      fail(
        'JIRA Consistency',
        `Branch type \`${branchType}\` requires a JIRA ticket in the branch name.\n` +
        `**Example:** \`${branchType}/PROJ-123-description\``
      );
    } else if (jiraFromBranch) {
      const bodyJiraRefs = (pr.body || '').match(/[A-Z][A-Z0-9]+-\d+/g) || [];
      if (!bodyJiraRefs.includes(jiraFromBranch)) {
        warn(
          'JIRA Consistency',
          `Branch references \`${jiraFromBranch}\` but it is not mentioned in the PR description. ` +
          'Add the ticket reference so reviewers can trace back to the requirement.'
        );
      } else {
        pass('JIRA Consistency', `\`${jiraFromBranch}\` is referenced in both the branch name and PR description`);
      }
    } else {
      pass('JIRA Consistency', `\`${branchType}\` branches do not require a JIRA ticket`);
    }
  }

  // ── 3. PR title (Conventional Commits) ──────────────────────────────────────
  const TITLE_RE = /^(feat|fix|chore|docs|refactor|test|hotfix|release|perf|ci|build|revert)(\([^)]{1,40}\))?(!)?: .{5,}/;
  if (!TITLE_RE.test(pr.title)) {
    fail(
      'PR Title',
      `\`${pr.title}\` does not follow Conventional Commits format.\n` +
      '**Required format:** `<type>(<scope>): <description>` (description ≥ 5 chars)\n' +
      '**Example:** `feat(auth): add OAuth2 login flow`'
    );
  } else {
    pass('PR Title', `\`${pr.title}\``);
  }

  // ── 4. WIP / draft check ────────────────────────────────────────────────────
  const wipRe = /\b(wip|work.in.progress|do not merge|don'?t merge)\b/i;
  if (wipRe.test(pr.title) || pr.draft) {
    fail(
      'WIP Check',
      'PR is marked as a work-in-progress (WIP title or draft status). ' +
      'Remove WIP markers or mark ready-for-review before merging.'
    );
  } else {
    pass('WIP Check', 'PR is not a draft and title contains no WIP markers');
  }

  // ── 5. PR description quality ────────────────────────────────────────────────
  const body = (pr.body || '').trim();
  if (body.length < 50) {
    fail(
      'PR Description',
      `Description is too short (${body.length} chars, minimum 50). ` +
      'Explain **what** changed, **why**, and **how to test** it.'
    );
  } else {
    const required = ['## What', '## Why', '## Testing'];
    const missing = required.filter(s => !body.includes(s));
    if (missing.length > 0) {
      warn(
        'PR Description',
        `Missing recommended sections: ${missing.map(s => `\`${s}\``).join(', ')}.\n` +
        'Use the PR template sections to give reviewers context.'
      );
    } else {
      pass('PR Description', `All required sections present (${body.length} chars)`);
    }
  }

  // ── 6. PR size ───────────────────────────────────────────────────────────────
  const { data: prFiles } = await github.rest.pulls.listFiles({
    owner: repo.owner,
    repo: repo.repo,
    pull_number: pr.number,
    per_page: 100
  });

  const fileCount = prFiles.length;
  const additions = prFiles.reduce((s, f) => s + f.additions, 0);
  const deletions = prFiles.reduce((s, f) => s + f.deletions, 0);
  const totalLines = additions + deletions;
  const hasLargePrLabel = (pr.labels || []).some(l => l.name === 'large-pr');

  if (fileCount > 50) {
    fail(
      'PR Size',
      `**${fileCount} files** changed exceeds the limit of 50. ` +
      'Please split this into smaller, focused PRs.'
    );
  } else if (totalLines > 1000 && !hasLargePrLabel) {
    warn(
      'PR Size',
      `**${totalLines} lines** changed (+${additions} / -${deletions}) across ${fileCount} files is large. ` +
      'If intentional, add the `large-pr` label to suppress this warning.'
    );
  } else {
    pass('PR Size', `${fileCount} files · +${additions} additions · -${deletions} deletions`);
  }

  // ── 7. Commit messages ───────────────────────────────────────────────────────
  const { data: commits } = await github.rest.pulls.listCommits({
    owner: repo.owner,
    repo: repo.repo,
    pull_number: pr.number,
    per_page: 100
  });

  const COMMIT_RE = /^(feat|fix|chore|docs|refactor|test|hotfix|perf|ci|build|revert)(\([^)]+\))?(!)?: .+/;
  const badCommits = commits
    .map(c => c.commit.message.split('\n')[0])
    .filter(msg => !COMMIT_RE.test(msg) && !msg.startsWith('Merge'));

  if (badCommits.length > 0) {
    warn(
      'Commit Messages',
      `${badCommits.length} commit(s) don't follow Conventional Commits format:\n` +
      badCommits.map(m => `- \`${m.slice(0, 80)}\``).join('\n')
    );
  } else {
    pass('Commit Messages', `All ${commits.length} commit(s) follow Conventional Commits format`);
  }

  // ── 8. Sensitive data scan ───────────────────────────────────────────────────
  const sensitivePatterns = [
    { re: /(?:password|passwd|secret|api_key|apikey|token|private_key)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'hardcoded credential' },
    { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, label: 'private key' },
    { re: /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*\S{16,}/i, label: 'AWS credential' },
    { re: /(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{36,}/i, label: 'GitHub token' },
  ];

  let sensitiveFound = false;
  for (const file of prFiles) {
    if (!file.patch) continue;
    const addedLines = file.patch.split('\n').filter(l => l.startsWith('+')).join('\n');
    for (const { re, label } of sensitivePatterns) {
      if (re.test(addedLines)) {
        fail('Sensitive Data', `Potential **${label}** detected in \`${file.filename}\`. Review carefully before merging.`);
        sensitiveFound = true;
        break;
      }
    }
    if (sensitiveFound) break;
  }
  if (!sensitiveFound) {
    pass('Sensitive Data', 'No obvious sensitive data patterns found in the diff');
  }

  // ── 9. Reviewer assignment ───────────────────────────────────────────────────
  const { data: reviewers } = await github.rest.pulls.listRequestedReviewers({
    owner: repo.owner,
    repo: repo.repo,
    pull_number: pr.number
  });
  const totalReviewers = reviewers.users.length + reviewers.teams.length;
  if (totalReviewers === 0) {
    warn('Reviewers', 'No reviewers assigned. Assign at least one reviewer before merging.');
  } else {
    pass('Reviewers', `${totalReviewers} reviewer(s) assigned`);
  }

  // ── Build & post summary comment ─────────────────────────────────────────────
  const passCount = results.filter(r => r.status === '✅').length;
  const failCount = results.filter(r => r.status === '❌').length;
  const warnCount = results.filter(r => r.status === '⚠️').length;

  const summary = [
    '## 🔍 PR Validation Report',
    '',
    `> **${passCount} passed** · **${failCount} failed** · **${warnCount} warnings** — updated ${new Date().toUTCString()}`,
    '',
    '| Status | Check | Details |',
    '|:------:|-------|---------|',
    ...results.map(r => `| ${r.status} | **${r.name}** | ${r.msg.replace(/\n/g, '<br>')} |`),
    '',
    hasFailure
      ? '> ❌ **Validation failed.** Fix the issues marked above before this PR can be merged.'
      : failCount === 0
        ? '> ✅ **All validations passed.** This PR is ready for review.'
        : '> ⚠️ **Passed with warnings.** Warnings are non-blocking but should be reviewed.',
    '',
    '<details><summary>📋 Branch naming cheatsheet</summary>',
    '',
    '```',
    'feat/PROJ-123-short-description          → new feature',
      'Vr/feat/PROJ-123/short-description       → new feature (with username prefix)',
    'fix/PROJ-456-fix-null-pointer       → bug fix',
    'chore/PROJ-789-update-deps          → maintenance',
    'docs/PROJ-012-api-reference         → documentation',
    'refactor/PROJ-345-extract-service   → code restructure',
    'test/PROJ-678-unit-coverage         → tests only',
    'hotfix/PROJ-901-prod-outage         → urgent production fix',
    'release/PROJ-234-v2-1-0            → release preparation',
    '```',
    '',
    '</details>',
  ].join('\n');

  // Upsert comment (update existing bot comment, or create new one)
  const { data: comments } = await github.rest.issues.listComments({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: pr.number,
    per_page: 100
  });

  const botComment = comments.find(
    c => c.user.type === 'Bot' && c.body.includes('## 🔍 PR Validation Report')
  );

  if (botComment) {
    await github.rest.issues.updateComment({
      owner: repo.owner,
      repo: repo.repo,
      comment_id: botComment.id,
      body: summary
    });
  } else {
    await github.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: pr.number,
      body: summary
    });
  }

  if (hasFailure) {
    core.setFailed(`PR validation failed: ${failCount} check(s) did not pass. See PR comment for details.`);
  } else {
    core.info(`Validation complete: ${passCount} passed, ${warnCount} warnings`);
  }
};
