const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { VibeAppScanner } = require('../dist/nodes/VibeAppScanner/VibeAppScanner.node');
const { VibeAppScannerApi } = require('../dist/credentials/VibeAppScannerApi.credentials');
const contract = require('../dist/nodes/VibeAppScanner/ScanContract');

const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const parameters = { operation: 'startDeploymentScan', targetUrl: 'https://app.example.test', eventNamespace: 'test-app',
  deploymentId: 'deployment-0001', ownershipConfirmed: true, termsAccepted: true };
const created = (extra = {}) => ({ statusCode: 201, body: { contract: 'deployment-scan-v1', scanId: id, status: 'queued', deduplicated: false, ...extra } });
const completed = (extra = {}) => ({ statusCode: 200, body: {
  scanId: id, status: 'completed', progress: 100, isUnlocked: true,
  findingsCount: 7, criticalFindingsCount: 0, highFindingsCount: 2, mediumFindingsCount: 1, lowFindingsCount: 4, infoFindingsCount: 0,
  scannerStatuses: [{ status: 'completed' }, { status: 'failed' }], qualityCoverage: { pageCoverage: 'blocked-page' }, ...extra,
} });
function context(params, responses, { size = 1, values = {}, keepGoing = false } = {}) {
  const calls = [];
  const node = { id: 'vas-test', name: 'VAS test', type: 'n8n-nodes-vibe-app-scanner.vibeAppScanner', typeVersion: 1,
    position: [0, 0], parameters: params };
  const ctx = {
    getInputData: () => Array.from({ length: size }, () => ({ json: { untrusted: 'PRIVATE_INPUT' } })),
    getNode: () => node,
    getNodeParameter: (name, i, fallback) => values[name]?.[i] ?? params[name] ?? fallback,
    continueOnFail: () => keepGoing,
    helpers: { async httpRequestWithAuthentication(credentialType, options) {
      assert.equal(this, ctx);
      calls.push({ credentialType, options: structuredClone(options) });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      assert.ok(next, 'No implicit retry, polling or extra request is allowed');
      return next;
    } },
  };
  return { ctx, calls, execute: () => new VibeAppScanner().execute.call(ctx) };
}

