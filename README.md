# Lumina — Tunnel Lighting Design & Optimization

Offline-first engineering workbench for **road, mining/underground and railway/metro tunnels**.
React 19 + TypeScript + Vite + Tailwind 4, **no runtime dependencies beyond React**, no server, no account, no AI/cloud service.
Persian (RTL) and English (LTR) UI; metric canonical storage with metric/imperial display.

## Deploy to Cloudflare Pages (zero-config)

The repo is wired for Cloudflare Pages out of the box — nothing to configure:

1. Push this repository to GitHub.
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** → pick the `lumina` repo.
3. Keep the defaults Cloudflare pre-fills from this repo:
   - **Framework preset:** Vite (or *None* — both work)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** managed automatically (`.nvmrc` / `.node-version` pin Node 22)
4. Click **Save and Deploy**. Every push to `main` now redeploys automatically.

Notes:
* The build produces a **single self-contained `dist/index.html`** (~460 kB, all JS/CSS inlined) plus `sw.js`, `manifest.webmanifest` and `icon.svg` — no server-side runtime, no environment variables needed.
* `base: "./"` in `vite.config.ts` makes every asset URL relative, so the site works on any Pages subdomain or custom domain, including project previews.
* `public/_headers` is copied into `dist/` automatically and applies sane security headers.
* `wrangler.jsonc` (assets-only Worker, SPA `not_found_handling`) is committed so `npx wrangler deploy` runs deterministically — no interactive setup step during the Cloudflare build.
* Alternatively, without Git: **Create → Pages → Upload assets** and drop the contents of `dist/` (from `npm run build`).

## Run / build / test
```bash
npm install
npm run dev                # dev server
npm run build              # → dist/index.html (single self-contained file, ~460 kB)
node tests/run.mjs         # 32 tests: bundles tests/*.test.ts(x) with esbuild, runs node:test
npx tsc --noEmit           # type check
```

## Audit of the original repository (Amirmpm/lumina, `web/`)
Verified by reading the code (cloned into /tmp; the workspace itself started as an empty template):
* Vanilla JS + Chart.js + three + jsPDF; **mining only**; no tests; no project persistence; no IES/LDT import.
* "Photometry" = cos^n lobe derived from a beam angle (`photometry.js`) — not real distributions.
* Coefficient of utilisation is an invented polynomial (`computeCU`); UGR is "calibrated to produce 14-28" (`helpers.js`).
* `MINING_STANDARDS` country tables have no sources/editions; `ex_rated` is a boolean on unverifiable catalogue entries.
* Two overlapping calculation paths (lumen method vs point-by-point) with different assumptions.

What was kept: the idea of per-luminaire catalogue, lifecycle-cost / NPV and cable sizing formulas (re-implemented and unit-tested),
maintenance-factor concept, and a **legacy luminaire importer** (`importLegacyLuminaires`) that deliberately drops `ex_rated` and marks photometry *approximate*.
What was removed and why: invented CU, calibrated UGR, unsourced country tables.

## Architecture (`src/`)
| Layer | Files | Notes |
|---|---|---|
| Domain | `domain/types.ts, fields.ts, project.ts` | One project model; field registry drives wizard, validation, provenance (default / estimate / user) |
| Geometry | `geometry/tunnel.ts` | **Single parametric model** → 3D, plan, section, calc grid, luminaire positions, DXF, OBJ |
| Photometry | `photometry/index.ts, parsers.ts, catalog.ts` | IES LM-63 (Type C) & EULUMDAT parsers, symmetry expansion, bilinear interpolation, flux integration |
| Calculation | `calc/engine.ts, economics.ts, evaluate.ts` | Pure deterministic functions; `evaluate()` is the *only* orchestration path |
| Standards | `standards/registry.ts, ex.ts` | Scope/edition/source/status per standard; honest verdicts; Ex data screen |
| Optimisation | `optimize/optimizer.ts` | Deterministic enumeration + search; hard constraints never relaxed |
| Persistence | `persistence/storage.ts, autosave.ts, package.ts` | IndexedDB (memory store for tests), debounced autosave, recovery draft, versions, packages, diff |
| Exports | `exports/files.ts, datasets.ts, report.ts` | CSV, ZIP, XLSX, DXF R12, OBJ, PDF — dependency-free writers |
| UI | `ui/*.tsx, i18n/` | Workbench shell, design system in `index.css` + `ui/kit.tsx` |

Coordinates: x along the tunnel axis, y across the floor (0 = left wall), z up. Photometry: γ from nadir, **C0 = +x (tunnel axis), C90 = +y**; luminaire *yaw* rotates the C frame (90° for luminaires whose C0 plane is transverse).

