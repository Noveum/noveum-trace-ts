module.exports = {
  types: [
    { type: 'feat', section: '✨ Features' },
    { type: 'fix', section: '🐛 Bug Fixes' },
    { type: 'perf', section: '⚡ Performance Improvements' },
    { type: 'revert', section: '⏪ Reverts' },
    { type: 'docs', section: '📚 Documentation', hidden: false },
    { type: 'style', section: '💄 Styles', hidden: true },
    { type: 'chore', section: '🔧 Miscellaneous Chores', hidden: true },
    { type: 'refactor', section: '♻️ Code Refactoring', hidden: false },
    { type: 'test', section: '✅ Tests', hidden: false },
    { type: 'build', section: '🏗️ Build System', hidden: false },
    { type: 'ci', section: '🔄 Continuous Integration', hidden: false },
  ],
  commitUrlFormat: '{{host}}/{{owner}}/{{repository}}/commit/{{hash}}',
  compareUrlFormat: '{{host}}/{{owner}}/{{repository}}/compare/{{previousTag}}...{{currentTag}}',
  issueUrlFormat: '{{host}}/{{owner}}/{{repository}}/issues/{{id}}',
  userUrlFormat: '{{host}}/{{user}}',
  releaseCommitMessageFormat: 'chore(release): {{currentTag}}',
  issuePrefixes: ['#'],
  bumpFiles: [
    {
      filename: 'package.json',
      type: 'json',
    },
    {
      filename: 'package-lock.json',
      type: 'json',
    },
  ],
  packageFiles: [
    {
      filename: 'package.json',
      type: 'json',
    },
  ],
  scripts: {
    prerelease: 'npm run build && npm test',
    postchangelog: 'npm run format',
  },
};