test('package exposes only the VAS node and masked credential; publication is disabled', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.private, true); assert.equal(pkg.license, 'MIT');
  assert.match(pkg.scripts.prepublishOnly, /throw new Error/); assert.equal(pkg.scripts.release, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(pkg.n8n.nodes, ['dist/nodes/VibeAppScanner/VibeAppScanner.node.js']);
  assert.deepEqual(pkg.n8n.credentials, ['dist/credentials/VibeAppScannerApi.credentials.js']);
  assert.equal(pkg.n8n.strict, true);
  const node = new VibeAppScanner().description;
  assert.equal(node.usableAsTool, undefined);
  assert.equal(node.properties.find(p => p.name === 'operation').default, 'getScanStatus');
  for (const key of ['ownershipConfirmed', 'termsAccepted']) assert.equal(node.properties.find(p => p.name === key).default, false);
  for (const key of ['operation', 'targetUrl', 'eventNamespace', 'ownershipConfirmed', 'termsAccepted']) {
    assert.equal(node.properties.find(p => p.name === key).noDataExpression, true);
  }
  const credential = new VibeAppScannerApi();
  assert.equal(credential.properties.length, 1);
  assert.equal(credential.properties[0].typeOptions.password, true);
  assert.equal(credential.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
  assert.equal(credential.test.request.baseURL, contract.API_ORIGIN);
  assert.equal(credential.test.request.method, 'GET');
  assert.deepEqual(credential.test.request.qs, { limit: 1, offset: 0 });
  assert.equal(credential.test.request.disableFollowRedirect, true);
  for (const file of ['nodes/VibeAppScanner/ScanContract.ts', 'nodes/VibeAppScanner/VibeAppScanner.node.ts', 'credentials/VibeAppScannerApi.credentials.ts']) {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(source, /process\.env|['"]node:|require\(|\bfetch\(|readFile|writeFile|eval\(|new Function/);
  }
});

test('creation makes one bounded authenticated request to the fixed idempotent endpoint, with no input echo', async () => {
  const fixture = context({ ...parameters, apiHost: 'https://attacker.invalid' }, [created({ secret: 'PRIVATE_PROVIDER' })]);
  const [[result]] = await fixture.execute();
  assert.deepEqual(result, { json: { contract: 'deployment-scan-v1', scanId: id, status: 'queued', deduplicated: false,
    reportUrl: `https://vibeappscanner.com/dashboard/scans/${id}` }, pairedItem: { item: 0 } });
  assert.equal(fixture.calls.length, 1);
  const { credentialType, options } = fixture.calls[0];
  assert.equal(credentialType, 'vibeAppScannerApi');
  assert.equal(options.url, 'https://api.vibeappscanner.com/scans/deployments');
  assert.equal(options.headers['Idempotency-Key'], 'n8n:v1:test-app:deployment-0001');
  assert.deepEqual(options.body, { targetUrl: 'https://app.example.test', ownershipConfirmed: true, termsAccepted: true, termsVersion: '1.0' });
  assert.equal(options.disableFollowRedirect, true); assert.equal(options.maxRedirects, 0);
  assert.equal(options.timeout, 15000); assert.equal(options.maxResponseBodyBytes, 2_000_000);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|attacker/);
});

test('identical deployments retain the exact request identity on terminal replay and key rotation', async () => {
  for (const status of ['queued', 'completed', 'failed', 'cancelled', 'timeout', 'timed_out']) {
    const a = context(parameters, [created({ status, deduplicated: true })]);
    const b = context({ ...parameters }, [created({ status, deduplicated: true })]);
    assert.deepEqual(await a.execute(), await b.execute());
    assert.deepEqual(a.calls, b.calls);
    assert.equal(a.calls.length, 1);
  }
});

test('native node preserves the frozen HTTP workflow deployment contract without private-repository imports', () => {
  const fixture = require('./fixtures/http-deployment-contract.json');
  const request = contract.prepareRequest('startDeploymentScan', fixture.parameters);
  assert.equal(request.options.headers['Idempotency-Key'], fixture.expected.key);
  assert.equal(request.options.body.targetUrl, fixture.expected.targetUrl);
  assert.equal(request.options.body.termsVersion, fixture.expected.termsVersion);
});

test('fixed target and explicit permission/terms cannot be supplied by item expressions or coercion', async () => {
  for (const override of [
    { ownershipConfirmed: false }, { ownershipConfirmed: 'true' }, { ownershipConfirmed: '={{true}}' },
    { termsAccepted: false }, { termsAccepted: '={{true}}' }, { targetUrl: '={{$json.url}}' },
    { targetUrl: 'https://user:password@app.example.test' }, { targetUrl: 'https://app.example.test/path' },
    { targetUrl: 'https://app.example.test?token=secret' }, { targetUrl: 'http://localhost' },
    { targetUrl: 'https://app.example.test:444' }, { targetUrl: 'https://app.example.test/#fragment' },
    { targetUrl: 'https://127.0.0.1' }, { eventNamespace: '={{$json.namespace}}' },
    { targetUrl: 'https://app.example.test\n' }, { targetUrl: 'https://app.example.test\u2028' },
    { eventNamespace: 'x'.repeat(33) }, { eventNamespace: 'project:ambiguous' },
    { eventNamespace: 'project\n' }, { eventNamespace: 'project\u2029' },
    { deploymentId: 'deployment\r\nHeader:value' }, { deploymentId: 'x'.repeat(81) },
    { deploymentId: 'deployment\n' }, { deploymentId: 'deployment\r' }, { deploymentId: 'deployment\u2028' },
    { operation: '={{$json.operation}}' }, { operation: 'rescan' },
  ]) {
    const fixture = context({ ...parameters, ...override }, []);
    await assert.rejects(fixture.execute(), error => {
      assert.doesNotMatch(JSON.stringify(error), /user:password|token=secret/);
      assert.deepEqual(error.node.parameters, {});
      return true;
    });
    assert.equal(fixture.calls.length, 0);
  }
});

test('prevalidates every item before side effects, enforces batch bound and safely hides expression errors', async () => {
  const fixture = context(parameters, [], { size: 2, values: { deploymentId: ['valid-deployment', 'bad id'] } });
  await assert.rejects(fixture.execute()); assert.equal(fixture.calls.length, 0);
  const tooMany = context(parameters, [], { size: 21 });
  await assert.rejects(tooMany.execute(), /at most 20/); assert.equal(tooMany.calls.length, 0);
  const empty = context(parameters, [], { size: 0 }); assert.deepEqual(await empty.execute(), [[]]);
  const expression = context(parameters, []);
  expression.ctx.getNodeParameter = () => { throw new Error('PRIVATE_EXPRESSION'); };
  await assert.rejects(expression.execute(), e => !JSON.stringify(e).includes('PRIVATE_EXPRESSION'));
});

test('each item keeps its own stable identity, scan result and paired-item link', async () => {
  const fixture = context(parameters, [created(), created({ scanId: otherId })], { size: 2, values: { deploymentId: ['deploy-1', 'deploy-2'] } });
  const [results] = await fixture.execute();
  assert.deepEqual(results.map(r => r.pairedItem.item), [0, 1]);
  assert.deepEqual(results.map(r => r.json.scanId), [id, otherId]);
  assert.deepEqual(fixture.calls.map(c => c.options.headers['Idempotency-Key']), ['n8n:v1:test-app:deploy-1', 'n8n:v1:test-app:deploy-2']);
});

test('read and summary accept only scan UUIDs, use GET and never create, recover or restart scans', async () => {
  for (const operation of ['getScanStatus', 'getScanSummary']) {
    const fixture = context({ operation, scanId: id }, [completed()]);
    const [[result]] = await fixture.execute();
    assert.equal(result.json.scanId, id); assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].options.method, 'GET');
    assert.equal(fixture.calls[0].options.url, `https://api.vibeappscanner.com/scans/${id}/status`);
    assert.equal(fixture.calls[0].options.body, undefined);
    for (const scanId of ['../admin', `${id}/rescan`, `${id}\n`, `${id}\u2029`, 'https://attacker.invalid', '=secret', '']) {
      const bad = context({ operation, scanId }, []); await assert.rejects(bad.execute()); assert.equal(bad.calls.length, 0);
    }
  }
});

