# Deployment-to-Slack example

The [example workflow](deployment-to-slack.json) is inactive and scanning is disabled. It uses the native VAS node for creation and status reads, not a generic HTTP Request node for VAS calls. A Code node formats the notification from the returned status. Install a published npm version before n8n can recognize its two VAS nodes. This package is not n8n-verified; Cloud discovery requires separate approval.

## Configure before use

1. Review the workflow in a disposable n8n instance first. For a source preview loaded through `N8N_CUSTOM_EXTENSIONS`, replace the two `n8n-nodes-vibe-app-scanner.vibeAppScanner` node types with `CUSTOM.vibeAppScanner`.
2. On **Create deployment scan**, select **Start Deployment Scan**. Configure one fixed authorized HTTPS app origin and event namespace. Keep the namespace unchanged across redeliveries. Ownership and terms controls ship false; only the authorized operator may enable them after reviewing the [VAS scanning terms](https://vibeappscanner.com/terms).
3. In **Configuration**, set the approved deployment project/environment and Slack channel ID. Configuration reads the fixed target, namespace and consent directly from Create deployment scan's `.params`; do not add a second target or accept one from an incoming event. Leave `enabled` false until authorization and the upstream event checks are ready.
4. Bind separate credentials for the deployment webhook, VAS and Slack. Use a VAS account eligible for REST API access with `scan:create` and `scan:read`. For Slack, use a dedicated bot with `chat:write` and invite it only to the intended channel. Never enter keys in Code nodes, expressions, event bodies or exported workflow JSON.
5. Verify the provider signature and normalize its event in a trusted upstream trigger/adapter. The template's header-auth webhook protects ingress but does not itself validate a provider-specific signature. Do not expose it as an unauthenticated public webhook.
6. Send one normalized event only after approval:

```json
{
  "project": "example-app",
  "environment": "production",
  "status": "succeeded",
  "eventId": "deploy-0001"
}
```

The event cannot select the app origin, API host or Slack destination. Unknown projects, other environments and unsuccessful deployments stop before scan creation. A stable provider deployment ID must survive retries; never replace it with an execution ID or timestamp.

## Polling and delivery

The workflow uses bounded Wait/IF polling (30 checks and a 20-minute deadline by default). Creation and status reads have no automatic retries. An uncertain read or wait limit does not authorize another scan. Inspect the existing scan; retry a creation only with the identical event identity and configuration.

Slack receives a plain-text summary of counts, coverage and a VAS report link, not finding evidence or source. Incomplete checks, skipped checks and bounded samples remain visible. Completion and zero findings do not prove that an app is secure.

Notification delivery is not exactly once. If sending is uncertain, retry only the notification after checking delivery; do not create a new scan. Execution persistence is minimized in this example, but in-flight Wait state and n8n instance permissions still require review.

This example does not publish itself, enable scheduled scanning, configure credentials or grant target permission.
