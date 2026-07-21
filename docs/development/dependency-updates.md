# Dependency update policy

## Cadence

- Weekly review of `pnpm outdated`
- GitHub Dependabot / Renovate PRs when enabled
- Trivy FS scan in CI (`vulnerability-scan` job) for HIGH/CRITICAL
- Weekly scheduled Trivy workflow (`.github/workflows/dependency-security.yml`)

## `pnpm audit` status

The npm legacy audit API currently returns **HTTP 410 Gone**, so `pnpm audit` is **not** a required CI gate.
Do not re-enable it with `continue-on-error` to fake green builds.
Revisit when pnpm/npm ships a working replacement; until then Trivy is the supported free scanner.

## Rules

1. Prefer patch/minor updates in batch PRs; major updates are isolated.
2. Lockfile (`pnpm-lock.yaml`) is committed; CI uses `--frozen-lockfile`.
3. Prisma major upgrades require migration dry-run (and ADR note if behavior changes).
4. Never commit credentials introduced by tooling.

## Ownership

Configure real users/teams in `CODEOWNERS` for security path reviews.
