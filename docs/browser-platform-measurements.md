# Browser Platform Measurements

Measurement evidence for Initiative 2, slice 6 (`BRW-001`, `ARC-004`,
`ARC-005`, `BLD-001`, and `BLD-002`). This records the browser-platform
replacement only; it is not a general application-growth benchmark.

## Provenance

- **Pre-cutover source revision:** `98d1656a4922456dc016e07700556c4481d5f2d7`
  (`f28d392^`). It is the immediate Next-based predecessor of the Vite cutover,
  so browser auth/worker code already added by earlier Initiative 2 slices is
  present on both sides of the source comparison.
- **Cutover revision:** `f28d392197ef2d997bf1885dca1695ea059e489e`.
- **Measured current revision:** `39c793d67f6c80b4bae5caa10b59afd2dcd867b0`
  (`HEAD`). `package.json` and `package-lock.json` are unchanged between the
  cutover and this revision.
- **Captured legacy artifact baseline:**
  `.agent-workspace/20260712T131304Z-implementation/baseline.txt`, captured at
  `9e87e07101cd81b1111c5b64481ab587496b2be7`. Its Next build compiled and then
  failed at Prisma type generation. Its `.next` output is therefore **not** a
  complete deployable production build.

The captured `SourceBytes 46,428` predates the browser auth/worker work. It is
not used for the package gate because doing so would attribute unrelated
Initiative 2 feature growth to the Vite replacement.

## Reproducible scope and method

Run the following from the repository root after dependencies are installed:

```sh
npm run build
python3 .agent-workspace/20260712T131304Z-implementation/measure-browser-platform.py
```

The helper uses `git ls-tree -r -l` object sizes for source revisions and the
fresh filesystem `dist` output for artifacts. Its full raw output is kept at
`.agent-workspace/20260712T131304Z-implementation/initiative-2-measurements.txt`.

### Maintained replacement-source file set

The formal source comparator counts only the framework/build/runtime surface:

- On the Next side: `app/**`, the pre-existing `browser/**` foundation,
  `components/hookintoupdates/**`, `domain/playback-stream.ts`, `prisma/**`,
  `providers/spotify/**`, `services/**`, `types/**`, and these maintained
  configuration files: `.eslintrc.json`, `Dockerfile`,
  `example.appconfig.json`, `next.config.js`, `package.json`,
  `tsconfig.browser.json`, `tsconfig.domain.json`, and `tsconfig.json`.
- On the Vite side: `browser/**`, `components/playback/**`, and
  `eslint.config.js`, `index.html`, `spotify/index.html`, `package.json`,
  `tsconfig.browser.json`, `tsconfig.json`, and `vite.config.ts`.

It intentionally excludes `test/**`, shared presentation components, the
shared `domain/playback.ts` model, documentation, README, hooks, lockfiles,
public binaries, and generated directories. Thus test/domain/UI growth cannot
make the replacement appear smaller. `browser/**` is included before the
cutover as well as after it, so earlier browser work is not counted as a Vite
reduction.

| Source comparison                      |                   Before |             At `f28d392` |                  Current |               Current delta |
| -------------------------------------- | -----------------------: | -----------------------: | -----------------------: | --------------------------: |
| Focused framework/build/runtime source | 320,017 bytes (38 files) | 272,681 bytes (24 files) | 279,026 bytes (24 files) | **−40,991 bytes (−12.81%)** |

As a cross-check, the broader source method recorded in the cutover commit
(which also includes shared components and domain code, but still excludes
tests and generated files) is `364,673 → 320,237 → 326,582` bytes. The focused
result above is the formal gate because it avoids unrelated source growth.

### Shipped static artifact file set

The closest available like-for-like baseline is the captured legacy client
asset set:

| Artifact component                                |                  Bytes |
| ------------------------------------------------- | ---------------------: |
| Captured legacy `.next/static`                    |                808,086 |
| Legacy `public/**` copied by the old build script |                160,063 |
| **Legacy static deployment comparator**           |            **968,149** |
| Fresh Vite `dist/**`                              |            **473,462** |
| **Delta**                                         | **−494,687 (−51.10%)** |

`public/**` is unchanged from the captured legacy revision through the
pre-cutover revision. The comparator includes every file served by the Vite
static deployment and the legacy files that the old build script would copy
alongside `.next/static`.

The legacy capture also records `.next/server` as 556,396 bytes and the entire
partial `.next` directory as 36,794,898 bytes. The latter would yield a
context-only delta of −36,321,436 bytes (−98.71%), but is not used as a
deployable-artifact claim because it includes partial build/cache state and the
build did not finish.

