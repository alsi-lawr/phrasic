# Overlay Measurements

Measurement evidence for Initiative 3, slice 7 (`STY-001` and `PRF-002`). It
separates the pre-Initiative-3 UI baseline from the pre-cutover aggregate
package exception so that feature growth is visible rather than attributed away.

## Provenance and reproducibility

- **UI baseline:** `7ae48ac4a8104d6632a318b5e8ce11cfed7ba19a` (`master`), the
  recorded pre-Initiative-3 revision from
  `.agent-workspace/20260712T131304Z-implementation/initiative-3-ui-baseline.txt`.
- **Current revision:** `b673973c2d0a5bb22b3191221e394a278305d157`
  (`refactor/03-svg-tailwind-ui`).
- **Captured:** 2026-07-13T10:19:49Z.
- **Toolchain:** Node `v26.5.0`; the ambient npm was `11.17.0`, so every
  install, check, and build used
  `/home/alex/.npm/_npx/0636ef6846913eae/node_modules/npm/bin/npm-cli.js`,
  which reports npm `12.0.1` and matches `.nvmrc`, `engines`, and
  `packageManager`.
- **Isolation:** `git archive` created clean temporary source trees for each
  revision. Each tree ran `npm ci`, `npm run clean`, and `npm run build`; this
  preserved the shared checkout and made both `dist/` trees fresh production
  output.
- **Lockfile:** both trees began and ended at SHA-256
  `835f5586ac85f0f475f735349da77e0db6a7a255ddf61bf40c0ddefe7d3d30ce`.
  `package.json` and `package-lock.json` are unchanged between the UI baseline
  and current revision.

```sh
NPM_CLI=/home/alex/.npm/_npx/0636ef6846913eae/node_modules/npm/bin/npm-cli.js
test "$(node --version)" = 'v26.5.0'
test "$(node "$NPM_CLI" --version)" = '12.0.1'
node "$NPM_CLI" ci
node "$NPM_CLI" run clean
node "$NPM_CLI" run build
sha256sum package-lock.json
python3 -B \
  .agent-workspace/20260712T131304Z-implementation/measure-initiative-3-overlay.py \
  --source . --dist dist
```

The reproducible helper emits sorted paths, byte totals, and SHA-256 hashes for
each scope. It is intentionally scratch-only; this document is the durable
evidence.

## Stable file-set definitions

All source scopes use tracked files at the named revision; they exclude
dependencies, ignored generated output, tests, documentation, and binary public
assets.

| Scope                                     | Definition                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authored CSS                              | Every `*.css` under `browser/` and `components/`. This is six legacy CSS files at baseline and one current stylesheet.                                                                                                                                                                                                                                                                     |
| Maintained presentation source            | `browser/main.tsx`, `spotify/index.html`, and every `components/**/*.ts` or `components/**/*.tsx` file. It deliberately includes the new UI's feature modules.                                                                                                                                                                                                                             |
| Focused maintained styling implementation | Authored CSS, every component TS/TSX module containing a JSX `className` attribute, and—at measurement time—the dedicated `components/overlay/overlay-presentation.ts` class/token module. This includes every class-bearing legacy component rather than counting only current Tailwind tokens. Whole modules are counted because class contracts are colocated with markup and behavior. |
| Generated CSS                             | Every `dist/**/*.css` file after the clean production build.                                                                                                                                                                                                                                                                                                                               |
| Application JS                            | Every module script directly referenced by `dist/spotify/index.html`.                                                                                                                                                                                                                                                                                                                      |
| Worker JS                                 | Every emitted JavaScript URL referenced by `new Worker(new URL(..., import.meta.url))` in the application-JS file set.                                                                                                                                                                                                                                                                     |
| Fonts/assets                              | Every regular `dist/` file other than HTML, JavaScript, or CSS.                                                                                                                                                                                                                                                                                                                            |
| Total `dist`                              | Every regular file after the clean production build; file bytes and `du -sb` agree.                                                                                                                                                                                                                                                                                                        |

