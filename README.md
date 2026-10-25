# Vibe App Scanner for n8n

**Public source preview. Not published on npm or verified by n8n.** The package is deliberately marked private and publication is blocked until a separate release review. There is no n8n Cloud install offer yet.

The VAS deployment-scan API is live. An authorized manual n8n Cloud pilot has exercised API admission, status polling and Slack delivery using HTTP Request nodes. That result does not establish that this native package is published, installable on Cloud or independently live-validated. The native node has synthetic unit and isolated runtime test coverage; standalone packaging checks remain part of its release process.

This community node integrates VAS website standard/quick scans with n8n. It does not scan GitHub/ZIP repositories, run deep scans, add an AI agent, change billing or start replacement scans.

## Operations

| Operation | Behavior |
| --- | --- |
| Start Deployment Scan | One `POST /scans/deployments` with a stable account-scoped deployment identity; returns the admitted or original scan ID |
| Get Scan Status | One `GET /scans/{uuid}/status`, projected to lifecycle, progress, counts, coverage and report access |
| Get Scan Summary | One read of the same status endpoint, plus a deterministic coverage-safe summary; no model call |

The API host is fixed to `https://api.vibeappscanner.com`. No arbitrary host, path, source download, credential validation against target sites, rescan, recovery, cancellation, suppression or billing operation is exposed. The node is not advertised as an AI-agent tool.

## Credentials

Create a **Vibe App Scanner API** credential in n8n and enter your VAS REST API key. It is a masked credential field, not a workflow parameter. Do not put the key in an expression, webhook payload or exported JSON.

- Reads require `scan:read` and an account eligible for REST API access.
- Starting a deployment scan also requires `scan:create`, explicit target permission/terms and available scan allowance. ChatGPT/MCP access alone does not confer REST API access.
- The credential's deliberate **Test** action reads one bounded owner-only scan-list page (`GET /scans?limit=1&offset=0`); it never starts a scan. This tests read access, not scan-creation allowance or `scan:create` scope.
- Existing account entitlements, key retention settings, scan allowances, source/DNS validation and report-access controls remain authoritative. This node does not change them.

## Start a deployment scan

1. Verify the deployment provider's event/signature in a trusted upstream trigger or adapter. Filter to the approved project, environment and successful deployment before this node.
2. Choose **Start Deployment Scan**. Set a fixed **App Origin**, for example `https://app.example.com`. Do not supply a target from the incoming event. Credentials, ports, paths, queries, fragments and target expressions are rejected.
3. Set one fixed **Event Namespace** per provider/project/environment. Use 1–32 letters, digits, dots, underscores or hyphens, starting with a letter/digit.
4. Map **Deployment ID** to the provider's stable deployment identity, not an n8n execution ID, current timestamp, random value per retry or webhook-redelivery ID. Up to 80 letters/digits/colon/dot/underscore/slash/hyphen are accepted, starting with a letter/digit.
5. Confirm that you own or are authorized to scan the fixed app, and accept the VAS scanning terms. Both controls default to false and cannot be supplied by item expressions. Starting a scan uses the account's normal allowance and security checks.

The idempotency key is exactly `n8n:v1:{namespace}:{deploymentId}`, matching the existing HTTP workflow. Keep the account, namespace, deployment ID, app, retention setting and terms unchanged on retries. Changing settings under the same identity causes a conflict, not a new scan. Never fall back to `POST /scans` after an error.

The backend retains deployment identity for the lifetime of the scan row. Deleting/purging that row removes its identity; a separate tombstone ledger is not included. Do not replay events after deleting their scans.

## Read and notify

Connect the returned `scanId` to **Get Scan Status** or **Get Scan Summary** using `{{$json.scanId}}`. Only UUIDs are accepted; a scan ID cannot select another API path or host.

Each operation performs one request per input item. Use n8n's existing Wait and IF nodes for polling, with an explicit iteration count and deadline. Stop on `terminal: true`; do not route failed/cancelled/timed-out or access-error results back to creation. A wait limit does not mean a scan failed or authorize a replacement.

For Slack or another notifier, map `summary` and `reportUrl` from Get Scan Summary. Prefer plain-text delivery and disable mentions/unfurls where available. Notification redelivery is a separate concern: retry only the notification after an ambiguous send, not the whole workflow with a new deployment ID. No exactly-once notification guarantee is included.

