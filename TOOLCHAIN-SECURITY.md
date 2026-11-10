# Tooling security pins

The root package overrides only affected modern versions of two development dependencies:

- `minimatch >=7 <11.0.1` -> `11.0.1` (glob-pattern amplification fix).
- `glob >=9 <=14.0.1` -> `14.0.2` (AbortSignal cancellation fix).

Legacy glob 7 and minimatch 3 consumers retain their existing APIs. These overrides intentionally cross major versions for affected tooling consumers; they must be validated rather than treated as semver-compatible updates. Remove the pins when parent dependencies declare patched versions themselves.

Verification: full app test suite, production type check, ESLint, production builds, and `node scripts/toolchain-smoke.cjs`. The latter creates and extracts an archive through each installed Electron archive-tool consumer against an isolated fixture. It does not build an installer or publish anything.

Sources: https://github.com/advisories/GHSA-g3hv-75wg-m249 and https://github.com/advisories/GHSA-3g3m-2fjr-6pw4. npm audit reported zero findings across all dependencies after these pins on 2026-11-08; this is not a guarantee that no other vulnerabilities exist.