## Package gate

The direct additions made by the cutover are
`@tailwindcss/vite@4.3.2`, `@vitejs/plugin-react@6.0.3`,
`eslint-plugin-react-hooks@7.1.1`, `eslint-plugin-react-refresh@0.5.3`,
`globals@17.7.0`, `tailwindcss@4.3.2`, `typescript-eslint@8.63.0`, and
`vite@8.1.4`. The replacement removed eight direct legacy packages, including
Next, Prisma, Axios, SQLite, Chokidar, and Cross-env; the direct package count
remains 17.

The cutover dependency replacement satisfies the two formal measurements as a
set:

| Required measure              |  Before | Current | Result                     |
| ----------------------------- | ------: | ------: | -------------------------- |
| Maintained replacement source | 320,017 | 279,026 | Decreased by 40,991 bytes  |
| Shipped static artifact       | 968,149 | 473,462 | Decreased by 494,687 bytes |

The measurements cannot honestly attribute savings to an individual package;
they evaluate the complete dependency-and-source replacement that is actually
built and shipped. No package metadata changed after `f28d392`.

### Dependency/install context (not part of the formal gate)

| Supporting measure                       |      Before |     Current |                  Delta |
| ---------------------------------------- | ----------: | ----------: | ---------------------: |
| `package-lock.json` bytes                |     230,293 |     107,388 |     −122,905 (−53.37%) |
| Lockfile package entries, excluding root |         473 |         205 |                   −268 |
| Captured/observed `node_modules` bytes   | 477,398,389 | 120,811,327 | −356,587,062 (−74.69%) |

The legacy capture reports `InstalledPackageDirs 389`, but does not record its
counting command, so no directory-count delta is claimed. The current build
ran with Node `v26.5.0` and npm `11.17.0`; package metadata declares
`npm@12.0.1`.

## Fresh `dist` inventory

| File                                       |       Bytes |
| ------------------------------------------ | ----------: |
| `assets/entry-CG0-PC4d.js` (worker)        |      65,489 |
| `assets/spotify-DLiNCVzH.js` (application) |     243,360 |
| `assets/spotify-r_Oiivmx.css`              |       2,653 |
| `favicon.ico`                              |      25,931 |
| `fonts/GeistMonoVF.woff`                   |      67,864 |
| `fonts/GeistVF.woff`                       |      66,268 |
| `index.html`                               |         844 |
| `spotify/index.html`                       |       1,053 |
| **Total**                                  | **473,462** |

`vite.config.ts` sets `sourcemap: false`, uses the physical root and Spotify
HTML entries, and sets `envPrefix: []`.

## `dist` scan

The helper scans emitted text assets (`.html`, `.js`, `.css`, `.json`, `.map`,
and `.txt`) and output filenames. It checks Node/server markers, Next/Prisma/
SQLite markers, legacy routes/services/removed packages, source maps, service
workers, common polyfill markers, and credential-value patterns (private keys,
known token prefixes, JWTs, literal OAuth credential assignments, and
Authorization values).

| Check                                                 | Result |
| ----------------------------------------------------- | ------ |
| Node/server runtime markers                           | None   |
| Next, Prisma, or SQLite remnants                      | None   |
| Legacy routes, services, Axios, or Chokidar remnants  | None   |
| `*.map` files or `sourceMappingURL` markers           | None   |
| Service-worker-like filenames or registration markers | None   |
| Common polyfill/legacy-runtime markers                | None   |
| Embedded credential-material patterns                 | None   |

There are 4 `access_token`, 8 `refresh_token`, and 4 `secret` label matches.
They are protocol-field names used while parsing/requesting OAuth token
responses, and security-validation literals such as `secret-shaped-field` and
the forbidden-key list. They are not user-facing security copy or embedded
access/refresh-token/client-secret values; no `client_secret` label or
credential-value pattern matched.

## Limitations

- The only legacy artifact evidence is the captured partial `.next` output.
  The static comparator demonstrates a reduction against the available client
  files, but does **not** prove the size of a complete legacy Next deployment.
- Static scans establish that the built files do not contain the listed
  markers or literal credential material. They cannot inspect host-provided
  runtime `config.json`, a user's browser storage, or token values received
  after OAuth; binary font/favicon files are inventoried but not text-scanned.
- `dist/` remains ignored generated output; no generated artifact is tracked.
