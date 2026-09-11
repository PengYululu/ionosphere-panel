# Ionosphere Parcel Tracing Panel

A standalone, offline-capable web page for exploring backward-traced GITM
parcel trajectories and their electron density profiles. Built to replicate
`plot_iono_along_trace_single()`, `plot_ne_profile_along_trace()`, and
`plot_ne_contour_along_trace()` from `GITM_trace_parcel.ipynb`, and (for
Step 2.2) `plot_iono_along_trace_with_background()` / `plot_background_and_ne_along_trace()`
from `GITM_tad_keogram.ipynb`, as an interactive browser tool instead of
static matplotlib figures.

This folder is self-contained: nothing in the main `Code/` project (notebooks,
`GITM_functions.py`, etc.) is required or modified to use it.

## Quick start

Open `index.html` directly in any browser (double-click it, or drag it into a
browser window). No build step, no server, no internet connection required —
everything needed is already in this folder.

If you prefer serving it (e.g. to test on another device on your network):

```bash
cd ionosphere_panel
python3 -m http.server 8743
# then visit http://localhost:8743
```

## What it shows

- **Step 0 — Solar wind IMF & geomagnetic time series**: IMF B<sub>z</sub>,
  B<sub>y</sub> (SWMF-ready input, GSM) and OMNI-observed dawn-dusk E-field /
  SYM-H, stacked as four line plots over a fixed window
  (2024-10-10 12:00 – 2024-10-11 06:00 UT) spanning the whole 2024-10-10
  storm. A dashed red vertical line tracks whichever snapshot the top
  time-bar is set to, moving live as the slider is dragged.
- **Step 1 — Parcel trajectory map**: all traced edge parcels at the 350 km
  reference altitude, plotted as lon/lat trajectories and colored by hmF2 or
  NmF2 at t0. Click parcel chips to bold-highlight one or more trajectories
  (green circle = trace start, magenta diamond = trace end).
- **Step 2 — Electron density profile**: for whichever parcel(s) you select
  (independently of Step 1's selection), n<sub>e</sub> vs. altitude for every
  traced time step, arranged left-to-right from t0 backward. When exactly one
  parcel is selected, dotted reference lines and labels show hmF2, and the
  |hmF2−bottom_height| / |top_height−hmF2| half-density-crossing distances.
- **Step 2.1 — Electron density time–height contour**: for whichever parcel(s)
  you select (its own independent selection, with a "Use Step 2 selection"
  shortcut), a stacked time–height color contour of n<sub>e</sub> per parcel —
  one full panel per selected parcel. Altitudes outside the
  [bottom_height, top_height] window are masked black, and a dotted line
  traces hmF2(t) across the panel. All panels share one fixed color scale
  (0–15 ×10¹¹ m⁻³, matching the notebook's `vmax=1.5e12` default).
- **Step 2.2 — Period check**: for each parcel selected in Step 2.1, at the
  currently selected UT snapshot, a two-panel row: **left** is that parcel's
  full trajectory (lon/lat, always colored by NmF2 — fixed, not the Step 1
  map variable selector — on the same 0–15 ×10¹¹ m⁻³ scale as the n<sub>e</sub>
  contour) drawn over a background field stitched along the trace
  (nearest-time, nearest-longitude latitude strip per traced step — a
  lon-lat "curtain"); **right** is that same background field sampled at the
  parcel's own position at each traced step (line plot), stacked directly
  above its n<sub>e</sub> time–height contour (identical to Step 2.1's,
  sharing the same time axis). A dropdown picks which background field to
  show: TEC, E-east, Rho, Vi-nw meridional, or Vi-nw zonal (see
  `background_data.js` below); "Range min"/"Range max" boxes let you
  override that field's color-scale range (defaults come from the data, per
  field, and persist independently per field — "Reset range" restores the
  default). Each field's colormap is fixed (jet for TEC/Rho, bwr for the
  signed E-east/Vi-nw fields) and is not user-editable. One row is drawn per
  parcel selected in Step 2.1 — this step has no selector of its own.
- **Step 3 — Selected parcel log**: a running table you build up by hand,
  organized by geographic region. Each row is one snapshot; the 6 data
  columns are 3 latitude bands (40–50°, 50–60°, 60–70°) × West/East of the
  Greenwich meridian — type whichever parcel index/indices belong in each
  region column that applies, then click "Add row" (blank columns are fine).
  **Click any row** to jump back to that snapshot, re-highlight the union of
  its logged parcels in Step 1's map, Step 2's profiles, and Step 2.1's
  contours all at once, *and* load its values back into the input boxes.
  From there you can edit the values and click "Update row" to save the
  change in place (no duplicate row), or "Cancel edit" to discard the edit.
  The table is saved in the browser automatically (see below) and can be
  exported as a CSV file.
- Covers **49 UT snapshots spanning two calendar days**: 2024-10-10 15:00
  through 23:45, then continuing into 2024-10-11 00:00 through 03:00. The
  time slider readout shows the date next to the clock time (e.g.
  "Oct 11 00:00") to make the day boundary obvious.
- Controls: a UT snapshot slider (49 options, spanning both days above),
  a hemisphere toggle (N/S), and a map color-variable selector (hmF2/NmF2).

## File-by-file

### `index.html`

Page skeleton only — no calculations happen here. Contains:
- All CSS (dark theme, layout, chip styling, sticky/fixed-axis layout for the
  Step 2 scroll area)