The focused styling scope has an unavoidable mixed interpretation: it captures
Tailwind utility usage and the former CSS/class contract, but its component
files also implement SVG geometry, marquee, accessible controls, and playback
states. It is therefore a fair maintained-source measure, not a claim that
every byte of its growth is Tailwind overhead.

### Focused styling-scope members

| Revision  | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7ae48ac` | `browser/globals.css`; `components/NowPlaying.css`; `components/NowPlaying.tsx`; `components/artist/Artist.css`; `components/artist/Artist.tsx`; `components/artwork/AlbumArtwork.tsx`; `components/artwork/Artwork.css`; `components/songdetails/SongDetails.css`; `components/songdetails/SongDetails.tsx`; `components/title/Title.css`; `components/title/Title.tsx`                                                                                                                                    |
| `b673973` | `browser/globals.css`; `components/overlay/FallbackVinyl.tsx`; `components/overlay/MarqueeText.tsx`; `components/overlay/OverlayArtwork.tsx`; `components/overlay/OverlayControls.tsx`; `components/overlay/OverlayMetadata.tsx`; `components/overlay/OverlaySemanticCompanion.tsx`; `components/overlay/OverlayShell.tsx`; `components/overlay/OverlayStatus.tsx`; `components/overlay/OverlayVisual.tsx`; `components/overlay/SpotifyNowPlayingOverlay.tsx`; `components/overlay/overlay-presentation.ts` |

## UI baseline-to-current measurements

| Scope                                     |                  Before |                 Current |                        Delta |
| ----------------------------------------- | ----------------------: | ----------------------: | ---------------------------: |
| Authored CSS                              |   3,284 bytes (6 files) |    1,234 bytes (1 file) |   **−2,050 bytes (−62.42%)** |
| Maintained presentation source            | 21,336 bytes (10 files) | 85,425 bytes (27 files) | **+64,089 bytes (+300.38%)** |
| Focused maintained styling implementation | 18,420 bytes (11 files) | 38,856 bytes (12 files) | **+20,436 bytes (+110.94%)** |
| Generated CSS                             |    2,653 bytes (1 file) |   14,059 bytes (1 file) | **+11,406 bytes (+429.93%)** |
| Application JS                            |  242,889 bytes (1 file) |  260,679 bytes (1 file) |   **+17,790 bytes (+7.32%)** |
| Worker JS                                 |   69,301 bytes (1 file) |   69,301 bytes (1 file) |          **0 bytes (0.00%)** |
| Fonts/assets                              | 160,063 bytes (3 files) |  96,718 bytes (3 files) |  **−63,345 bytes (−39.58%)** |
| Total `dist`                              | 476,803 bytes (8 files) | 442,870 bytes (8 files) |   **−33,933 bytes (−7.12%)** |

The current presentation and focused styling scopes both increase. This is partly
intentional feature growth: the replacement adds exhaustive UI states, setup
controls, track/episode metadata, semantic announcements, reduced motion,
marquee behavior, SVG composition, and Spotify attribution/links. It also
included Tailwind utility strings and the dedicated presentation-class map at
measurement time.
The measurements do not separate those two sources of growth, so they do not
characterize the increase as solely feature work or solely styling overhead.

### Fonts/assets, itemized

| Asset                         |      Before |    Current |       Delta |
| ----------------------------- | ----------: | ---------: | ----------: |
| `favicon.ico`                 |      25,931 |     25,931 |           0 |
| `fonts/GeistMonoVF.woff`      |      67,864 |          — |     −67,864 |
| `fonts/GeistVF.woff`          |      66,268 |     66,268 |           0 |
| `spotify-full-logo-white.svg` |           — |      4,519 |      +4,519 |
| **Total**                     | **160,063** | **96,718** | **−63,345** |

The total artifact is smaller because removal of the 67,864-byte Geist Mono
font outweighs the generated-CSS, application-JS, logo, and Spotify-entry HTML
growth. A smaller total artifact therefore coexists with larger generated CSS
and application JS.

## Package and feature-gate disposition

The normal TypeScript/React dependency rule requires **each** package addition
to reduce both maintained source and shipped artifact. This repository has an
explicit, user-authorized aggregate-attribution exception documented in
[`browser-platform-measurements.md`](browser-platform-measurements.md): the
following required, interdependent packages are measured only as the browser
platform replacement, not individually:

- `@tailwindcss/vite@4.3.2`
- `@vitejs/plugin-react@6.0.3`
- `eslint-plugin-react-hooks@7.1.1`
- `eslint-plugin-react-refresh@0.5.3`
- `globals@17.7.0`
- `tailwindcss@4.3.2`
- `typescript-eslint@8.63.0`
- `vite@8.1.4`

No package metadata changed after the pre-Initiative-3 baseline, and this is
**not individual-package compliance** for any member of that list.

| Gate                                     | Result                                                                                    | Evidence                                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized aggregate package exception   | **Authorized aggregate result only**                                                      | The pre-cutover focused framework/build/runtime source scope is 320,017 → 295,013 bytes (**−25,004; −7.81%**); the captured legacy static deployment comparator is 968,149 → 442,870 bytes (**−525,279; −54.26%**). |
| Individual package gate                  | **Not claimed**                                                                           | The authorized exception expressly does not attribute those aggregate reductions to any one package.                                                                                                                |
| Initiative 3 maintained-source condition | **Not met**                                                                               | Both current UI source measures increase: focused styling implementation is +20,436 bytes and maintained presentation source is +64,089 bytes.                                                                      |
| Initiative 3 shipped-artifact condition  | **Met**                                                                                   | Total fresh `dist` is −33,933 bytes.                                                                                                                                                                                |
| Initiative 3 `perf(ui)` gate             | **Not met; needs human steering if the plan's source-decrease criterion remains binding** | Slice 7 says to reject Tailwind integration if maintained replacement source **or** shipped artifact fails to decrease. The artifact decreases, but the measured maintained-source scopes do not.                   |

The aggregate package exception remains separate from the UI feature gate. It
permits the required package set's aggregate attribution; it does not turn the
current UI source growth into a passing source-size result.

`PRF-002`'s base64 fallback is removed, and the build comparison now exists,
but the affected application JS is **17,790 bytes larger**. The total artifact
decrease should not be presented as a local client-chunk improvement for that
ticket. `STY-001`'s Tailwind architecture/removal checks pass statically, but
that architectural result likewise does not satisfy the strict source-decrease
part of the Initiative 3 performance gate.

## Current source reconciliation

| Check                          | Result                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One authored CSS file          | `browser/globals.css` only (1,234 bytes). It contains only `@import \"tailwindcss\"`, the authorized bundled-Geist `@font-face`, and `@theme` tokens.                                                                                         |
| Hand-authored CSS restrictions | No selectors, `@apply`, custom `@keyframes`, `animation:`, or `transition:` declarations in authored CSS.                                                                                                                                     |
| Tailwind class restrictions    | The historical measurement found no `style` props, arbitrary values, template-literal class construction, or concatenated/partial classes. Dynamic status classes then came from fully enumerated `overlay-presentation.ts` mappings.         |
| Superseded CSS/components      | The six old CSS files, five old presentation components, and `public/fonts/GeistMonoVF.woff` are absent. `browser/main.tsx` imports `SpotifyNowPlayingOverlay`; active source has no path to the retired component directories.               |
| Remote font and base64 artwork | No `litmus.com/fonts`, `proxima_nova`, or `data:image…;base64` match in current active source or fresh text artifacts.                                                                                                                        |
| Timer/keyframe choreography    | No component `setTimeout`/`setInterval` calls and no authored-CSS keyframes. Worker scheduling timers remain in `browser/worker/entry.ts` and are not visual choreography.                                                                    |
| Starter/remnant assets         | No `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, or `window.svg` in source or fresh `dist`. `favicon.ico` remains an active asset linked by `spotify/index.html`, not a superseded path.                                                 |
| Visual SVG                     | One React `<svg>` root, `OverlayVisual.tsx`, with `viewBox=\"0 0 4725 1080\"`; the official logo is an external SVG asset rendered through `<image>`.                                                                                         |
| Artwork constraint             | `overlay-artwork-clip` is the one rounded clip applied to artwork, with radius `200 × 824 / 1080 = 152.59259259259258`; no `<mask>` element exists. Metadata/marquee has separate text viewport clip paths, which never crop or mask artwork. |
| Official logo                  | `public/spotify-full-logo-white.svg` is byte-for-byte equal to `Full_Logo_White_RGB.svg` in the recorded 2024 Spotify archive; SHA-256 `31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c` (4,519 bytes).                      |
| Geist Sans                     | `public/fonts/GeistVF.woff` SHA-256 `296fafafd41304f7c992079054b8af914dbbd865f32de97c66d0f613b55755d6` (66,268 bytes); its font family reports as `Geist`. No Geist Mono source or fresh-dist match remains.                                  |
| Reduced motion                 | Native `matchMedia(\"(prefers-reduced-motion: reduce)\")` drives an exhaustive motion decision. Reduced motion renders static marquee text and omits SVG `animateTransform`; no polyfill is introduced.                                       |

