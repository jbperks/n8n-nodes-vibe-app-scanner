import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';

export const API_ORIGIN = 'https://api.vibeappscanner.com';
export const MAX_ITEMS = 20;
const CONTRACT = 'deployment-scan-v1';
const states = ['queued', 'running', 'processing', 'completed', 'failed', 'cancelled', 'timeout', 'timed_out'];
const terminal = ['completed', 'failed', 'cancelled', 'timeout', 'timed_out'];
const pages = ['unclassified', 'login-page', 'blocked-page', 'placeholder-only', 'parked-domain', 'unreachable', 'reachability-unconfirmed'];
const severities = ['critical', 'high', 'medium', 'low', 'info'];

export type Operation = 'startDeploymentScan' | 'getScanStatus' | 'getScanSummary';
export class ScanContractError extends Error {}
export interface ScanRequest { operation: Operation; scanId?: string; options: IHttpRequestOptions }

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function count(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}
function wholeMatch(value: unknown, pattern: RegExp): value is string {
  // JavaScript's $ anchor also accepts a final line terminator. Headers/IDs must match in full.
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}
function scanIdOrNull(value: unknown): string | null {
  return wholeMatch(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? value.toLowerCase() : null;
}
export function validateScanId(value: unknown): string {
  const scanId = scanIdOrNull(value);
  if (scanId === null) {
    throw new ScanContractError('Enter the scan UUID returned by VAS. Paths and URLs are not scan IDs.');
  }
  return scanId;
}
export function validateOperation(value: unknown): Operation {
  if (!['startDeploymentScan', 'getScanStatus', 'getScanSummary'].includes(value as string)) {
    throw new ScanContractError('Choose Start Deployment Scan, Get Scan Status or Get Scan Summary. Expressions cannot choose an operation.');
  }
  return value as Operation;
}
function origin(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !wholeMatch(value, /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}\/?$/i)) {
    throw new ScanContractError('Set one fixed HTTPS app origin, without credentials, port, path, query or fragment. Target expressions are not supported.');
  }
  const parsed = new URL(value);
  return parsed.origin;
}
export function prepareRequest(operation: Operation, values: Record<string, unknown>): ScanRequest {
  const common: IHttpRequestOptions = {
    url: '', json: true, timeout: 15000, disableFollowRedirect: true, maxRedirects: 0,
    ignoreHttpStatusErrors: true, returnFullResponse: true, maxResponseBodyBytes: 2_000_000,
    headers: { Accept: 'application/json' },
  };
  if (operation === 'startDeploymentScan') {
    if (values.ownershipConfirmed !== true || values.termsAccepted !== true) {
      throw new ScanContractError('Confirm that you own or may scan this app, and accept the VAS scanning terms before starting.');
    }
    if (!wholeMatch(values.eventNamespace, /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/) ||
        !wholeMatch(values.deploymentId, /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,79}$/)) {
      throw new ScanContractError('Set a fixed event namespace and a stable deployment ID. Keep both unchanged on retries; do not use execution IDs or timestamps.');
    }
    return { operation, options: { ...common, method: 'POST', url: `${API_ORIGIN}/scans/deployments`,
      headers: { ...common.headers, 'Idempotency-Key': `n8n:v1:${values.eventNamespace}:${values.deploymentId}` },
      body: { targetUrl: origin(values.targetUrl), ownershipConfirmed: true, termsAccepted: true, termsVersion: '1.0' },
    } };
  }
  const scanId = validateScanId(values.scanId);
  return { operation, scanId, options: { ...common, method: 'GET', url: `${API_ORIGIN}/scans/${scanId}/status` } };
}
export function httpError(status: unknown, operation: Operation): ScanContractError {
  const retry = operation === 'startDeploymentScan'
    ? ' A scan may already exist. Retry only with the SAME deployment ID, namespace, app and settings; never fall back to /scans.'
    : ' No scan was started or restarted. Retry only this read operation.';
  const message = status === 401 ? 'VAS authentication was rejected. Check the API key.'
    : status === 403 ? 'VAS access was rejected. Check REST API eligibility and required key scopes.'
    : status === 404 ? 'The VAS scan or endpoint is unavailable. Check the scan ID and account access.'
    : status === 409 ? 'This deployment conflicts with an existing scan or settings. Inspect the original scan before retrying.'
    : status === 429 ? 'VAS could not accept this request now. Check rate limits and scan allowance before retrying.'
    : 'VAS did not confirm this request. Check service availability before retrying.';
  return new ScanContractError(message + retry);
}
function projectStatus(body: Record<string, unknown>, expectedId: string): IDataObject {
  const scanId = validateScanId(body.scanId);
  if (scanId !== expectedId || !states.includes(body.status as string)) {
    throw new ScanContractError('VAS returned an unrecognized scan identity or lifecycle state. Inspect the existing scan; do not start a replacement.');
  }
  const isTerminal = terminal.includes(body.status as string);
  const hasChecks = Array.isArray(body.scannerStatuses) && body.scannerStatuses.length <= 1000;
  const checks = hasChecks ? (body.scannerStatuses as unknown[]).map(object) : [];
  const completed = checks.filter(s => s.status === 'completed');
  const skipped = checks.filter(s => ['skipped', 'not_applicable'].includes(s.status as string));
  const bounded = completed.filter(s => s.coverageReason === 'scope-limit');
  const incomplete = checks.filter(s => ['failed', 'timed_out', 'timeout'].includes(s.status as string) ||
    (s.coverageIncomplete === true && s.coverageReason !== 'scope-limit') ||
    !['completed', 'failed', 'timed_out', 'timeout', 'skipped', 'not_applicable'].includes(s.status as string));
  const page = object(body.qualityCoverage).pageCoverage;
  const counts: IDataObject = { total: isTerminal ? count(body.findingsCount) : null };
  for (const severity of severities) counts[severity] = isTerminal ? count(body[`${severity}FindingsCount`]) : null;
  return {
    scanId, status: body.status as string, terminal: isTerminal,
    progress: typeof body.progress === 'number' && Number.isFinite(body.progress) && body.progress >= 0 && body.progress <= 100 ? body.progress : null,
    reportUrl: `https://vibeappscanner.com/dashboard/scans/${scanId}`,
    reportAccess: body.locked === true || body.isUnlocked === false ? 'locked' : body.isUnlocked === true ? 'available' : 'unknown',
    counts,
    coverage: {
      pageCoverage: pages.includes(page as string) ? page as string : 'unknown',
      reportedChecks: hasChecks ? checks.length : null,
      incompleteChecks: hasChecks ? incomplete.length : null,
      skippedChecks: hasChecks ? skipped.length : null,
      boundedChecks: hasChecks ? bounded.length : null,
    },
  };
}
function summary(status: IDataObject): IDataObject {
  const counts = status.counts as IDataObject;
  const coverage = status.coverage as IDataObject;
  const number = (value: unknown) => value === null ? 'unknown' : String(value);
  const labels: Record<string, string> = {
    'login-page': 'Login page only', 'blocked-page': 'Application behind a blocked page was not assessed',
    'placeholder-only': 'Placeholder content only', 'parked-domain': 'Parked domain only',
    unreachable: 'Application unreachable', 'reachability-unconfirmed': 'Application reachability not confirmed',
    unclassified: 'Application scope not classified', unknown: 'Application coverage unknown',
  };
  const lines = [`VAS scan status: ${status.status}.`,
    `Findings reported: ${number(counts.total)}; critical: ${number(counts.critical)}; high: ${number(counts.high)}.`,
    `Coverage: ${labels[coverage.pageCoverage as string]}.`,
    `Checks incomplete or unsuccessful: ${number(coverage.incompleteChecks)} of ${number(coverage.reportedChecks)} reported.`,
    `Checks skipped or not applicable: ${number(coverage.skippedChecks)}; checks limited to a bounded sample: ${number(coverage.boundedChecks)}.`,
  ];
  if (status.status !== 'completed') lines.push('This is not a completed or clean scan result. No replacement scan was started.');
  if (status.reportAccess !== 'available') lines.push('Detailed report access is not confirmed. Check VAS account permissions.');
  lines.push('Completion and zero findings do not establish that the app is secure. Review report coverage and unresolved checks.',
    `Report: ${status.reportUrl}`);
  return { ...status, summary: lines.join('\n') };
}
export function projectResponse(response: unknown, request: ScanRequest): IDataObject {
  const envelope = object(response);
  if (!Number.isInteger(envelope.statusCode) || (envelope.statusCode as number) < 200 || (envelope.statusCode as number) >= 300) {
    throw httpError(envelope.statusCode, request.operation);
  }
  const body = object(envelope.body);
  if (request.operation === 'startDeploymentScan') {
    if (body.contract !== CONTRACT || typeof body.deduplicated !== 'boolean' || !states.includes(body.status as string)) {
      throw new ScanContractError('VAS did not return the deployment-scan-v1 contract. Retry only with the SAME deployment ID; never fall back to /scans.');
    }
    const scanId = scanIdOrNull(body.scanId);
    if (scanId === null) {
      throw new ScanContractError('VAS returned an invalid creation response. A scan may already exist. Retry only with the SAME deployment ID; never fall back to /scans.');
    }
    return { contract: CONTRACT, scanId, status: body.status as string, deduplicated: body.deduplicated,
      reportUrl: `https://vibeappscanner.com/dashboard/scans/${scanId}` };
  }
  if (envelope.statusCode !== 200) throw httpError(envelope.statusCode, request.operation);
  const status = projectStatus(body, request.scanId!);
  return request.operation === 'getScanSummary' ? summary(status) : status;
}
