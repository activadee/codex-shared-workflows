const fs = require('fs');

const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const formatFinding = (finding) => {
  const checkbox = finding.resolved ? '[x]' : '[ ]';
  const severityLabel = (finding.severity || 'info').toUpperCase();
  const title = finding.title || 'General finding';
  const details = finding.details ? `\n  ${finding.details.trim()}` : '';
  const refs = Array.isArray(finding.files) && finding.files.length
    ? `\n  _Files:_ ${finding.files.join(', ')}`
    : '';
  return `- ${checkbox} **${severityLabel}** — ${title}${details}${refs}`;
};

module.exports = async ({ github, context, core }) => {
  const reviewPath = process.env.REVIEW_FILE;
  if (!reviewPath || !fs.existsSync(reviewPath)) {
    core.setFailed(`Missing review file: ${reviewPath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const summaryText = typeof data.summary === 'string' && data.summary.trim().length > 0
    ? data.summary.trim()
    : (findings.length
      ? `Found ${findings.length} codex finding${findings.length === 1 ? '' : 's'}.`
      : 'No blocking issues detected.');

  const openFindings = findings.filter((finding) => !finding.resolved);
  const hasBlocking = openFindings.some((finding) => (SEVERITY_RANK[finding.severity] ?? 2) >= 2);

  let recommendation;
  if (openFindings.length === 0) {
    recommendation = '✅ Ready to merge – no outstanding findings.';
  } else if (hasBlocking) {
    recommendation = `🚫 Changes required – ${openFindings.length} finding${openFindings.length === 1 ? '' : 's'} remain unresolved.`;
  } else {
    recommendation = `⚠️ Review suggested – ${openFindings.length} finding${openFindings.length === 1 ? '' : 's'} remain.`;
  }

  const findingsSection = findings.length
    ? findings.map(formatFinding).join('\n')
    : '- No findings reported.';

  const marker = '<!-- codex-review-summary -->';
  const timestamp = new Date().toISOString();
  const summaryLines = [
    marker,
    '### Codex Review Summary',
    '',
    `Recommendation: ${recommendation}`,
    '',
    'Summary:',
    summaryText,
    '',
    'Findings:',
    findingsSection,
    '',
    `Generated at ${timestamp}.`,
  ];
  const summaryBody = summaryLines.join('\n');

  const prNumber = context.payload.pull_request.number;

  const existingSummary = await github.paginate(
    github.rest.issues.listComments,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      per_page: 100,
    },
  ).then((comments) =>
    comments.find(
      (comment) =>
        (comment.user?.login || '').includes('[bot]') &&
        typeof comment.body === 'string' &&
        comment.body.includes(marker),
    ),
  );

  if (existingSummary) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existingSummary.id,
      body: summaryBody,
    });
  } else {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: summaryBody,
    });
  }

  core.info(`Updated Codex summary comment with ${findings.length} finding${findings.length === 1 ? '' : 's'}.`);
};
