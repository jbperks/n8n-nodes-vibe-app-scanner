const { execFileSync } = require('node:child_process');

const repository = 'jbperks/n8n-nodes-vibe-app-scanner';

function validateRelease(env, pkg, head) {
  const tag = `refs/tags/v${pkg.version}`;
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== tag ||
      env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/publish.yml@${tag}` ||
      env.RELEASE_EXPECTED_VERSION !== pkg.version || !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
      !/^[a-f0-9]{40}$/.test(head) || env.GITHUB_SHA !== head ||
      env.npm_config_registry !== 'https://registry.npmjs.org/' ||
      pkg.publishConfig?.registry !== 'https://registry.npmjs.org/' ||
      pkg.publishConfig?.access !== 'public' || pkg.publishConfig?.provenance !== true ||
      pkg.private !== false) {
    throw new Error('Release blocked. Dispatch publish.yml on the matching version tag after reviewing the release checks.');
  }
}

if (require.main === module) {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    validateRelease(process.env, require('../package.json'), head);
  } catch (error) {
    console.error(error.message.startsWith('Release blocked.') ? error.message : 'Release blocked. Verify the checked-out release source.');
    process.exitCode = 1;
  }
}

module.exports = { validateRelease };
