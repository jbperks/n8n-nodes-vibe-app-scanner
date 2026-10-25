const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validateRelease } = require('../scripts/release-guard.cjs');
const pkg = require('../package.json');
const repository = 'jbperks/n8n-nodes-vibe-app-scanner';
const head = 'a'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: repository,
  GITHUB_REF: `refs/tags/v${pkg.version}`, GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/publish.yml@refs/tags/v${pkg.version}`,
  GITHUB_SHA: head, RELEASE_EXPECTED_VERSION: pkg.version, npm_config_registry: 'https://registry.npmjs.org/' };

test('release guard requires the manually dispatched canonical tagged source and public provenance configuration', () => {
  assert.doesNotThrow(() => validateRelease(env, pkg, head));
  for (const key of Object.keys(env)) assert.throws(() => validateRelease({ ...env, [key]: 'wrong' }, pkg, head), /Release blocked/);
  assert.throws(() => validateRelease({}, pkg, head), /Release blocked/);
  assert.throws(() => validateRelease(env, pkg, 'b'.repeat(40)), /Release blocked/);
  for (const changed of [{ ...pkg, private: true }, { ...pkg, version: '0.1.0-beta' }, { ...pkg, publishConfig: {} }]) {
    assert.throws(() => validateRelease(env, changed, head), /Release blocked/);
  }
});

test('workflow stages only on explicit tag dispatch, reruns checks, and limits credential exposure to staging', () => {
  const source = readFileSync(join(__dirname, '..', '.github/workflows/publish.yml'), 'utf8');
  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /\n  (push|pull_request|pull_request_target|schedule):|npm publish|cache:/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /id-token: write/);
  assert.equal((source.match(/secrets\.NPM_STAGE_TOKEN/g) ?? []).length, 1);
  for (const check of ['release-guard.cjs', 'npm ci --ignore-scripts', 'npm run build', 'npm run lint', 'npm test', 'npm run check:package']) {
    assert.ok(source.indexOf(check) < source.indexOf('npm stage publish'));
  }
  assert.match(source, /npm stage publish --provenance --access public/);
  assert.match(source, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(source, /actions\/setup-node@[a-f0-9]{40}/);
});
