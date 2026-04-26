/**
 * Release plan generator.
 * Takes the output of generate-changelog.js and produces a structured release plan document.
 */
module.exports = ({ newVersion, bumpType, groups, mergedPr, latestTag, prFiles, today }) => {
  // ── Risk assessment ──────────────────────────────────────────────────────────
  const totalLines = prFiles.reduce((s, f) => s + f.additions + f.deletions, 0);
  const fileCount = prFiles.length;

  const infraRe = /\b(deploy|infra|terraform|k8s|helm|docker|ci|cd|pipeline|iac)\b/i;
  const authRe  = /\b(auth|login|password|token|secret|credential|permission|role|iam)\b/i;
  const dbRe    = /\b(migration|schema|alembic|flyway|liquibase|sql|database)\b/i;

  const touchesInfra = prFiles.some(f => infraRe.test(f.filename));
  const touchesAuth  = prFiles.some(f => authRe.test(f.filename));
  const touchesDb    = prFiles.some(f => dbRe.test(f.filename));
  const hasBreaking  = groups.breaking.length > 0;

  let riskLevel = 'LOW';
  const riskFactors = [];

  if (hasBreaking)  { riskLevel = 'HIGH';   riskFactors.push('Contains breaking changes — downstream consumers must update'); }
  if (touchesAuth)  { riskLevel = 'HIGH';   riskFactors.push('Modifies authentication/security-related files'); }
  if (touchesDb)    { riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel; riskFactors.push('Includes database migrations — coordinate with DBA'); }
  if (touchesInfra) { riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel; riskFactors.push('Modifies infrastructure/deployment configuration'); }
  if (totalLines > 500) { riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel; riskFactors.push(`Large diff: ${totalLines} lines changed`); }
  if (riskFactors.length === 0) riskFactors.push('Small, isolated change with no infrastructure or security impact');

  const riskBadge = { LOW: '🟢 LOW', MEDIUM: '🟡 MEDIUM', HIGH: '🔴 HIGH' }[riskLevel];

  // ── JIRA tickets ─────────────────────────────────────────────────────────────
  const allTickets = [...new Set(
    [...groups.breaking, ...groups.feat, ...groups.fix, ...groups.perf, ...groups.other]
      .flatMap(c => c.jiraTickets)
  )];

  // ── Extract testing section from PR body ─────────────────────────────────────
  const prBody = mergedPr?.body || '';
  const testingMatch = prBody.match(/##\s*Test(?:ing)?\s*\n([\s\S]*?)(?=\n##|$)/i);
  const testingSection = testingMatch?.[1]?.trim() || '_No testing instructions provided in PR description._';

  const author = mergedPr?.user?.login ? `@${mergedPr.user.login}` : '_unknown_';
  const prLink = mergedPr ? `[#${mergedPr.number}](${mergedPr.html_url})` : '_N/A_';
  const bumpLabel = { major: '🔴 MAJOR', minor: '🟡 MINOR', patch: '🟢 PATCH' }[bumpType];
  const prevTag = latestTag || '_first release_';

  // ── Files table (top 25) ─────────────────────────────────────────────────────
  const filesTable = prFiles.length
    ? [
        '| File | +Added | -Removed | Status |',
        '|------|-------:|---------:|--------|',
        ...prFiles.slice(0, 25).map(f =>
          `| \`${f.filename}\` | +${f.additions} | -${f.deletions} | ${f.status} |`
        ),
        ...(fileCount > 25 ? [`| _…and ${fileCount - 25} more files_ | | | |`] : []),
      ].join('\n')
    : '_No file diff available (first release or manual trigger)._';

  // ── Assemble plan ─────────────────────────────────────────────────────────────
  return `# Release Plan: ${newVersion}

| Field | Value |
|-------|-------|
| **Version** | \`${newVersion}\` |
| **Previous Version** | \`${prevTag}\` |
| **Release Date** | ${today} |
| **Release Manager** | ${author} |
| **Merged PR** | ${prLink} |
| **Version Bump** | ${bumpLabel} |
| **JIRA Tickets** | ${allTickets.length ? allTickets.join(' · ') : '_None referenced_'} |
| **Risk Level** | ${riskBadge} |

---

## Summary

${prBody.split('\n').slice(0, 8).join('\n').trim() || '_No description provided._'}

---

## Changes Included

${groups.breaking.length ? `### ⚠️ Breaking Changes\n${groups.breaking.map(c => `- ${c.description} (\`${c.sha}\`)`).join('\n')}\n` : ''}
${groups.feat.length     ? `### ✨ New Features\n${groups.feat.map(c => `- ${c.description} (\`${c.sha}\`)`).join('\n')}\n` : ''}
${groups.fix.length      ? `### 🐛 Bug Fixes\n${groups.fix.map(c => `- ${c.description} (\`${c.sha}\`)`).join('\n')}\n` : ''}
${groups.perf.length     ? `### ⚡ Performance\n${groups.perf.map(c => `- ${c.description} (\`${c.sha}\`)`).join('\n')}\n` : ''}
${groups.other.length    ? `### 🔧 Other Changes\n${groups.other.map(c => `- ${c.description} (\`${c.sha}\`)`).join('\n')}\n` : ''}

---

## Files Changed (${fileCount} files · +${prFiles.reduce((s,f)=>s+f.additions,0)} / -${prFiles.reduce((s,f)=>s+f.deletions,0)})

${filesTable}

---

## Risk Assessment

### ${riskBadge}

**Risk factors:**
${riskFactors.map(r => `- ${r}`).join('\n')}

**Areas affected:**
${[
  touchesAuth  ? '- 🔐 Authentication / Authorization' : '',
  touchesDb    ? '- 🗄️  Database / Migrations' : '',
  touchesInfra ? '- 🏗️  Infrastructure / Deployment' : '',
  !touchesAuth && !touchesDb && !touchesInfra ? '- 📦 Application code only' : '',
].filter(Boolean).join('\n')}

---

## Test Plan

${testingSection}

---

## Rollback Plan

### Option A — Revert the merge commit
\`\`\`bash
# Find the merge commit SHA from the release notes, then:
git revert -m 1 <merge-commit-sha>
git push origin main
\`\`\`

### Option B — Redeploy previous release
The previous stable tag is \`${prevTag}\`. Redeploy from that ref using your standard deployment process.

### Option C — Hotfix
Branch off \`main\` following the naming convention:
\`\`\`
hotfix/JIRA-XXX-brief-description
\`\`\`

---

## Pre-Release Checklist

- [ ] All CI checks are green
- [ ] Code review approved by at least one reviewer
- [ ] CHANGELOG.md reflects this release
- [ ] Release notes reviewed for accuracy
- [ ] Deployment pipeline confirmed ready
- [ ] Rollback procedure acknowledged by release manager
${touchesDb    ? '- [ ] Database migration tested on staging\n- [ ] DBA sign-off obtained' : ''}
${touchesInfra ? '- [ ] Infrastructure changes reviewed by platform team' : ''}
${touchesAuth  ? '- [ ] Security review completed' : ''}
${allTickets.length ? `- [ ] JIRA tickets updated to \`Done\`: ${allTickets.join(', ')}` : ''}

---

_Generated automatically by [release-automation.yml](../../.github/workflows/release-automation.yml)_
`;
};
