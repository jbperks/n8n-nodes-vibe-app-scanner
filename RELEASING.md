# Release checklist

This public repository contains only the VAS n8n integration, not the private VAS application or its history.

## Release gates

1. Confirm the npm owner (`vibeappscanner`), public MIT source and repository metadata. Review the exact source, README, examples and npm archive for secrets or private application data.
2. Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, `npm run lint`, `npm test` and `npm run check:package` in this standalone repository.
3. Test the actual npm archive in a disposable n8n instance with synthetic credentials and mocked transport. The 0.1.0 candidate passed 15 scenarios on n8n 2.44.6 through its development loader with non-loopback traffic blocked. This does not establish registry installation, native Cloud availability or live production credential access.
4. Review the release diff and commit it to the public repository. Tag that exact commit `v<package version>`. No runtime changes or private source are added by the publishing workflow.
5. Manually dispatch `.github/workflows/publish.yml` on that tag with the matching `version` input. The workflow reruns the checks and stages the package with provenance. It never directly approves/publishes a staged version. It does not run on pushes or pull requests.
6. Inspect the staged version, archive integrity and GitHub Actions provenance. An npm maintainer approves the exact candidate with their own 2FA. A staged version is not public, and an ambiguous staging response must be inspected before retrying.
7. Verify the public npm version, archive, repository/commit metadata and provenance. Do not advertise installation until this succeeds.
8. Submit the npm URL through the n8n Creator Portal. Submission is not verification. Wait for n8n approval before claiming Cloud discovery or verified status.
9. Revoke the one-time stage-only npm bootstrap token and delete `NPM_STAGE_TOKEN` from this repository's encrypted Actions secrets. Verify both removals. Future trusted-publisher configuration is a separate security-sensitive grant, not automatic.

## Publishing controls

The first release uses a temporary stage-only granular token with no organization access or 2FA bypass. The GitHub secret is exposed only to the staging step, not installation, build or tests. The workflow uses pinned actions, read-only repository access and an OIDC identity for provenance, with no release dependency cache or persisted checkout credentials.

The source-only prepublish guard requires the canonical manually dispatched workflow, matching version tag, commit and registry. It prevents common accidental local releases but is not a security boundary against someone who can edit source or spoof environment variables. npm/GitHub permissions remain authoritative. No automatic version bump, merge, tag push or release approval script is provided.

No client scans, account creation, allowance changes, billing changes or VAS deployment are required by these checks.

## Official references

- [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.md)
- [Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md)
- [npm staged publishing](https://docs.npmjs.com/cli/v11/commands/npm-stage/)