An inactive, disabled [native-node workflow example](examples/deployment-to-slack.json) combines these operations with authenticated webhook ingress, deployment filtering, bounded Wait/IF polling and Slack. Follow [the example configuration instructions](examples/README.md): the fixed target/namespace/consent live on the Create node, while the allowlist and enable flag live in Configuration. Automatic creation/read retries are disabled; read errors stop with uncertainty. The package is not published or n8n-verified, so this is a development example, not a production install offer.

Output deliberately excludes finding descriptions/evidence, source, target credentials, raw scanner/provider errors, response headers and arbitrary upstream strings. Independent finding counts remain visible alongside incomplete coverage. Missing/malformed counts and absent coverage are `null`/unknown, not zero. Nonterminal counts are not treated as final. Completed bounded samples, skipped/not-applicable checks and failures remain distinct. Completion or zero findings never establishes that an app is secure.

The status API can return account-permitted report details transiently before projection. The node buffers at most 2 MB per response; an oversized or unreadable response fails with uncertainty, not a clean verdict. Configure n8n execution retention, access controls and error workflows before any real use. Upstream workflow items are still subject to n8n's own persistence policy.

## Retries, errors and batches

- No hidden polling, transport retry, fallback or replacement scan is implemented. n8n's explicit node/workflow retry settings remain under your control. Creation retries must retain the exact same deployment identity and settings.
- Requests time out after 15 seconds; redirects are disabled. After an ambiguous creation response, a scan may already exist. Inspect/retry the same identity only.
- Errors give a fixed action-oriented message without retaining raw transport causes, headers, provider payloads or raw node parameters. Read errors never start a scan. n8n's own workflow-definition/input persistence remains separate from this node's output/error projection.
- All input items are validated before the first HTTP request. An invalid item/configuration rejects the batch without admission, including when Continue On Fail is enabled. Expression failures are sanitized.
- At most 20 items are accepted. Requests are sequential; there is no cross-item transaction. A later HTTP failure does not roll back earlier admitted scans. Use small batches and account for rate limits. With Continue On Fail, runtime failures return only an `error` string paired to the corresponding item.
- One output is paired to each successfully processed or continued-error item. Input content is not copied into output.

## Local build and tests

Based on the official `@n8n/node-cli` 0.53.4 programmatic scaffold. The programmatic implementation prevalidates the whole batch before side effects and sanitizes transport errors without retaining original causes; it does not duplicate backend admission/scanner logic. The runtime has no external dependencies beyond n8n's provided `n8n-workflow` peer. Build/test tooling is development-only.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run lint
npm test
```

Build with Node 24+; the local native runtime check targets n8n 2.44.6 (`n8n-workflow` 2.44.2). n8n requires the peer range `*` for community packages; this does not claim every n8n version has been tested. Strict community lint uses the unmodified default configuration, with no rule suppressions.

For a local editor preview only, use a disposable n8n profile and set `N8N_CUSTOM_EXTENSIONS` to this package's built `dist` directory. n8n loads the development node as `CUSTOM.vibeAppScanner`; a published installed package would use `n8n-nodes-vibe-app-scanner.vibeAppScanner`. The example workflow uses the future published identifier for its creation and status nodes; its Code node formats the notification from the status result. For a disposable development preview, change only those two VAS node types to `CUSTOM.vibeAppScanner`. Do not load it into an existing production n8n profile or run it with real credentials yet.

The synthetic unit tests mock the n8n transport helper and make no network requests. They exercise permission checks, stable deployment identity, prevalidation, request bounds, sanitized failures, paired items and preservation of findings counts with incomplete coverage. The migration-contract fixture uses synthetic data and has no private-repository dependency.

Earlier isolated runtime tests exercised this node on n8n 2.44.6 with mocked loopback transport. Those harnesses are not required by this standalone unit suite. A fresh packaged-install runtime check is still a release gate; see [the release checklist](RELEASING.md). Real webhook authentication, long-wait restart/resume, native credential access and n8n verification remain separate checks.

## Release boundary

No npm publish/release script or GitHub publishing workflow is enabled. This repository contains only the integration source, documentation, examples and synthetic tests; it does not contain the VAS backend or application history. Before publication, confirm npm ownership, review the standalone package, pass the release checks, enable publication deliberately, and publish from GitHub Actions with npm provenance before requesting n8n verification. Cloud discovery is not automatic and verification is not guaranteed. No client scan or VAS deployment is authorized by running these local checks.

Official references:

- [n8n community-node verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md)
- [Submit a community node](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.md)
