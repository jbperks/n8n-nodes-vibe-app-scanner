const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const read = p => readFileSync(join(root, p), 'utf8');

test('standalone source metadata points only to the public integration repository', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.repository.url, 'https://github.com/jbperks/n8n-nodes-vibe-app-scanner.git');
  assert.equal(pkg.repository.directory, undefined);
  assert.equal(pkg.private, false);
  assert.equal(pkg.scripts.prepublishOnly, 'node scripts/release-guard.cjs');
  assert.equal(pkg.scripts.release, undefined);
  for (const path of ['README.md', 'credentials/VibeAppScannerApi.credentials.ts', 'nodes/VibeAppScanner/VibeAppScanner.node.json']) {
    assert.doesNotMatch(read(path), /github\.com\/jbperks\/vas(?:[/.#]|$)|\/Users\//);
  }
  assert.match(read('README.md'), /not verified by n8n/);
});

test('example keeps scanning disabled and uses no real account or credential identifiers', () => {
  const example = JSON.parse(read('examples/deployment-to-slack.json'));
  assert.equal(example.active, false);
  const configuration = example.nodes.find(n => n.name === 'Configuration').parameters.jsCode;
  assert.match(configuration, /enabled: false/);
  assert.match(configuration, /\$\('Create deployment scan'\)\.params/);
  const vas = example.nodes.filter(n => n.type === 'n8n-nodes-vibe-app-scanner.vibeAppScanner');
  assert.equal(vas.length, 2);
  assert.deepEqual(vas.map(n => n.parameters.operation).sort(), ['getScanStatus', 'startDeploymentScan']);
  const create = vas.find(n => n.parameters.operation === 'startDeploymentScan');
  assert.equal(create.parameters.ownershipConfirmed, false);
  assert.equal(create.parameters.termsAccepted, false);
  for (const node of example.nodes) {
    for (const credential of Object.values(node.credentials ?? {})) assert.match(credential.id, /^REPLACE_/);
  }
  assert.doesNotMatch(read('examples/deployment-to-slack.json'), /vas_live_[A-Za-z0-9_-]{20,}|xoxb-[A-Za-z0-9-]{20,}|thunkle\.ai|silexdev\.com/);
  assert.equal(example.settings.saveDataSuccessExecution, 'none');
  assert.equal(example.settings.saveDataErrorExecution, 'none');
  assert.equal(example.settings.saveManualExecutions, false);
});

test('synthetic suite has no sibling application or local absolute-path dependencies', () => {
  for (const file of readdirSync(__dirname).filter(p => p.endsWith('.cjs'))) {
    const source = read(`test/${file}`);
    assert.doesNotMatch(source, /(?:import\(|require\()['"]\.\.\/\.\.\//);
    assert.doesNotMatch(source, /\/Users\//);
  }
  const fixture = JSON.parse(read('test/fixtures/http-deployment-contract.json'));
  assert.equal(fixture.parameters.targetUrl, 'https://app.example.test');
});