## Calculation methods actually implemented
* **Point-by-point direct illuminance**: `E = I(C,γ)·cosθ / d²` on a cell-centre grid over the calculation zone (road: lanes×lane-width centred; mining/rail: full floor or walkway strip), plus vertical illuminance on straight side walls (≤ 2 m).
* Maintained values `E_m = E · LLMF · LMF` (both editable, flagged as estimates by default).
* Metrics: Eavg, Emin, Emax, **U0 = Emin/Eavg**, **Ud = Emin/Emax**.
* **Lumen method** `E = N·Φ·UF·MF/A` as a cross-check/pre-sizing aid with an *editable UF estimate*; the PbP result does not use it.
* Energy, **lifecycle cost (NPV)** incl. replacement at rated life, indicative **single-phase voltage-drop / cable size**.
* Numerically validated: isotropic and Lambertian sources (closed-form flux/illuminance), cos-law, lumen-method values, NPV, unit conversions.

**Not implemented (and therefore never reported):** inter-reflection, luminance (road surface / wall), UGR/TI/glare, flicker, temperature derating of flux, tilted/asymmetric aiming, Type A/B photometry.

## Standards status (see `standards/registry.ts`)
| Standard | Status | What is evaluated |
|---|---|---|
| Project-defined criteria | supported | Eavg_m, Emin_m, U0 from user values (defaults are *placeholders*, labelled) |
| EN 13201-2:2015 P-classes | **partial** | Eavg/Emin of the chosen P-class (values transcribed — *verify against purchased edition*); not a tunnel standard; other criteria listed as unsupported |
| CIE 88:2004 | **unsupported** | Needs luminance; listed with all criteria "not evaluated" — can never pass |
| Mining regulations / Railway requirements | **unsupported** | No thresholds embedded (legacy unsourced table removed); use project-defined criteria |
Verdicts: `pass / fail / indeterminate / not evaluated`. Any unsupported criterion keeps the overall verdict **indeterminate**.

**Explosion protection (optional):** data model records hazard type, Zone, group, T-class, marking, scheme, certificate id, scope, limitations. The screen outputs only *not-required / no-data / incompatible / declared-compatible-needs-verification* — never "suitable".

## Optimisation
Enumerates luminaire × arrangement, finds the smallest per-row count meeting all supported criteria (exponential bracket + bisection on a 2× coarse grid; assumes illuminance grows with count), adds over-provisioned variants, re-evaluates all on the full grid, ranks feasible ones by weighted min–max-normalised objectives (LCC, energy, count, U0, maintenance). Hard constraints: criteria, mounting fit/overlap, Ex data, user caps. Optimal **only within this discrete space**. Runs on the UI thread in per-combination chunks (typically 3–5 s; > 10 km tunnels can take ~30 s).

## Project format (`schemaVersion = 1`)
`*.lumina.json`: `{format:'lumina-project', packageVersion, schemaVersion, checksum, project}`; project embeds inputs + provenance, **all luminaires with full photometric tables**, scenarios (layouts, result summaries with input hash), hazard requirement, optimisation settings. Review packages (`lumina-review`, `readOnly:true`) open in a locked mode; "Make editable copy" creates a new id. Backups (`lumina-backup`) restore as copies on id conflict. Newer schema versions are refused; migrations register in `MIGRATIONS` (none needed yet). Checksum is an integrity check (cyrb53), **not** tamper-proofing.
Stale results: every scenario stores `inputsHash`; any change to inputs, standard, hazard, layout or luminaire data invalidates the displayed result until recalculated.

## Offline behaviour
`dist/index.html` is a single file with no external requests (verified by scanning the bundle). Data live in IndexedDB; autosave 0.7 s after edits, a synchronous recovery draft in localStorage, auto-snapshots every 10 min (20 kept) plus manual versions with rollback and diff. `public/sw.js` + manifest add PWA install/offline caching when served over http(s).

## Exports
PDF report (pages rendered with canvas → JPEG → PDF, so Persian is shaped correctly; text is **not selectable**), XLSX (Inputs with units/provenance, Luminaires, Scenarios, Criteria, Layout, Grid), CSV bundle (zip), DXF R12 (layers TUNNEL_PLAN, CALC_ZONE, LUMINAIRES, TUNNEL_SECTION, LUMINAIRES_SECTION, DIMENSIONS, LABELS; metres; ASCII text only), OBJ (shell + luminaire boxes), project and review packages. Every export is re-parsed in the app before the success message is shown.

## Known limitations
* No headless browser was available when this was built: **no screenshots / real-browser visual QA, PWA install or offline test were run**. UI is covered by server-render smoke tests (all stages × EN/FA × 3 tunnel types) and canvas-call tests only.
* Luminaire records are per project (no shared cross-project library).
* PDF text is raster; DXF text is ASCII only; 3D is a software canvas renderer (no WebGL), flat shading.
* Photometry is evaluated with luminaires aimed at nadir; yaw is 0°/90° only.
* Persian terminology is a first pass and should be reviewed by a native lighting engineer.
