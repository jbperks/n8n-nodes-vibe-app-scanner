# Release checklist

This public repository contains only the VAS n8n integration. The VAS application and backend source are not included.

## Current status

- Public source preparation: complete once the initial repository upload is verified.
- npm publication: blocked by `private: true` and the deliberate `prepublishOnly` guard.
- n8n verification: not submitted. A public repository alone does not make a node available in n8n Cloud.
- Publishing credentials and owner: not configured. Do not commit tokens or credentials.

## Before the first npm release

1. Confirm the npm account or organization that will own `n8n-nodes-vibe-app-scanner`. Align the npm maintainer and repository author metadata.
2. Review the exact exported source, license, README, examples and npm package file list. Check that no account data, secrets, private application code or private Git history is included.
3. Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, `npm run lint` and `npm test` from this standalone repository. Review an `npm pack --dry-run --json --ignore-scripts` result.
4. Run the packaged native node in an isolated disposable n8n instance with synthetic credentials and mocked transport. An HTTP Request workflow test is not a native package installation test.
5. Add and review a GitHub Actions publishing workflow with npm provenance, following the current n8n requirements. Configure trusted publishing or an appropriately scoped publisher credential. Never commit that credential. No publishing workflow is enabled in this source-preparation stage.
6. Deliberately remove `private: true` and the publication guard in a separate reviewed release change. Update the package-boundary tests at the same time. Keep the runtime permission, privacy and coverage tests.
7. Publish from GitHub Actions with provenance. Verify the actual public npm archive and its source/repository metadata before advertising installation.
8. Submit the published package through the n8n Creator Portal. Wait for n8n's review before claiming verified status or n8n Cloud discovery.

No client scans, account creation, allowance changes, billing changes or VAS deployment are required for these local checks.

## Official references

- [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.md)
- [Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md)