- The control bar markup (time slider, hemisphere toggle, variable select)
- Empty container elements (`#omniSvg`, `#mapSvg`, `#legendSvg`, `#mapChips`,
  `#profileChips`, `#profileAxis`, `#profileScroll` > `#profileTrack`,
  `#contourChips`, `#contourTrack`, `#contourLegendSvg`,
  `#periodCheckVarSelect`, `#periodCheckVarMin`, `#periodCheckVarMax`,
  `#periodCheckVarRangeReset`, `#periodCheckTrack`, `#periodCheckBgLegendSvg`,
  `#periodCheckNeLegendSvg`, `#logRegionInputs`, `#logTable` >
  `#logTableHeadRow` / `#logTableBody`) that `app.js` populates at runtime
- `<script>` tags loading `data.js`, then `omni_data.js`, then
  `background_data.js`, then `app.js`, in that order (`app.js` assumes
  `IONO_DATA`, `OMNI_DATA`, and (if present) `BACKGROUND_DATA` already exist
  as globals)

Edit this file for: colors/CSS, page text, control widget markup, layout.

### `app.js`

All plotting/rendering logic. Pure vanilla JS + SVG — no external libraries,
no build step. It performs **no scientific computation**; it only reads
already-computed numbers from `IONO_DATA` (defined in `data.js`) and
`OMNI_DATA` (defined in `omni_data.js`) and draws them. Key pieces, top to
bottom:

| Function | Purpose |
|---|---|
| `VAR_CONFIG` (line 13) | Defines the map's color-variable options: `hmF2` (200–500 km) and `NmF2` (0–15 ×10¹¹ m⁻³), including the display scale factor for each |
| `CONTOUR_CFG` (line 21) | Fixed color-scale config for the Step 2.1/2.2 n<sub>e</sub> contour (0–15 ×10¹¹ m⁻³, same convention as `NmF2` above — matches the notebook's `vmin=0, vmax=1.5e12`) |
| `TRAJ_CFG` (line 26) | Fixed color-scale config for Step 2.2's trajectory line — always NmF2, same 0–15 ×10¹¹ m⁻³ range as `CONTOUR_CFG` (not tied to Step 1's `varSelect`/`state.variable`), so one legend covers both the trajectory and the n<sub>e</sub> contour next to it |
| `BG` (line 32) | Decodes `BACKGROUND_DATA` (from `background_data.js`) once at startup: base64 → `Float32Array` per background variable, plus `lonDeg`/`latDeg`/`timesMs` grids. `null` if `background_data.js` wasn't loaded, in which case Step 2.2 shows a note instead of erroring |
| `state` (line 52) | Current UI state: selected snapshot index, hemisphere, color variable, three independent parcel-highlight sets (`mapHighlight`, `profileHighlight`, `contourHighlight`), `backgroundVar` (Step 2.2's selected field) and `backgroundRangeOverrides` (a `{varKey: {vmin,vmax}}` map of user-typed color-range overrides, one per background field, falling back to `BG`'s own default when absent), `logRows` (the Step 3 table's data), and `editingLogIdx` (which row, if any, is currently loaded into the input boxes for editing) |
| `LOG_REGIONS` (line 69) | The Step 3 table's 6 region columns (id + header label): 3 latitude bands × West/East. Change this array to rename, add, or remove region columns — the input row, table header, and CSV export are all generated from it |
| `LOG_STORAGE_KEY` (line 78) | The `localStorage` key the Step 3 log table is saved under (bumped to `.v2` when the row shape changed from free-text to per-region) |
| `jetColor(t)` (line 90) | Hand-rolled "jet"-style colormap, maps a normalized value in [0,1] to an RGB string |
| `bwrColor(t)` / `colorForValue(v, cfg)` (lines 99, 111) | `bwrColor` is a diverging blue-white-red colormap (t in [-1,1]); `colorForValue` picks jet or bwr based on `cfg.cmap` (used for Step 2.2's background fields, which can be signed) and falls back to jet everywhere else |
| `paletteColor(idx)` (line 120) | Assigns each parcel index a distinct hue (golden-angle rotation) so the same parcel index has a consistent color across all panels |
| `linScale(domain, range)` (line 125) | Generic linear scale helper (like a minimal D3 `scaleLinear`) |
| `niceStep(rawStep)` / `niceTicks(vmin, vmax, targetCount)` (lines 132, 146) | Rounds axis tick spacing to "nice" 1/2/5/10×10ⁿ values (D3/matplotlib-style tick picking), so axes show round numbers instead of arbitrary decimals |
| `ticksAtStep(vmin, vmax, step)` (line 161) | Ticks at an *exact* fixed step (e.g. always every 10°) — used for the map's lat/lon grid, where "nice" auto-spacing wasn't precise enough |
| `renderChipRow(...)` (line 208) | Builds the clickable parcel-index chip lists used by the Step 1, Step 2, and Step 2.1 selectors |
| `snapTimeMs(snap)` (line 235) | Parses a snapshot's `"MMDD_HHMM"` tag into a UTC epoch ms value (year hardcoded 2024, see `extract_data.py`), so it can be compared against `OMNI_DATA`'s own epoch ms timestamps |
| `stepTimeMs(snap, s)` (line 247) | Like `snapTimeMs`, but for one traced step `s` (from `snap.timeLabels[s]`, handling the `"MM/DD HH:MM"` day-crossing format too) — used by Step 2.2 to match each traced step against `BACKGROUND_DATA`'s own timestamps |
| `nearestTimeIdx` / `nearestLonIdx` / `nearestLatIdx` (line 266 onward) | Nearest-neighbor lookups into `BG.timesMs` / `BG.lonDeg` / `BG.latDeg` (longitude match is circular, handling the 0/360 wrap) — the JS equivalent of the notebook's `np.argmin(np.abs(...))` matching |
| `stitchBackgroundAlongTrajectory(...)` / `sampleBackgroundAlongTrajectory(...)` (lines 299, 314) | Direct ports of the notebook's `stitch_tec_background_along_trajectory()` / `sample_tec_percent_along_trajectory()`: the former returns a full latitude strip per traced step (for Step 2.2's left-panel curtain), the latter a single point value per step (for its right-panel line plot) |
| `midpointEdges(arr)` (line 329) | Reconstructs cell edges from an array of (possibly non-monotonic) sample midpoints — same algebra as `altEdgesFromMid` below, reused for Step 2.2's irregular trajectory-longitude curtain columns |
| `timeTicks(tMin, tMax, stepHours)` / `fmtTimeTick(ms)` (lines 341, ~349) | Round-hour x-axis ticks for Step 0 (aligned to UTC epoch boundaries) and their `"MM/DD HH:MM"` label formatting |
| `OMNI_ROWS` (line 358) | The 4 Step 0 rows (IMF Bz, IMF By, E-field, SYM-H), each pointing at the matching `OMNI_DATA.imf`/`OMNI_DATA.omni` arrays — add a row here (plus a field in `extract_omni_data.py`'s payload) to plot another OMNI/IMF quantity |
| `renderOmni()` (line 365) | Draws Step 0: one row per `OMNI_ROWS` entry (own y-scale/ticks per row, shared x/time scale), a dashed zero line, and the dashed red vertical line at the current snapshot's time (from `snapTimeMs`) drawn on top across all rows |
| `renderMap()` (line 480) | Draws Step 1: masks parcels by hemisphere, draws the fixed 150–350°E / 10°-resolution lat/lon grid (see "Known quirks" below), per-segment colored trajectory lines, and highlights selected parcels |
| `renderLegend(cfg)` / `drawColorLegend(svgEl, cfg, gradId)` (lines 628, 634) | Draws a vertical color-scale bar (jet or bwr, from `cfg.cmap`); `drawColorLegend` is the shared implementation used by the map's legend, the Step 2.1 contour's legend, and both of Step 2.2's legends |
| `renderProfiles()` (line 670) | Draws Step 2: the fixed altitude axis (`#profileAxis`, stays visible while the track scrolls) plus one small SVG panel per traced time step, each showing log(n<sub>e</sub>) vs. altitude for the selected parcel(s), with optional hmF2/top/bottom boundary lines + value labels when a single parcel is selected |
| `altEdgesFromMid(altArr)` (line 800) | Reconstructs cell edges from the altitude midpoint array (e.g. `[100,200,300]` → `[50,150,250,350]`), needed so the n<sub>e</sub> contour's cells align correctly with `altMidKm` |
| `computeContourLayout(snap)` / `buildContourSvg(snap, k, layout)` (lines 812, 833) | Split out of `renderContours()` so the same n<sub>e</sub> time–height contour drawing (scales computed once per snapshot via `computeContourLayout`, one parcel's SVG via `buildContourSvg`) can be reused by both Step 2.1 and Step 2.2's bottom-right panel |
| `renderContours()` (line 915) | Draws Step 2.1: one stacked time–height contour panel per selected parcel (via `buildContourSvg`), each a grid of colored `<rect>` cells (masked black outside the top/bottom-height window) plus a dotted hmF2(t) overlay line |
| `trajArraysFor(snap, k)` (line 947) | One parcel's full `lon`/`lat`/per-step epoch-ms trajectory arrays, shared by Step 2.2's map and line panel |
| `buildPeriodCheckMap(snap, k, bgVar)` (line 965) | Step 2.2's left panel: a lon-lat map for one parcel, with `bgVar` (the effective background config — see `renderPeriodCheck`) stitched along its trajectory as a curtain (`stitchBackgroundAlongTrajectory` + `midpointEdges` for irregular cell columns) and the trajectory itself drawn on top, always colored by NmF2 per `TRAJ_CFG` — a JS port of `plot_iono_along_trace_with_background()` |
| `buildPeriodCheckLinePanel(snap, k, layout, bgVar)` (line 1078) | Step 2.2's right panel, top half: the background field sampled at the parcel's own position per traced step (`sampleBackgroundAlongTrajectory`), with dashed gridlines. The y-axis uses `bgVar.vmin`/`bgVar.vmax` — the same range as the left panel's color legend (the extraction script's default, or the user's "Range min"/"Range max" override) — so narrowing that range to see wiggles more clearly (or widening it for context) updates both panels together. Shares `layout`'s x-axis pixel positions with `buildContourSvg` so it lines up with the contour drawn directly below it — together a JS port of `plot_background_and_ne_along_trace()` |
| `renderPeriodCheck()` (line 1137) | Draws Step 2.2: computes the effective background range (`state.backgroundRangeOverrides[state.backgroundVar]` if set, else `BG`'s own default), syncs the "Range min"/"Range max" inputs to it, then draws one row (left map + right line/contour) per parcel selected in Step 2.1's `contourHighlight`, at the current snapshot; shows a note instead if no parcels are selected or `background_data.js` didn't load |
| `buildLogInputs()` / `buildLogTableHead()` (lines 1204, ~1226) | Generate the Step 3 input row and table header from `LOG_REGIONS`, once at startup |
| `loadLog()` / `saveLog()` (lines 1239, ~1251) | Read/write the Step 3 log table to the browser's `localStorage`, so it survives page reloads without any server |
| `renderLogTable()` (line 1260) | Redraws the Step 3 `<table>` rows from `state.logRows`, highlighting whichever row matches `state.editingLogIdx`. Each row gets a click handler (`jumpToLogRow`) and its own "Remove" button (which stops the click from also bubbling into the row handler, and exits edit mode if the removed row was the one being edited) |
| `parseParcelList(text)` (line 1307) | Parses a region cell's text ("0, 5, 12") into a set of integer parcel indices |
| `clearLogInputs()` / `exitLogEditMode()` (lines 1317, ~1323) | Clear the 6 region inputs; `exitLogEditMode` additionally resets `state.editingLogIdx` to `null` and restores the "Add row" button/UI to its non-editing state |
| `jumpToLogRow(row, idx)` (line 1335) | Clicking a Step 3 row calls this: jumps to that row's snapshot, sets `mapHighlight`/`profileHighlight`/`contourHighlight` to the union of parcels across all 6 regions, **and** loads those same region values back into the input boxes with `state.editingLogIdx = idx`, switching the "Add row" button to "Update row" |
| `csvField(value)` / `downloadLogCsv()` (lines 1364, 1370) | Build a CSV string from the logged rows and trigger a browser file download (via a temporary `Blob` + `<a download>` link — no server involved) |
| `refreshMapChips()` / `refreshProfileChips()` / `refreshContourChips()` (line 1391 onward) | Rebuild the chip lists whenever the snapshot, hemisphere, or selection changes (`refreshContourChips` also re-renders Step 2.2, since it shares `contourHighlight`) |
| `renderEverything()` (line 1421) | Top-level re-render (calls `renderOmni()`, ..., `renderContours()`, `renderPeriodCheck()`), called by every control's event listener (including `jumpToLogRow`); note `varSelect`'s own listener does *not* call this, since Step 1's map variable no longer affects Step 2.2 |
| `addLogRowFromInput()` (line 1516) | Reads all 6 Step 3 region inputs; if `state.editingLogIdx` is set, overwrites that row in place, otherwise appends a new row — this is the "update vs. duplicate" logic. Either way it saves, exits edit mode, and re-renders the table |

Edit this file for: anything visual about the plots — colors, axis behavior,
highlight styling, profile/contour layout, adding a new map variable (also
requires a matching field in `data.js`, see below) or a new Step 0 time
series row (requires a matching field in `omni_data.js`).

### `data.js`

Not hand-written — generated by `extract_data.py` (see below). Defines one
global:

```js
const IONO_DATA = { snapshots: [ {...}, {...}, ... ] };  // 49 entries
```

Each snapshot object corresponds to one UT trace (e.g. `1010_1800`) and has:

| Field | Shape | Meaning |
|---|---|---|
| `tag` | string | e.g. `"1010_1800"` — source file prefix (`MMDD_HHMM`) |
| `label` | string | `"HH:MM"` — the stable matching key used everywhere (Step 3's `jumpToLogRow`, etc.). Never has a date prefix, since the two days' clock times don't overlap (day 1 is 15:00–23:45, day 2 is 00:00–03:00), so it stays unambiguous without one |
| `dateLabel` | string | `"Oct 10"` / `"Oct 11"` — display-only, shown next to `label` in the UI so it's visually clear which calendar day a snapshot belongs to |
| `nParcels`, `nSteps` | int | number of traced edge parcels / trace steps (usually 25) |
| `altMidKm` | `[nAltDS]` | altitude midpoint grid (km), downsampled 2× from the original 53 levels |
| `timeLabels` | `[nSteps]` | `"HH:MM"` per traced step, t0 first, going backward — except steps that land on a *different* calendar day than the snapshot's own t0 (a handful of early-morning day-2 snapshots trace back across midnight), which get a `"MM/DD HH:MM"` label instead so they aren't mistaken for the wrong day |
| `lon`, `lat` | `[nSteps][nParcels]` | parcel position at the 350 km reference altitude |
| `hmF2`, `NmF2` | `[nSteps][nParcels]` | peak height (km) / peak density (m⁻³) per step per parcel |
| `topHeight`, `bottomHeight` | `[nSteps][nParcels]` | half-NmF2 crossing altitudes (km), may contain `null` |
| `neProfile` | `[nSteps][nAltDS][nParcels]` | electron density (m⁻³) vs. altitude, per step per parcel |

All numeric values are rounded to ~3–4 significant figures and the altitude
axis is downsampled 2× — this is purely to keep the file size manageable
(~9 MB) for a browser to load; see `extract_data.py` for the exact rounding.

**This file has no runtime dependency on Python, the notebook, or the `.npy`
files** — it's a frozen snapshot. Deleting the original `.npy` files or the
notebook's functions has zero effect on the website as it currently stands.

### `extract_data.py`

The one-time (or rerun-as-needed) bridge between the real model output and
the browser. Run with:

```bash
/opt/homebrew/bin/python3.12 extract_data.py
```

(Needs a Python with `numpy`; the repo's Jupyter kernel's Python, resolved to
`/opt/homebrew/bin/python3.12` on this machine, already has it. The system
`python3`/`python3.13` do not.)

What it does, per UT snapshot (49 total, discovered by globbing both
`1010_*_edge_trace_all.npy` and `1011_*_edge_trace_all.npy`):

1. Reads `SRC_DIR + '{tag}_edge_trace_all.npy'` — the parcel trajectories,
   shape `(n_alt=54, n_steps+1, 3, n_parcels)` where the last axis is
   `[lon, lat, height]`
2. Reads `SRC_DIR + '{tag}_edge_ion_v3.npy'` — a dict with `hmF2`, `NmF2`,
   `ne_profile`, `top_height`, `bottom_height`, `times` (already computed by
   the notebook's `get_ionosphere_along_trace()` / `add_half_nmf2_heights()`
   — **this script does not recompute any ionospheric physics**)
3. Derives the altitude axis directly from the trajectory's own height field
   (`traj[:,0,2,0]`) rather than re-reading a GITM binary file — this was a
   deliberate shortcut since the height at each of the 54 model levels is
   already embedded in the trace data
4. Finds the altitude index closest to 350 km (`TARGET_ALT_KM`) to know which
   slice of the trajectory to use for the map's lon/lat
5. Builds each traced step's display label — plain `"HH:MM"`, except steps
   whose calendar date differs from the snapshot's own t0 (early-morning
   day-2 snapshots whose backward trace crosses back past midnight into
   day 1), which get a `"MM/DD HH:MM"` label instead, plus a per-snapshot
   `dateLabel` (`"Oct 10"`/`"Oct 11"`) for the UI's date badge
6. Downsamples the altitude dimension of `ne_profile` by 2× and rounds all
   arrays to a handful of significant figures (`sigfig()`, `round_arr()`) to
   shrink the output file
7. Writes everything as one `const IONO_DATA = {...};` statement to `data.js`

`SRC_DIR` points at `/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/
GITM_gradient/backward_traced_hmf2/` — an external drive. You only need this
script (and that drive mounted) if you want to **regenerate** `data.js` with
different snapshots, a different trace direction (forward vs. backward), or
additional fields (e.g. Te/Ti, which exist in the source `.npy` files but
aren't currently extracted).

### `background_data.js`

Not hand-written — generated by `extract_background_data.py` (see below).
Defines one global:

```js
const BACKGROUND_DATA = {
  nTime: 177, nLon: 90, nLat: 90,      // native 5-min cadence, windowed+downsampled grid (see below)
  lonDeg: [...], latDeg: [...],        // degrees
  timesMs: [...],                      // epoch ms, one per time step
  vars: {
    TEC:      { label, cmap, vmin, vmax, scale, dataB64 },
    Eeast:    { label, cmap, vmin, vmax, scale, dataB64 },
    Rho:      { label, cmap, vmin, vmax, scale, dataB64 },
    ViNWMeri: { label, cmap, vmin, vmax, scale, dataB64 },
    ViNWZonal:{ label, cmap, vmin, vmax, scale, dataB64 },
  },
};
```

Each variable's `dataB64` is a base64-encoded `Float32Array`, row-major
`[time][lon][lat]` (`nTime × nLon × nLat` values) — `app.js` decodes all five
once at startup (see `BG` in the function table above) into real
`Float32Array`s for the nearest-neighbor lookups Step 2.2 needs. `cmap` is
`'jet'` or `'bwr'` (diverging, for the signed fields), and `scale` matches
the same display-scale convention as `VAR_CONFIG`/`CONTOUR_CFG` elsewhere
(e.g. Rho is stored in kg/m³ but displayed ×10⁻¹¹).

Like `data.js`, this is a frozen, downsampled snapshot — Step 2.2 has no
runtime dependency on the source `.npy` files, the external drive, or
Python.

### `extract_background_data.py`

The Step 2.2 equivalent of `extract_data.py`. Run with:

```bash
/opt/homebrew/bin/python3.12 extract_background_data.py
```

Reads the 5 precomputed global background fields directly (does **not**
recompute TEC/E-east/Rho/Vi-nw from raw GITM output — those are loaded as-is
from the `.npy` files below):

```
/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/tecall_lon_576.npy
/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/Eeastall_lon_576.npy
/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/rhoall_lon_576.npy
/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/vinwmeri_lon_576.npy
/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/vinwzonal_lon_576.npy
```

Each is shape `(576, 180, 90)` = `(time, lon, lat)`. None of these files has
a saved companion `lon`/`lat`/timestamp array anywhere in the codebase, so
the script reconstructs all three from first principles (see the script's
own module docstring for the full reasoning and the `ls`-count verification
behind it):

1. `lon`: 180 points at 2° spacing, `[1, 3, ..., 359]`, and `lat`: 90 points
   at 2° spacing, `[-89, -87, ..., 89]` — confirmed by running
   `GITM_functions.load_gitm()` once against a raw `3DALL_*.bin` file
   (needs the `spacepy` Python at `/Users/yulupeng/anaconda3/bin/python3`,
   only for that one verification call, not for this script itself).
2. `timesall`: the generating notebook cell built its file list as
   `glob('3DALL_t241010*.bin') + glob('3DALL_t241011*.bin')` (each sorted),
   i.e. exactly all of 2024-10-10 (288 files, 5-min cadence) followed by all
   of 2024-10-11 (288 files) — verified by `ls` counts on the source drive
   (288 + 288 = 576, matching the arrays' first dimension exactly). Since
   day 2 starts exactly 5 minutes after day 1 ends, the whole 576-step axis
   is one uniform 5-minute series starting 2024-10-10 00:00:00 UT.
   **`T0`/`WINDOW_START`/`WINDOW_END` must stay timezone-aware (UTC)** — an
   earlier version used naive `datetime`s, and Python silently interprets a
   naive datetime's `.timestamp()` as local time, which shifted every
   `background_data.js` timestamp by this machine's UTC offset (4h, EDT)
   relative to `app.js`'s `Date.UTC()`-based times, so Step 2.2 matched the
   wrong background time slice by 4 hours. Fixed, but worth remembering if
   this script is ever edited again.
3. Slices that axis down to a tight window covering every traced step's
   *actual* time across all 49 snapshots (2024-10-10 13:00 – 2024-10-11
   03:00 UT, verified directly against `data.js`'s own `timeLabels`) plus a
   20-min margin either side, then downsamples 2× in longitude (4°
   resolution); latitude is kept at full 2° resolution since it's Step
   2.2's plotted vertical axis. **Time is kept at native 5-min cadence
   (`TIME_STEP = 1`)** — a 10-min downsample was tried first and aliased
   the short-period (TAD-scale) wiggles this whole step exists to show into
   a visibly different, smoother curve that no longer matched the reference
   notebook plots; the tightened time window (down from a much wider
   Step-0-sized margin) is what keeps the file size reasonable at full
   cadence instead.
4. Casts each variable to `float32` and base64-encodes the raw bytes,
   writing everything as one `const BACKGROUND_DATA = {...};` statement to
   `background_data.js` (~36 MB — each variable's raw grid over the full
   576-step/180-lon/90-lat array would be ~75 MB, so the tightened window +
   longitude downsampling is what keeps the file a reasonable size to
   commit at full time resolution).

Color-scale defaults (`vmin`/`vmax`/`cmap` per variable) were chosen from
the actual data's min/max/2nd-98th-percentile range over the extracted
window (printed by the script) — edit the `VARS` dict at the top of the
script and rerun to change them, or to extend/shrink the time window or
downsampling factors (`WINDOW_START`/`WINDOW_END`/`TIME_STEP`/`LON_STEP`).

### `omni_data.js`

Not hand-written — generated by `extract_omni_data.py`. Defines one global:

```js
const OMNI_DATA = {
  imf:  { times: [...epoch_ms], bz: [...nT], by: [...nT] },
  omni: { times: [...epoch_ms], efield: [...mV/m], symH: [...nT] },
};
```

`times` are UTC epoch milliseconds (numbers), so Step 0 can plot them
directly against JS `Date` objects without any timezone parsing. Covers a
fixed window, 2024-10-10 12:00 – 2024-10-11 06:00 UT (padded a few hours
around the 49 traced snapshots' own 15:00–03:00 range). Like `data.js`, this
is a frozen snapshot with no runtime dependency on the source `.dat`/`.txt`
files or Python.

### `extract_omni_data.py` / `imf20241009_12.dat` / `omni_20241009_12.txt`

The Step 0 equivalent of `extract_data.py` / the `.npy` files above. The two
data files are local copies of the SWMF input set for this same 2024-10-10
GITM run (originally at `/Users/yulupeng/Documents/AAA_research/Results/
2024_1010_storm/20241010_inputs/`), copied into this folder so the panel
(and its GitHub repo) doesn't depend on that external path:

- `imf20241009_12.dat` — SWMF-ready solar wind/IMF input (GSM), same format
  read by `read_swmf_file()` in `../swmf_omni_functions.py`. Step 0 uses its
  `bz`/`by` columns.
- `omni_20241009_12.txt` — raw OMNIWeb high-resolution listing (same format
  read by `read_omni_file()`), used for the *observed* E-field and SYM/H
  columns (`efield`/`symH`) — these aren't in the SWMF input file, since
  SYM-H is a geomagnetic response index, not a solar wind driver.

`extract_omni_data.py` reimplements just enough of `read_swmf_file()`/
`read_omni_file()`'s parsing to read those two local files directly (kept
self-contained rather than importing `../swmf_omni_functions.py`, consistent
with this folder's "no dependency on the main `Code/` project" design), slices
both to the fixed Step 0 window, and writes `omni_data.js`. Run with:

```bash
python3 extract_omni_data.py
```

Rerun this (after re-copying fresh `.dat`/`.txt` files, if needed) to change
the Step 0 time window or add more OMNI/IMF fields (e.g. Bz, solar wind
speed/density) — see `WINDOW_START`/`WINDOW_END` and the `payload` dict at
the bottom of `main()`.

## Step 3's log table: how "saving" works without a server

Step 3 is the one part of this page that *isn't* read-only precomputed data —
it's something you build up by clicking around. Since there's no server (see
"Extending this" below for what that would take), "saving" means the
browser's built-in `localStorage`: every time you add or remove a row, the
whole table is written to `localStorage` under the key
`ionospherePanel.parcelLog.v2` (`loadLog()`/`saveLog()` in `app.js`). When you
reopen `index.html` later, it reads that key back and restores the table.

Each row is stored as `{ time: "18:00", regions: { w1: "0, 4", w2: "", ... } }`
— one free-text string per `LOG_REGIONS` entry (see the function table above).
The region values are typed in by hand; the app doesn't inspect each parcel's
actual lat/lon to decide which column it belongs in, so it's on you to look
at the Step 1 map and put each parcel's index in the column you judge it
belongs to.

A few things worth knowing about this:
- **It's saved per-browser, not per-file.** The log lives in whichever
  browser you were using, tied to this exact file path/origin — opening the
  same `index.html` in a different browser (or moving the folder to a new
  location, in some browsers) won't carry the log over. Use "Download CSV"
  to get a portable copy.
- **It's local to your machine.** Nothing is uploaded anywhere; there's no
  network request involved in saving.
- **Clearing browser data/cache can erase it.** It's convenient, not
  archival — download a CSV for anything you want to keep long-term.

### Editing an existing row instead of duplicating it

Clicking a row doesn't just jump to its snapshot — it also copies that row's
6 region values back into the input boxes and puts the page into an
"editing" state (an "Editing existing row" badge appears, and the "Add row"
button relabels itself "Update row"). From there:
- Change whichever region boxes you want, then click **Update row** to
  overwrite that exact row (no duplicate gets added).
- Click **Cancel edit** to leave the row untouched and go back to adding a
  fresh row.
- Manually moving the time slider also exits edit mode automatically (since
  "Update row" wouldn't clearly apply to a different snapshot anymore).
- Removing the row currently being edited (via its "Remove" button) also
  exits edit mode, so you don't end up updating a row that no longer exists.

## Data provenance (why the split exists)

```
GITM_trace_parcel.ipynb                 (historical — not part of this folder)
  back_trace_v2() / forward_trace_v2()  → advects parcels through GITM winds
  get_ionosphere_along_trace()          → computes hmF2 / NmF2 / ne_profile
  add_half_nmf2_heights()               → computes top_height / bottom_height
        ↓ (np.save)
.npy files on /Volumes/ExtremePro/.../backward_traced_hmf2/
        ↓ (read + reformat + round, extract_data.py)
ionosphere_panel/data.js                (static, frozen snapshot)
        ↓ (read + draw, app.js)
Your browser
```

Only the top of this chain does real ionospheric physics. Everything below
`data.js` is pure presentation. Step 2.2's background fields follow the same
pattern, from a separate (unrelated) precomputed source instead:

```
GITM_tad_keogram.ipynb                  (historical — not part of this folder)
  load_gitm() looped over 3DALL_*.bin  → per-timestep TEC / E-east / Rho / Vi-nw fields
        ↓ (np.save)
tecall_lon_576.npy, Eeastall_lon_576.npy, rhoall_lon_576.npy,
vinwmeri_lon_576.npy, vinwzonal_lon_576.npy
  on /Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/
        ↓ (read + window + downsample + base64, extract_background_data.py)
ionosphere_panel/background_data.js     (static, frozen snapshot)
        ↓ (decode + nearest-neighbor match + draw, app.js)
Your browser
```

## Known quirks / deliberate simplifications

- **Only backward-traced GITM data is included** — there's no SAMI3
  equivalent for this parcel-tracing analysis, and forward-traced data
  (`forward_traced_hmf2/`) was left out for simplicity (per earlier design
  decision).
- **Day 2 (2024-10-11) only goes up to 03:00, not through the whole day.**
  The raw GITM model output on the external drive actually runs through all
  of 10/11 (23:55), but the *parcel-tracing pipeline itself* — `back_trace_v2`
  advecting parcels through the wind field, then `get_ionosphere_along_trace`
  / `add_half_nmf2_heights` building the density profiles — has only been run
  for 10/11 00:00 through 03:00 so far, producing the `.npy` files this page
  reads. Extending further (03:15 through end of day) needs someone to
  actually run that pipeline for those additional times — a real computation
  step (reads GITM binaries via `spacepy`, does wind-field interpolation and
  numerical integration), not just a config change to `extract_data.py`.
- **Map longitude is a fixed [150°, 350°] window**, matching the original
  notebook's `ax.set_xlim(150, 350)` exactly. A few parcels' backward traces
  have runaway/unwrapped longitude (one hit ≈ −1600°) that would blow up an
  auto-scaled axis; those out-of-window trace points are simply clipped from
  view (via an SVG `clipPath`) rather than allowed to stretch the domain.
  (An earlier version of this page auto-sized the window from each parcel's
  anchor position instead of using a fixed range — replaced because a fixed,
  consistent window is easier to compare across snapshots.)
- **The Step 2 altitude axis is a separate fixed SVG (`#profileAxis`)**,
  not a CSS `position: sticky` element. Sticky was tried first but behaved
  inconsistently in testing (partial offset at large scroll distances); a
  dedicated non-scrolling element is more robust across browsers.
- **Axis ticks use a "nice numbers" rounding algorithm** (`niceStep`/
  `niceTicks` in `app.js`), so labels land on clean 5/10/50/100-style values
  rather than arbitrary evenly-spaced decimals.
- **Boundary annotations (hmF2 value, Δtop, Δbottom) only render when exactly
  one parcel is selected** in Step 2, to avoid visual clutter when comparing
  multiple parcels' profiles.
- **Step 2.1's contour panels stack vertically (one per selected parcel)**
  rather than side-by-side, since each panel already needs its own full
  width to show all 25 traced time steps legibly. This differs from Step 2,
  where multiple parcels are overlaid as colored lines within the same
  panels.
- **Cells with no data (`null` in `neProfile`) are rendered the same as
  masked cells (black)** in the contour, rather than left transparent —
  this is a simplification vs. the notebook's `numpy.ma` masking, which
  would leave NaN cells blank instead of black. In practice this rarely
  matters since missing values are uncommon in the source data.
- **Step 2.2's background fields keep native 5-min time resolution, but are
  downsampled 2× in longitude** (4° instead of 2°; latitude stays
  full-resolution) and windowed tightly to just the times actually needed,
  to keep `background_data.js` a reasonable size — see
  `extract_background_data.py` above. (An earlier version also downsampled
  time to 10-min cadence; that aliased the short-period wiggles this step
  exists to show, so time resolution was restored to native and the window
  tightened instead.) This means its nearest-neighbor longitude match can
  be off by up to ±2° from what the original Python functions (run against
  the full-resolution arrays) would pick.
- **Step 2.2 reuses Step 2.1's parcel selection** (`contourHighlight`)
  rather than having its own chip row — the "Period check" panel always
  shows one row per parcel currently selected in Step 2.1, at whichever
  snapshot the top time-bar is on.
- **Step 2.2's left-panel curtain columns are spaced by the parcel's own
  (possibly non-monotonic, occasionally runaway) trajectory longitude**,
  the same as the source notebook's `pcolormesh(shading='nearest')` — a
  parcel with unwrapped/runaway longitude (see the map quirk above) can
  produce a visually distorted column near that point, clipped the same
  way the trajectory line itself is.

## Extending this

| Want to... | Do this |
|---|---|
| Change plot colors, styling, layout | Edit `app.js` (see function table above) or CSS in `index.html` |
| Add a new map color variable (e.g. Te/Ti) | Add the field in `extract_data.py`'s `snap = {...}` dict, rerun it, then add an entry to `VAR_CONFIG` in `app.js` |
| Change the contour's fixed color scale | Edit `CONTOUR_CFG` in `app.js` (`vmin`/`vmax`/`scale` are in the same convention as `VAR_CONFIG`) |
| Include more/fewer UT snapshots (from already-precomputed `.npy` files) | Adjust the glob/filter in `extract_data.py`'s `main()` and rerun |
| Extend day 2 past 03:00 (needs new computation, not just more file-reading) | Run the notebook's `back_trace_v2()` → `get_ionosphere_along_trace()` → `add_half_nmf2_heights()` pipeline for 2024-10-11 03:15 onward to produce new `*_edge_trace_all.npy` / `*_edge_ion_v3.npy` files, then rerun `extract_data.py` — the glob pattern already covers any `1011_*` files that show up |
| Add forward-traced data or a direction toggle | Point a second run of `extract_data.py` at `forward_traced_hmf2/`, merge into `data.js` under a new key, and add a toggle control in `index.html` + `app.js` |
| Restore full altitude resolution (undo the 2× downsample) | Remove the `[:, ::2, :]` slicing in `extract_data.py` (roughly doubles `data.js`'s size) |
| Change the map's fixed longitude window (currently 150–350°) | Edit the `lonMin`/`lonMax` constants at the top of `renderMap()` in `app.js` |
| Rename/add/remove a Step 3 region column | Edit the `LOG_REGIONS` array in `app.js` — the input row, table header, and CSV header are all generated from it automatically. (Bump `LOG_STORAGE_KEY` to a new version suffix too, since old saved rows won't have the new region's key) |
| Have the app auto-classify parcels into region columns from their real lat/lon, instead of typing them in by hand | Not implemented — would mean reading each selected parcel's `lon`/`lat` from `data.js` at the snapshot's t0 step, classifying by latitude band and East/West of 0°, and pre-filling the matching input. Ask if you want this added |
| Change how/where the log is saved (e.g. save to a file instead of `localStorage`) | This needs a running backend server, not just an `app.js` change — see the "kitchen behind the website" conversation about that trade-off before starting |
| Add another Step 0 row (e.g. Bz, solar wind speed/density) | Add the field to the `payload` dict in `extract_omni_data.py`'s `main()`, rerun it, then add a matching entry to `OMNI_ROWS` in `app.js` |
| Change the Step 0 time window (currently 2024-10-10 12:00 – 2024-10-11 06:00 UT) | Edit `WINDOW_START`/`WINDOW_END` in `extract_omni_data.py` and rerun it |
| Add another Step 2.2 background variable | Add a `np.load(...)` entry to `VARS` in `extract_background_data.py` and rerun it, then add a matching `<option>` to `#periodCheckVarSelect` in `index.html` (the `value` must match the `VARS` key) |
| Change a Step 2.2 background field's color *range* just for this session | Use the "Range min"/"Range max" boxes next to the background-variable dropdown in the page itself — no edit needed. "Reset range" restores the default |
| Change a Step 2.2 background field's *default* range, or its colormap (currently fixed: jet for TEC/Rho, bwr for E-east/Vi-nw) | Edit that entry's `cmap`/`vmin`/`vmax` in `VARS` in `extract_background_data.py` and rerun — printed min/max/2nd-98th-percentile stats can guide the new range |
| Make Step 2.2's trajectory color follow Step 1's map variable again (hmF2/NmF2) instead of always NmF2 | Change `buildPeriodCheckMap`'s `dataOf`/`t` calculation in `app.js` back to using `VAR_CONFIG[state.variable]` instead of the hardcoded `TRAJ_CFG`, and re-add the `renderPeriodCheck()` call to `varSelect`'s `change` listener |
| Change Step 2.2's background time/lon/lat window or resolution | Edit `WINDOW_START`/`WINDOW_END`/`TIME_STEP`/`LON_STEP`/`LAT_STEP` in `extract_background_data.py` and rerun (watch `background_data.js`'s resulting size — see the file-by-file section above) |
| Give Step 2.2 its own parcel selector instead of reusing Step 2.1's | Add a fourth independent highlight set (`state.periodCheckHighlight`) plus its own chip row/sync buttons in `index.html` + `app.js`, mirroring `contourHighlight`'s pattern, and swap `renderPeriodCheck()`'s parcel source over to it |