The historical measurement recorded the sole stylesheet exactly and asserted
the retired paths, remote-font/base64/Geist Mono absence, no component timers,
Tailwind class rules, and active overlay import.

## Fresh `dist` inventory and scan

| File                          | Role           |       Bytes | SHA-256                                                            |
| ----------------------------- | -------------- | ----------: | ------------------------------------------------------------------ |
| `assets/entry-CX6mw8nO.js`    | Worker JS      |      69,301 | `e92c17cbc3cdd316061cd81db07429784e0fd39911fd7b23c020646dd1a97c70` |
| `assets/spotify-6bo-kv_S.css` | Generated CSS  |      14,059 | `c96ee202b540be8624aee6d65e467b13e31d810316e8e455743501d4dbec8454` |
| `assets/spotify-B2Vn_P99.js`  | Application JS |     260,679 | `1af7d93840f1788b0a704c368d050e249374b9dfe8e91e1240ba07ef2254f05f` |
| `favicon.ico`                 | Asset          |      25,931 | `2b8ad2d33455a8f736fc3a8ebf8f0bdea8848ad4c0db48a2833bd0f9cd775932` |
| `fonts/GeistVF.woff`          | Geist Sans     |      66,268 | `296fafafd41304f7c992079054b8af914dbbd865f32de97c66d0f613b55755d6` |
| `index.html`                  | Root entry     |         844 | `188988628c626a90f7e311a194d2eda8589a9f3a60b53957b91da401b8cd733b` |
| `spotify/index.html`          | Spotify entry  |       1,269 | `06ed6e2fd2a07997f1b0314c11ca214916416b4de4d1f93d060a93cbc6553b24` |
| `spotify-full-logo-white.svg` | Official logo  |       4,519 | `31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c` |
| **Total**                     | **8 files**    | **442,870** |                                                                    |

Fresh text-output and filename scans found none of the following: Node/server
runtime markers; Next, Prisma, SQLite, Axios, or Chokidar remnants; retired UI
paths; source maps; service-worker markers; common polyfill/legacy-runtime
markers; remote-font/base64/Geist Mono markers; or embedded credential
material. The emitted application chunk contains `scrollLeft` only in React's
focus-restoration code; current source has no old `scrollLeft` CSS keyframe or
class marker. OAuth protocol field labels (`access_token`, `refresh_token`, and
`secret`) remain parser/request literals, not credential values.

## Limitations

- These are static source and production-build measurements. No live browser,
  OBS, assistive-technology, layout, animation, or visual-regression
  measurement was performed.
- Static scans cannot prove runtime artwork behavior, host-supplied
  `config.json`, browser storage, OAuth values received after authorization, or
  all visual/policy outcomes. Binary font/favicon files are inventoried and
  hashed, not text-scanned.
- Generated CSS growth can coexist with a smaller total artifact, as it does
  here; neither result proves a runtime rendering-performance outcome.
- The aggregate package artifact comparator uses the documented captured legacy
  static deployment set. It is valid only for the already-authorized aggregate
  exception and does not prove individual package effects or a complete legacy
  Next deployment size.