test('preserves genuine counts with partial, blocked, skipped and deliberately bounded coverage', async () => {
  const fixture = context({ operation: 'getScanSummary', scanId: id }, [completed({ scannerStatuses: [
    { status: 'completed' }, { status: 'failed', coverageReason: 'scope-limit' },
    { status: 'completed', coverageIncomplete: true, coverageReason: 'scope-limit' }, { status: 'not_applicable' },
  ] })]);
  const [[{ json }]] = await fixture.execute();
  assert.deepEqual(json.counts, { total: 7, critical: 0, high: 2, medium: 1, low: 4, info: 0 });
  assert.deepEqual(json.coverage, { pageCoverage: 'blocked-page', reportedChecks: 4, incompleteChecks: 1, skippedChecks: 1, boundedChecks: 1 });
  assert.match(json.summary, /Findings reported: 7; critical: 0; high: 2/);
  assert.match(json.summary, /behind a blocked page was not assessed/);
  assert.match(json.summary, /Completion and zero findings do not establish/);
});

test('missing or malformed counts and coverage stay unknown, not zero or clean', async () => {
  const fixture = context({ operation: 'getScanSummary', scanId: id }, [completed({
    findingsCount: undefined, highFindingsCount: -1, mediumFindingsCount: 1.2, lowFindingsCount: '8',
    scannerStatuses: undefined, qualityCoverage: { pageCoverage: 'PRIVATE_COVERAGE' }, isUnlocked: undefined,
  })]);
  const [[{ json }]] = await fixture.execute();
  assert.equal(json.counts.total, null); assert.equal(json.counts.high, null); assert.equal(json.counts.medium, null); assert.equal(json.counts.low, null);
  assert.equal(json.coverage.reportedChecks, null); assert.equal(json.coverage.incompleteChecks, null);
  assert.equal(json.reportAccess, 'unknown'); assert.match(json.summary, /unknown/);
  assert.doesNotMatch(json.summary, /PRIVATE_COVERAGE/);
  const zero = context({ operation: 'getScanSummary', scanId: id }, [completed({ findingsCount: 0, criticalFindingsCount: 0, highFindingsCount: 0 })]);
  const [[zeroResult]] = await zero.execute();
  assert.equal(zeroResult.json.counts.total, 0);
  assert.match(zeroResult.json.summary, /Completion and zero findings do not establish that the app is secure/);
});

