/**
 * Changelog & version generation script.
 * Called by release-automation.yml via actions/github-script.
 * Returns: { newVersion, bumpType, changelogEntry, groups, mergedPr, latestTag, prFiles }
 */
module.exports = async ({ github, context, core }) => {
  const repo = context.repo;
  const sha = context.sha;

  // ── Get latest semver tag ────────────────────────────────────────────────────
  let latestTag = null;
  let latestTagSha = null;
  try {
    const { data: tags } = await github.rest.repos.listTags({
      owner: repo.owner,
      repo: repo.repo,
      per_page: 10
    });
    const semverTag = tags.find(t => /^v\d+\.\d+\.\d+$/.test(t.name));
    if (semverTag) {
      latestTag = semverTag.name;
      latestTagSha = semverTag.commit.sha;
    }
  } catch (_) {}

  // ── Find the PR that was just merged ────────────────────────────────────────
  let mergedPr = null;
  try {
    const { data: prs } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
      owner: repo.owner,
      repo: repo.repo,
      commit_sha: sha
    });
    mergedPr = prs.find(pr => pr.merged_at && pr.base.ref === 'main') || prs[0] || null;
  } catch (_) {}

  // ── Get commits since last tag (or all if no tag) ────────────────────────────
  let rawCommits = [];
  try {
    if (latestTag) {
      const { data: cmp } = await github.rest.repos.compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: latestTag,
        head: sha
      });
      rawCommits = cmp.commits;
    } else {
      const { data: all } = await github.rest.repos.listCommits({
        owner: repo.owner,
        repo: repo.repo,
        sha: 'main',
        per_page: 100
      });
      rawCommits = all;
    }
  } catch (_) {}

  // ── Parse conventional commits ───────────────────────────────────────────────
  const COMMIT_RE = /^(feat|fix|chore|docs|refactor|test|hotfix|perf|ci|build|revert)(\(([^)]+)\))?(!)?: (.+)/;

  const parsed = rawCommits
    .map(c => {
      const firstLine = c.commit.message.split('\n')[0];
      if (firstLine.startsWith('Merge') || firstLine.includes('[skip-release]')) return null;
      const m = COMMIT_RE.exec(firstLine);
      if (!m) return null;
      const [, type, , scope, bang, description] = m;
      const fullBody = c.commit.message;
      const isBreaking = !!bang || /BREAKING CHANGE:/i.test(fullBody);
      const jiraTickets = [...new Set((fullBody.match(/[A-Z][A-Z0-9]+-\d+/g) || []))];
      const authorLogin = c.author?.login || c.commit.author?.name || 'unknown';
      return { type, scope: scope || null, breaking: isBreaking, description, sha: c.sha.slice(0, 7), jiraTickets, authorLogin };
    })
    .filter(Boolean);

  // ── Version bump logic ────────────────────────────────────────────────────────
  const hasBreaking = parsed.some(c => c.breaking);
  const hasFeature = parsed.some(c => c.type === 'feat');
  let bumpType = 'patch';
  if (hasBreaking) bumpType = 'major';
  else if (hasFeature) bumpType = 'minor';

  let newVersion = 'v0.1.0';
  if (latestTag) {
    const [maj, min, patch] = latestTag.replace('v', '').split('.').map(Number);
    if (bumpType === 'major') newVersion = `v${maj + 1}.0.0`;
    else if (bumpType === 'minor') newVersion = `v${maj}.${min + 1}.0`;
    else newVersion = `v${maj}.${min}.${patch + 1}`;
  }

  // ── Group commits ─────────────────────────────────────────────────────────────
  const groups = {
    breaking: parsed.filter(c => c.breaking),
    feat:     parsed.filter(c => !c.breaking && c.type === 'feat'),
    fix:      parsed.filter(c => !c.breaking && c.type === 'fix'),
    perf:     parsed.filter(c => !c.breaking && c.type === 'perf'),
    other:    parsed.filter(c => !c.breaking && !['feat', 'fix', 'perf'].includes(c.type)),
  };

  // ── Format helpers ────────────────────────────────────────────────────────────
  const fmtCommit = c => {
    const scope = c.scope ? ` **${c.scope}**:` : '';
    const tickets = c.jiraTickets.length ? ` (${c.jiraTickets.join(', ')})` : '';
    return `- ${scope} ${c.description}${tickets} (\`${c.sha}\`)`;
  };

  const today = new Date().toISOString().slice(0, 10);
  const prRef = mergedPr ? `[#${mergedPr.number}](${mergedPr.html_url}) — ${mergedPr.title}` : '_no PR found_';
  const compareUrl = latestTag
    ? `https://github.com/${repo.owner}/${repo.repo}/compare/${latestTag}...${newVersion}`
    : `https://github.com/${repo.owner}/${repo.repo}/commits/main`;

  let entry = `## [${newVersion}](${compareUrl}) — ${today}\n\n`;
  entry += `> Merged PR: ${prRef}\n\n`;

  if (groups.breaking.length) entry += `### ⚠️ Breaking Changes\n${groups.breaking.map(fmtCommit).join('\n')}\n\n`;
  if (groups.feat.length)     entry += `### ✨ New Features\n${groups.feat.map(fmtCommit).join('\n')}\n\n`;
  if (groups.fix.length)      entry += `### 🐛 Bug Fixes\n${groups.fix.map(fmtCommit).join('\n')}\n\n`;
  if (groups.perf.length)     entry += `### ⚡ Performance\n${groups.perf.map(fmtCommit).join('\n')}\n\n`;
  if (groups.other.length)    entry += `### 🔧 Other Changes\n${groups.other.map(fmtCommit).join('\n')}\n\n`;

  if (!parsed.length) {
    entry += `_No conventional commits found since ${latestTag || 'the beginning'}._\n\n`;
  }

  // ── Get PR files for release plan ─────────────────────────────────────────────
  let prFiles = [];
  if (mergedPr) {
    try {
      const { data: files } = await github.rest.pulls.listFiles({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: mergedPr.number,
        per_page: 100
      });
      prFiles = files;
    } catch (_) {}
  }

  core.setOutput('new_version', newVersion);
  core.setOutput('bump_type', bumpType);
  core.setOutput('changelog_entry', entry);

  return { newVersion, bumpType, changelogEntry: entry, groups, mergedPr, latestTag, prFiles, today };
};