test('queued/running counts are not final; failed and cancelled scans remain non-clean', async () => {
  for (const status of ['queued', 'running', 'processing', 'failed', 'cancelled', 'timeout', 'timed_out']) {
    const fixture = context({ operation: 'getScanSummary', scanId: id }, [completed({ status })]);
    const [[{ json }]] = await fixture.execute();
    assert.equal(json.status, status); assert.match(json.summary, /not a completed or clean scan/);
    if (['queued', 'running', 'processing'].includes(status)) {
      assert.equal(json.terminal, false); assert.equal(json.counts.total, null);
    } else { assert.equal(json.terminal, true); assert.equal(json.counts.total, 7); }
  }
});

test('rejects mismatched identities, unknown lifecycles, legacy contracts and redirects without fallback', async () => {
  for (const response of [completed({ scanId: otherId }), completed({ scanId: '../secret' }), completed({ status: 'secure' }),
    { statusCode: 302, body: { secret: 'PRIVATE_BODY' }, headers: { location: 'https://attacker.invalid' } },
    { statusCode: 204, body: {} }]) {
    const fixture = context({ operation: 'getScanStatus', scanId: id }, [response]);
    await assert.rejects(fixture.execute()); assert.equal(fixture.calls.length, 1);
  }
  for (const response of [{ statusCode: 201, body: { scanId: id } }, created({ deduplicated: undefined }), created({ scanId: '../secret' })]) {
    const fixture = context(parameters, [response]); await assert.rejects(fixture.execute()); assert.equal(fixture.calls.length, 1);
  }
});

test('HTTP/transport errors never expose provider payloads, headers, credentials or original causes', async () => {
  const transport = new Error('PRIVATE_TRANSPORT_TOKEN');
  transport.response = { data: 'PRIVATE_PROVIDER_BODY' }; transport.config = { headers: { Authorization: 'PRIVATE_AUTH' } };
  for (const response of [transport, ...[401, 403, 404, 409, 429, 500, 503].map(statusCode => ({ statusCode, body: { message: 'PRIVATE_HTTP_BODY' } }))]) {
    for (const operation of ['startDeploymentScan', 'getScanStatus', 'getScanSummary']) {
      const fixture = context({ ...parameters, operation, scanId: id, misplacedKey: 'PRIVATE_PARAMETER' }, [response]);
      await assert.rejects(fixture.execute(), error => {
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE_/);
        assert.notEqual(error.cause, transport);
        assert.doesNotMatch(String(error.cause?.stack), /PRIVATE_/);
        if (operation === 'startDeploymentScan') assert.match(error.message, /SAME deployment ID/);
        else assert.match(error.message, /No scan was started or restarted/);
        return true;
      });
      assert.equal(fixture.calls.length, 1);
    }
  }
});

test('continue-on-error returns only a sanitized error paired to its input, without retrying', async () => {
  const fixture = context({ operation: 'getScanStatus', scanId: id }, [new Error('PRIVATE_TRANSPORT')], { keepGoing: true });
  const [[result]] = await fixture.execute();
  assert.deepEqual(Object.keys(result.json), ['error']); assert.match(result.json.error, /No scan was started/);
  assert.deepEqual(result.pairedItem, { item: 0 }); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  assert.equal(fixture.calls.length, 1);
});

test('allowed output projection drops finding evidence, source, errors, arbitrary strings and input data', async () => {
  const fixture = context({ operation: 'getScanSummary', scanId: id }, [completed({ locked: true, isUnlocked: true,
    findings: [{ name: 'PRIVATE_FINDING', evidence: 'PRIVATE_SOURCE' }], error: 'PRIVATE_ERROR', headers: { token: 'PRIVATE_KEY' },
    scannerStatuses: [{ status: 'failed', error: 'PRIVATE_SCANNER', name: 'PRIVATE_NAME' }],
  })]);
  const [[{ json }]] = await fixture.execute();
  assert.equal(json.counts.total, 7); assert.equal(json.reportAccess, 'locked');
  assert.match(json.summary, /access is not confirmed/); assert.doesNotMatch(JSON.stringify(json), /PRIVATE_/);
});
