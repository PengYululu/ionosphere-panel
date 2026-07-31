// Ionosphere Parcel Tracing Panel
// Pure vanilla JS + SVG, no external libraries, reads IONO_DATA from data.js.

(function () {
  'use strict';
  (function(){ var o=document.getElementById('loadingOverlay'); if(o) o.style.display='none'; })();
  // Seed localStorage from the pre-built CSV export when no log rows exist yet.
  (function(){ try { var s=localStorage.getItem('ionospherePanel.parcelLog.v2'); if((!s||s==='[]') && typeof SEED_LOG!=='undefined') localStorage.setItem('ionospherePanel.parcelLog.v2',JSON.stringify(SEED_LOG)); } catch(e){} })();

  const SNAPS = IONO_DATA.snapshots;
  const NS = 'http://www.w3.org/2000/svg';

  const VAR_CONFIG = {
    hmF2: { key: 'hmF2', label: 'hmF2 (km)', scale: 1, vmin: 200, vmax: 500 },
    NmF2: { key: 'NmF2', label: 'NmF2 (×10^11 m^-3)', scale: 1e11, vmin: 0, vmax: 15 },
  };

  // matches the original notebook's plot_ne_contour_along_trace defaults
  // (vmin=0, vmax=1.5e12 m^-3), expressed in the same ×10^11 display units
  // used for NmF2 elsewhere on this page
  const CONTOUR_CFG = { vmin: 0, vmax: 15, scale: 1e11, label: 'nₑ (×10^11 m^-3)' };

  const state = {
    snapIdx: 12,
    hemisphere: 'N',
    variable: 'hmF2',
    mapHighlight: new Set(),
    profileHighlight: new Set(),
    contourHighlight: new Set(),
    logRows: [],
    editingLogIdx: null, // index into logRows currently loaded for editing, or null
  };

  // Step 3's log table columns: a snapshot time plus 6 geographic-region
  // buckets (3 latitude bands × West/East of the Greenwich meridian). Each
  // region is just a free-text cell the user fills in by hand — the app
  // doesn't classify parcels into these automatically.
  const LOG_REGIONS = [
    { id: 'w1', label: '40–50 West' },
    { id: 'w2', label: '50–60 West' },
    { id: 'w3', label: '60–70 West' },
    { id: 'e1', label: '40–50 East' },
    { id: 'e2', label: '50–60 East' },
    { id: 'e3', label: '60–70 East' },
  ];

  const LOG_STORAGE_KEY = 'ionospherePanel.parcelLog.v2';

  // ---------- helpers ----------

  function el(tag, attrs, ns) {
    const e = document.createElementNS(ns || NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function jetColor(t) {
    t = clamp(t, 0, 1);
    const r = clamp(1.5 - Math.abs(4 * t - 3), 0, 1);
    const g = clamp(1.5 - Math.abs(4 * t - 2), 0, 1);
    const b = clamp(1.5 - Math.abs(4 * t - 1), 0, 1);
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }

  function paletteColor(idx) {
    const hue = (idx * 137.508) % 360;
    return `hsl(${hue.toFixed(1)}, 75%, 60%)`;
  }

  function linScale(domain, range) {
    const [d0, d1] = domain, [r0, r1] = range;
    const m = (r1 - r0) / (d1 - d0 || 1e-9);
    return (v) => r0 + (v - d0) * m;
  }

  // rounds a raw step size up to the nearest "nice" 1/2/5/10 * 10^k value
  function niceStep(rawStep) {
    const exponent = Math.floor(Math.log10(rawStep));
    const base = Math.pow(10, exponent);
    const frac = rawStep / base;
    let niceFrac;
    if (frac <= 1) niceFrac = 1;
    else if (frac <= 2) niceFrac = 2;
    else if (frac <= 5) niceFrac = 5;
    else niceFrac = 10;
    return niceFrac * base;
  }

  // ticks at round, human-friendly values (multiples of 5/10/50/100/...)
  // within [vmin, vmax] — same spirit as D3/matplotlib's default tick pickers
  function niceTicks(vmin, vmax, targetCount) {
    if (!(vmax > vmin)) return [vmin];
    const rawStep = (vmax - vmin) / Math.max(1, targetCount - 1);
    const step = niceStep(rawStep);
    const start = Math.ceil((vmin - step * 1e-9) / step) * step;
    const out = [];
    for (let v = start; v <= vmax + step * 1e-9; v += step) {
      out.push(Math.round(v / step) * step);
    }
    return out;
  }

  // ticks at an exact, fixed step (e.g. every 10 units) within [vmin, vmax] —
  // used where a round "nice" step isn't precise enough (e.g. the map's
  // lat/lon grid, which should always be exactly 10°)
  function ticksAtStep(vmin, vmax, step) {
    const start = Math.ceil((vmin - step * 1e-9) / step) * step;
    const out = [];
    for (let v = start; v <= vmax + step * 1e-9; v += step) {
      out.push(Math.round(v / step) * step);
    }
    return out;
  }

  // ---------- DOM refs ----------

  const timeSlider = document.getElementById('timeSlider');
  const timeReadout = document.getElementById('timeReadout');
  const hemiSeg = document.getElementById('hemiSeg');
  const varSelect = document.getElementById('varSelect');
  const parcelCountEl = document.getElementById('parcelCount');
  const mapChips = document.getElementById('mapChips');
  const profileChips = document.getElementById('profileChips');
  const omniSvg = document.getElementById('omniSvg');
  const mapSvg = document.getElementById('mapSvg');
  const legendSvg = document.getElementById('legendSvg');
  const profileTrack = document.getElementById('profileTrack');
  const profileAxis = document.getElementById('profileAxis');
  const contourChips = document.getElementById('contourChips');
  const contourTrack = document.getElementById('contourTrack');
  const contourLegendSvg = document.getElementById('contourLegendSvg');
  const logSnapshotReadout = document.getElementById('logSnapshotReadout');
  const logRegionInputs = document.getElementById('logRegionInputs');
  const logTableHeadRow = document.getElementById('logTableHeadRow');
  const logTable = document.getElementById('logTable');
  const logTableBody = document.getElementById('logTableBody');
  const logEmptyNote = document.getElementById('logEmptyNote');
  const logEditingNote = document.getElementById('logEditingNote');
  const logAddRowBtn = document.getElementById('logAddRow');
  const logCancelEditBtn = document.getElementById('logCancelEdit');

  timeSlider.max = SNAPS.length - 1;

  // ---------- chips ----------

  function renderChipRow(container, nParcels, selectedSet, dimFn, onToggle) {
    container.innerHTML = '';
    for (let k = 0; k < nParcels; k++) {
      const chip = el('div', {}, 'http://www.w3.org/1999/xhtml');
      chip.className = 'chip' + (selectedSet.has(k) ? ' selected' : '');
      if (dimFn && dimFn(k)) chip.style.opacity = '0.4';
      const dot = el('span', {}, 'http://www.w3.org/1999/xhtml');
      dot.className = 'dot';
      dot.style.background = paletteColor(k);
      if (selectedSet.has(k)) {
        chip.style.background = paletteColor(k);
      }
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode('#' + k));
      chip.addEventListener('click', () => {
        if (selectedSet.has(k)) selectedSet.delete(k); else selectedSet.add(k);
        onToggle();
      });
      container.appendChild(chip);
    }
  }

  // ---------- omni panel (Step 0) ----------

  // snapshot tags are "MMDD_HHMM" and every snapshot falls in 2024 (see
  // extract_data.py); parse that back into a UTC epoch ms so it can be
  // compared against OMNI_DATA's own UTC epoch ms timestamps
  function snapTimeMs(snap) {
    const month = parseInt(snap.tag.slice(0, 2), 10);
    const day = parseInt(snap.tag.slice(2, 4), 10);
    const hour = parseInt(snap.tag.slice(5, 7), 10);
    const minute = parseInt(snap.tag.slice(7, 9), 10);
    return Date.UTC(2024, month - 1, day, hour, minute, 0);
  }

  // round-hour ticks at a fixed step (e.g. every 3h), aligned to UTC epoch
  // boundaries so they land on clean HH:00 values
  function timeTicks(tMin, tMax, stepHours) {
    const stepMs = stepHours * 3600 * 1000;
    const start = Math.ceil(tMin / stepMs) * stepMs;
    const out = [];
    for (let t = start; t <= tMax; t += stepMs) out.push(t);
    return out;
  }

  function fmtTimeTick(ms) {
    const d = new Date(ms);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${mo}/${dd} ${hh}:${mm}`;
  }

  const OMNI_ROWS = [
    { times: OMNI_DATA.imf.times, values: OMNI_DATA.imf.bx, label: 'IMF Bx (nT)', zeroLine: true },
    { times: OMNI_DATA.imf.times, values: OMNI_DATA.imf.by, label: 'IMF By (nT)', zeroLine: true },
    { times: OMNI_DATA.omni.times, values: OMNI_DATA.omni.efield, label: 'E-field (mV/m)', zeroLine: true },
    { times: OMNI_DATA.omni.times, values: OMNI_DATA.omni.symH, label: 'SYM-H (nT)', zeroLine: true },
  ];

  function renderOmni() {
    const W = +omniSvg.getAttribute('width'), H = +omniSvg.getAttribute('height');
    const m = { l: 56, r: 16, t: 8, b: 30 };
    const rowGap = 6;
    const nRows = OMNI_ROWS.length;
    const rowH = (H - m.t - m.b - rowGap * (nRows - 1)) / nRows;

    const tMin = Math.min(OMNI_DATA.imf.times[0], OMNI_DATA.omni.times[0]);
    const tMax = Math.max(
      OMNI_DATA.imf.times[OMNI_DATA.imf.times.length - 1],
      OMNI_DATA.omni.times[OMNI_DATA.omni.times.length - 1]
    );
    const xS = linScale([tMin, tMax], [m.l, W - m.r]);
    const pw = W - m.l - m.r;

    const curT = snapTimeMs(SNAPS[state.snapIdx]);
    const xTicks = timeTicks(tMin, tMax, 3);

    omniSvg.innerHTML = '';

    OMNI_ROWS.forEach((row, ri) => {
      const rowTop = m.t + ri * (rowH + rowGap);
      let vmin = Infinity, vmax = -Infinity;
      for (const v of row.values) {
        if (v == null) continue;
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
      }
      if (!isFinite(vmin)) { vmin = -1; vmax = 1; }
      if (vmin === vmax) { vmin -= 1; vmax += 1; }
      const pad = (vmax - vmin) * 0.1;
      vmin -= pad; vmax += pad;

      const yS = linScale([vmin, vmax], [rowTop + rowH, rowTop]);
      const yTicks = niceTicks(vmin, vmax, 4);

      const gridG = el('g', { class: 'grid' });
      omniSvg.appendChild(gridG);
      yTicks.forEach((yv) => {
        gridG.appendChild(el('line', { x1: m.l, x2: m.l + pw, y1: yS(yv), y2: yS(yv) }));
      });

      if (row.zeroLine && vmin < 0 && vmax > 0) {
        omniSvg.appendChild(el('line', {
          x1: m.l, x2: m.l + pw, y1: yS(0), y2: yS(0),
          stroke: '#8ea0bd', 'stroke-width': 1, 'stroke-dasharray': '2,2', opacity: 0.6,
        }));
      }

      const pts = [];
      row.times.forEach((t, i) => {
        const v = row.values[i];
        if (v == null) {
          if (pts.length) {
            omniSvg.appendChild(el('polyline', {
              points: pts.join(' '), fill: 'none', stroke: '#4fc3f7', 'stroke-width': 1.3,
            }));
            pts.length = 0;
          }
          return;
        }
        pts.push(`${xS(t)},${yS(v)}`);
      });
      if (pts.length) {
        omniSvg.appendChild(el('polyline', {
          points: pts.join(' '), fill: 'none', stroke: '#4fc3f7', 'stroke-width': 1.3,
        }));
      }

      const axisG = el('g', { class: 'axis' });
      yTicks.forEach((yv) => {
        axisG.appendChild(el('line', { x1: m.l - 6, x2: m.l, y1: yS(yv), y2: yS(yv), stroke: '#8ea0bd' }));
        const t = el('text', { x: m.l - 9, y: yS(yv) + 3, 'text-anchor': 'end' });
        t.textContent = niceTickLabel(yv);
        axisG.appendChild(t);
      });
      omniSvg.appendChild(axisG);

      const rowLabel = el('text', { x: m.l + 6, y: rowTop + 11, 'text-anchor': 'start' });
      rowLabel.style.fill = '#dfe8f5'; rowLabel.style.fontSize = '11px'; rowLabel.style.fontWeight = '600';
      rowLabel.textContent = row.label;
      omniSvg.appendChild(rowLabel);

      omniSvg.appendChild(el('rect', { x: m.l, y: rowTop, width: pw, height: rowH, fill: 'none', stroke: '#26364f' }));

      // bottom row gets the shared time axis
      if (ri === nRows - 1) {
        const xAxisG = el('g', { class: 'axis' });
        xTicks.forEach((tv) => {
          xAxisG.appendChild(el('line', { x1: xS(tv), x2: xS(tv), y1: rowTop + rowH, y2: rowTop + rowH + 5, stroke: '#8ea0bd' }));
          const t = el('text', { x: xS(tv), y: rowTop + rowH + 16, 'text-anchor': 'middle' });
          t.textContent = fmtTimeTick(tv);
          xAxisG.appendChild(t);
        });
        omniSvg.appendChild(xAxisG);
      }
    });

    // vertical dashed red line tracking the top time-bar's current snapshot,
    // drawn across all four rows on top of everything else
    if (curT >= tMin && curT <= tMax) {
      const xLine = xS(curT);
      omniSvg.appendChild(el('line', {
        x1: xLine, x2: xLine, y1: m.t, y2: H - m.b,
        stroke: '#ff3b30', 'stroke-width': 1.6, 'stroke-dasharray': '5,4',
      }));
    }
  }

  function niceTickLabel(v) {
    return Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : v.toFixed(v % 1 === 0 ? 0 : 1);
  }

  // ---------- map panel ----------

  function renderMap() {
    const snap = SNAPS[state.snapIdx];
    const cfg = VAR_CONFIG[state.variable];
    const nSteps = snap.nSteps, nP = snap.nParcels;

    const hemiIsNorth = state.hemisphere === 'N';
    const ylim = hemiIsNorth ? [30, 90] : [-90, -30];

    const startLat = [];
    for (let k = 0; k < nP; k++) startLat.push(snap.lat[0][k]);
    const hemiMask = startLat.map((v) => hemiIsNorth ? v >= 0 : v < 0);

    // fixed x domain, matching the original notebook's ax.set_xlim(150, 350).
    // Some parcels' backward trace runs away (unwrapped longitude drifting
    // hundreds of degrees over the trace window) — those points simply draw
    // outside this window and get clipped (via the clipPath below) rather
    // than being allowed to stretch the axis.
    const lonMin = 150, lonMax = 350;

    const W = +mapSvg.getAttribute('width'), H = +mapSvg.getAttribute('height');
    const m = { l: 52, r: 16, t: 14, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const xS = linScale([lonMin, lonMax], [m.l, m.l + pw]);
    const yS = linScale(ylim, [m.t + ph, m.t]); // invert

    mapSvg.innerHTML = '';
    const defs = el('defs');
    const clip = el('clipPath', { id: 'mapClip' });
    clip.appendChild(el('rect', { x: m.l, y: m.t, width: pw, height: ph }));
    defs.appendChild(clip);
    mapSvg.appendChild(defs);

    const g = el('g');
    mapSvg.appendChild(g);

    // grid + axes
    const gridG = el('g', { class: 'map-grid' });
    g.appendChild(gridG);
    const xticks = ticksAtStep(lonMin, lonMax, 10);
    const yticks = ticksAtStep(ylim[0], ylim[1], 10);
    xticks.forEach((xv) => {
      gridG.appendChild(el('line', { x1: xS(xv), x2: xS(xv), y1: m.t, y2: m.t + ph }));
    });
    yticks.forEach((yv) => {
      gridG.appendChild(el('line', { x1: m.l, x2: m.l + pw, y1: yS(yv), y2: yS(yv) }));
    });

    const axisG = el('g', { class: 'axis' });
    g.appendChild(axisG);
    xticks.forEach((xv) => {
      const t = el('text', { x: xS(xv), y: m.t + ph + 16, 'text-anchor': 'middle' });
      t.textContent = xv.toFixed(0);
      axisG.appendChild(t);
    });
    yticks.forEach((yv) => {
      const t = el('text', { x: m.l - 8, y: yS(yv) + 3, 'text-anchor': 'end' });
      t.textContent = yv.toFixed(0);
      axisG.appendChild(t);
    });
    const xl = el('text', { x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle' });
    xl.setAttribute('fill', 'var(--text-dim)');
    xl.style.fill = '#8ea0bd'; xl.style.fontSize = '11px';
    xl.textContent = 'Longitude (°E)';
    g.appendChild(xl);
    const ylabel = el('text', {
      x: -( m.t + ph / 2), y: 14, 'text-anchor': 'middle',
      transform: 'rotate(-90)'
    });
    ylabel.style.fill = '#8ea0bd'; ylabel.style.fontSize = '11px';
    ylabel.textContent = 'Latitude (°N)';
    g.appendChild(ylabel);

    const dataOf = (s, k) => snap[cfg.key][s][k] / cfg.scale;

    // background trajectories, colored per-segment
    const bgG = el('g', { 'clip-path': 'url(#mapClip)' });
    g.appendChild(bgG);
    for (let k = 0; k < nP; k++) {
      if (!hemiMask[k]) continue;
      if (state.mapHighlight.has(k)) continue;
      for (let s = 0; s < nSteps - 1; s++) {
        const lon0 = snap.lon[s][k], lat0 = snap.lat[s][k];
        const lon1 = snap.lon[s + 1][k], lat1 = snap.lat[s + 1][k];
        if (lon0 == null || lon1 == null) continue;
        const v0 = dataOf(s, k), v1 = dataOf(s + 1, k);
        const t = ((v0 + v1) / 2 - cfg.vmin) / (cfg.vmax - cfg.vmin);
        const line = el('line', {
          x1: xS(lon0), y1: yS(lat0), x2: xS(lon1), y2: yS(lat1),
          stroke: jetColor(t), 'stroke-width': 1.3, 'stroke-opacity': 0.8,
        });
        bgG.appendChild(line);
      }
      // start marker
      const v0 = dataOf(0, k);
      const t0 = (v0 - cfg.vmin) / (cfg.vmax - cfg.vmin);
      const sq = el('rect', {
        x: xS(snap.lon[0][k]) - 3, y: yS(snap.lat[0][k]) - 3, width: 6, height: 6,
        fill: jetColor(t0), stroke: '#0b1220', 'stroke-width': 0.6,
      });
      bgG.appendChild(sq);
    }

    // highlighted trajectories on top
    const hlG = el('g', { 'clip-path': 'url(#mapClip)' });
    g.appendChild(hlG);
    Array.from(state.mapHighlight).filter((k) => hemiMask[k]).forEach((k) => {
      const pts = [];
      for (let s = 0; s < nSteps; s++) {
        if (snap.lon[s][k] == null) continue;
        pts.push(`${xS(snap.lon[s][k])},${yS(snap.lat[s][k])}`);
      }
      const path = el('polyline', {
        points: pts.join(' '), fill: 'none', stroke: '#0a0a0a',
        'stroke-width': 2.6, 'stroke-opacity': 0.95,
      });
      hlG.appendChild(path);
      const path2 = el('polyline', {
        points: pts.join(' '), fill: 'none', stroke: paletteColor(k),
        'stroke-width': 1.3, 'stroke-opacity': 0.95,
      });
      hlG.appendChild(path2);

      const startCircle = el('circle', {
        cx: xS(snap.lon[0][k]), cy: yS(snap.lat[0][k]), r: 7,
        fill: 'none', stroke: '#43e07a', 'stroke-width': 2.2,
      });
      hlG.appendChild(startCircle);
      const lastIdx = nSteps - 1;
      const endDiamond = el('rect', {
        x: xS(snap.lon[lastIdx][k]) - 5, y: yS(snap.lat[lastIdx][k]) - 5,
        width: 10, height: 10, transform: `rotate(45 ${xS(snap.lon[lastIdx][k])} ${yS(snap.lat[lastIdx][k])})`,
        fill: 'none', stroke: '#ff3fd4', 'stroke-width': 2,
      });
      hlG.appendChild(endDiamond);
      const label = el('text', {
        x: xS(snap.lon[0][k]) + 8, y: yS(snap.lat[0][k]) - 8, fill: '#fff',
      });
      label.style.fontSize = '11px'; label.style.fontWeight = '700';
      label.textContent = '#' + k;
      hlG.appendChild(label);
    });

    // border
    g.appendChild(el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'none', stroke: '#26364f' }));

    renderLegend(cfg);
  }

  function renderLegend(cfg) {
    drawColorLegend(legendSvg, cfg, 'legendGrad');
  }

  // shared vertical color-scale bar, used by both the map (Step 1) and the
  // density contour (Step 2.1) — cfg is {vmin, vmax, scale, label}
  function drawColorLegend(svgEl, cfg, gradId) {
    svgEl.innerHTML = '';
    const W = +svgEl.getAttribute('width'), H = +svgEl.getAttribute('height');
    const barX = 20, barY = 20, barW = 22, barH = H - 60;
    const grad = el('defs');
    const lg = el('linearGradient', { id: gradId, x1: '0', y1: '1', x2: '0', y2: '0' });
    for (let i = 0; i <= 10; i++) {
      lg.appendChild(el('stop', { offset: (i * 10) + '%', 'stop-color': jetColor(i / 10) }));
    }
    grad.appendChild(lg);
    svgEl.appendChild(grad);
    svgEl.appendChild(el('rect', { x: barX, y: barY, width: barW, height: barH, fill: `url(#${gradId})`, stroke: '#26364f' }));

    const g = el('g', { class: 'legend-scale' });
    const ticks = niceTicks(cfg.vmin, cfg.vmax, 6);
    ticks.forEach((tv) => {
      const frac = (tv - cfg.vmin) / (cfg.vmax - cfg.vmin);
      const y = barY + barH - frac * barH;
      g.appendChild(el('line', { x1: barX + barW, x2: barX + barW + 5, y1: y, y2: y, stroke: '#8ea0bd' }));
      const t = el('text', { x: barX + barW + 8, y: y + 3 });
      t.textContent = tv.toFixed(0);
      g.appendChild(t);
    });
    svgEl.appendChild(g);

    const label = el('text', { x: barX, y: H - 20, 'text-anchor': 'start' });
    label.style.fill = '#dfe8f5'; label.style.fontSize = '11px';
    label.textContent = cfg.label;
    svgEl.appendChild(label);
  }

  // ---------- profile panel ----------

  function renderProfiles() {
    const snap = SNAPS[state.snapIdx];
    profileTrack.innerHTML = '';
    profileAxis.innerHTML = '';
    const parcels = Array.from(state.profileHighlight).filter((k) => k < snap.nParcels);

    if (parcels.length === 0) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'Select one or more parcels above to plot their electron density profiles.';
      profileTrack.appendChild(note);
      return;
    }

    const nSteps = snap.nSteps;
    const altArr = snap.altMidKm;
    const altMin = altArr[0], altMax = altArr[altArr.length - 1];

    // global ne domain (log) across selected parcels & all steps
    let neMin = Infinity, neMax = -Infinity;
    for (let s = 0; s < nSteps; s++) {
      for (const k of parcels) {
        for (let a = 0; a < altArr.length; a++) {
          const v = snap.neProfile[s][a][k];
          if (v == null || v <= 0) continue;
          if (v < neMin) neMin = v;
          if (v > neMax) neMax = v;
        }
      }
    }
    if (!isFinite(neMin)) { neMin = 1e9; neMax = 1e12; }
    const logMin = Math.log10(neMin * 0.7);
    const logMax = Math.log10(neMax * 1.3);

    const showBoundaries = parcels.length === 1;
    const W = 92, H = 340;
    const m = { l: 4, r: 4, t: 6, b: 18 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const yS = linScale([altMin, altMax], [m.t + ph, m.t]);
    const xS = linScale([logMin, logMax], [m.l, m.l + pw]);

    // fixed altitude axis, rendered once outside the horizontally-scrolling
    // track so it stays visible no matter how far the user scrolls right
    const altTicks = niceTicks(altMin, altMax, 7);
    const axisG = el('g', { class: 'axis' });
    altTicks.forEach((av) => {
      axisG.appendChild(el('line', { x1: 36, x2: 42, y1: yS(av), y2: yS(av), stroke: '#8ea0bd' }));
      const t = el('text', { x: 34, y: yS(av) + 3, 'text-anchor': 'end' });
      t.textContent = av.toFixed(0);
      axisG.appendChild(t);
    });
    profileAxis.appendChild(axisG);
    const axisLabel = el('text', {
      x: -(m.t + ph / 2), y: 8, 'text-anchor': 'middle', transform: 'rotate(-90)',
    });
    axisLabel.style.fill = '#8ea0bd'; axisLabel.style.fontSize = '10px';
    axisLabel.textContent = 'Altitude (km)';
    profileAxis.appendChild(axisLabel);

    for (let s = 0; s < nSteps; s++) {
      const wrap = document.createElement('div');
      wrap.className = 'profile-step';
      const title = document.createElement('div');
      title.className = 'step-title';
      title.textContent = snap.timeLabels[s] || ('t' + s);
      wrap.appendChild(title);

      const svg = el('svg', { width: W, height: H });

      const gridG = el('g', { class: 'grid' });
      svg.appendChild(gridG);
      altTicks.forEach((av) => {
        gridG.appendChild(el('line', { x1: m.l, x2: m.l + pw, y1: yS(av), y2: yS(av) }));
      });

      parcels.forEach((k) => {
        const pts = [];
        for (let a = 0; a < altArr.length; a++) {
          const v = snap.neProfile[s][a][k];
          if (v == null || v <= 0) continue;
          pts.push(`${xS(Math.log10(v))},${yS(altArr[a])}`);
        }
        const path = el('polyline', {
          points: pts.join(' '), fill: 'none', stroke: paletteColor(k), 'stroke-width': 1.6,
        });
        svg.appendChild(path);

        if (showBoundaries) {
          const hm = snap.hmF2 ? snap.hmF2[s][k] : null;
          const top = snap.topHeight ? snap.topHeight[s][k] : null;
          const bot = snap.bottomHeight ? snap.bottomHeight[s][k] : null;
          [[hm, '2,2'], [top, '5,3'], [bot, '3,3,1,3']].forEach(([val, dash]) => {
            if (val == null) return;
            svg.appendChild(el('line', {
              x1: m.l, x2: m.l + pw, y1: yS(val), y2: yS(val),
              stroke: '#dfe8f5', 'stroke-width': 1, 'stroke-dasharray': dash, opacity: 0.8,
            }));
          });

          const labelG = el('g', { class: 'boundary-label' });
          const mkLabel = (y, text, va) => {
            const t = el('text', {
              x: m.l + pw - 1, y: y + (va === 'above' ? -2 : 8),
              'text-anchor': 'end',
            });
            t.style.fontSize = '7px';
            t.style.fill = '#dfe8f5';
            t.textContent = text;
            labelG.appendChild(t);
          };
          if (hm != null) {
            mkLabel(yS(hm), hm.toFixed(0), 'above');
            if (top != null) mkLabel(yS(top), 'Δ' + Math.abs(top - hm).toFixed(0), 'above');
            if (bot != null) mkLabel(yS(bot), 'Δ' + Math.abs(hm - bot).toFixed(0), 'below');
          }
          svg.appendChild(labelG);
        }
      });

      svg.appendChild(el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'none', stroke: '#26364f' }));
      wrap.appendChild(svg);
      profileTrack.appendChild(wrap);
    }
  }

  // ---------- density contour panel (Step 2.1) ----------

  // reconstructs cell edges from a midpoint array, e.g. [100,200,300] ->
  // [50,150,250,350] — needed so pcolormesh-style rects align with the
  // altitude midpoints stored in data.js
  function altEdgesFromMid(altArr) {
    const n = altArr.length;
    if (n === 1) return [altArr[0] - 1, altArr[0] + 1];
    const edges = new Array(n + 1);
    edges[0] = altArr[0] - (altArr[1] - altArr[0]) / 2;
    for (let i = 1; i < n; i++) edges[i] = (altArr[i - 1] + altArr[i]) / 2;
    edges[n] = altArr[n - 1] + (altArr[n - 1] - altArr[n - 2]) / 2;
    return edges;
  }

  function renderContours() {
    const snap = SNAPS[state.snapIdx];
    contourTrack.innerHTML = '';
    drawColorLegend(contourLegendSvg, CONTOUR_CFG, 'contourLegendGrad');

    const parcels = Array.from(state.contourHighlight).filter((k) => k < snap.nParcels);
    if (parcels.length === 0) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'Select one or more parcels above to plot their density time-height contour.';
      contourTrack.appendChild(note);
      return;
    }

    const nSteps = snap.nSteps;
    const altArr = snap.altMidKm;
    const altEdges = altEdgesFromMid(altArr);
    const altTicks = niceTicks(altArr[0], altArr[altArr.length - 1], 7);

    const colW = 22;
    const m = { l: 46, r: 12, t: 8, b: 56 };
    const pw = colW * nSteps, ph = 260;
    const W = m.l + pw + m.r, H = m.t + ph + m.b;

    const xEdges = [];
    for (let i = 0; i <= nSteps; i++) xEdges.push(i - 0.5);
    const xS = linScale([xEdges[0], xEdges[nSteps]], [m.l, m.l + pw]);
    const yS = linScale([altEdges[0], altEdges[altEdges.length - 1]], [m.t + ph, m.t]);

    parcels.forEach((k) => {
      const wrap = document.createElement('div');
      wrap.className = 'contour-step';
      const title = document.createElement('div');
      title.className = 'contour-title';
      title.textContent = '● Parcel #' + k;
      title.style.color = paletteColor(k);
      wrap.appendChild(title);

      const svg = el('svg', { width: W, height: H });

      // density cells, masked black outside [bottom_height, top_height]
      const cellsG = el('g');
      svg.appendChild(cellsG);
      for (let s = 0; s < nSteps; s++) {
        const top = snap.topHeight ? snap.topHeight[s][k] : null;
        const bot = snap.bottomHeight ? snap.bottomHeight[s][k] : null;
        const x0 = xS(xEdges[s]), x1 = xS(xEdges[s + 1]);
        for (let a = 0; a < altArr.length; a++) {
          const av = altArr[a];
          const masked = (top != null && av > top) || (bot != null && av < bot);
          const v = snap.neProfile[s][a][k];
          let fill;
          if (masked || v == null) {
            fill = '#000000';
          } else {
            const t = clamp((v / CONTOUR_CFG.scale - CONTOUR_CFG.vmin) / (CONTOUR_CFG.vmax - CONTOUR_CFG.vmin), 0, 1);
            fill = jetColor(t);
          }
          const y0 = yS(altEdges[a + 1]), y1 = yS(altEdges[a]);
          cellsG.appendChild(el('rect', {
            x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill, stroke: 'none',
          }));
        }
      }

      // hmF2(t) overlay
      if (snap.hmF2) {
        const pts = [];
        for (let s = 0; s < nSteps; s++) {
          const hm = snap.hmF2[s][k];
          if (hm == null) continue;
          pts.push(`${xS(s)},${yS(hm)}`);
        }
        if (pts.length > 1) {
          svg.appendChild(el('polyline', {
            points: pts.join(' '), fill: 'none', stroke: '#000000', 'stroke-width': 1.8,
            'stroke-dasharray': '3,2', opacity: 0.9,
          }));
        }
      }

      // altitude (y) axis
      const yAxisG = el('g', { class: 'axis' });
      altTicks.forEach((av) => {
        yAxisG.appendChild(el('line', { x1: m.l - 6, x2: m.l, y1: yS(av), y2: yS(av), stroke: '#8ea0bd' }));
        const t = el('text', { x: m.l - 9, y: yS(av) + 3, 'text-anchor': 'end' });
        t.textContent = av.toFixed(0);
        yAxisG.appendChild(t);
      });
      svg.appendChild(yAxisG);
      const yLabel = el('text', {
        x: -(m.t + ph / 2), y: 12, 'text-anchor': 'middle', transform: 'rotate(-90)',
      });
      yLabel.style.fill = '#8ea0bd'; yLabel.style.fontSize = '10px';
      yLabel.textContent = 'Altitude (km)';
      svg.appendChild(yLabel);

      // time (x) axis — rotated labels, one per traced step
      const xAxisG = el('g', { class: 'axis' });
      for (let s = 0; s < nSteps; s++) {
        const txt = el('text', {
          'text-anchor': 'end',
          transform: `translate(${xS(s)},${m.t + ph + 8}) rotate(-90)`,
        });
        txt.style.fontSize = '7px';
        txt.textContent = snap.timeLabels[s] || ('t' + s);
        xAxisG.appendChild(txt);
      }
      svg.appendChild(xAxisG);
      const xLabel = el('text', { x: m.l + pw / 2, y: H - 4, 'text-anchor': 'middle' });
      xLabel.style.fill = '#8ea0bd'; xLabel.style.fontSize = '10px';
      xLabel.textContent = 'Time (UT, backward from t0)';
      svg.appendChild(xLabel);

      svg.appendChild(el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'none', stroke: '#26364f' }));
      wrap.appendChild(svg);
      contourTrack.appendChild(wrap);
    });
  }

  // ---------- parcel log (Step 3) ----------

  // builds the 6 region text inputs once, above the table
  function buildLogInputs() {
    logRegionInputs.innerHTML = '';
    LOG_REGIONS.forEach((region) => {
      const group = document.createElement('div');
      group.className = 'control-group';
      const label = document.createElement('label');
      label.setAttribute('for', 'logInput_' + region.id);
      label.textContent = region.label;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'logInput_' + region.id;
      input.placeholder = 'e.g. 0, 5, 12';
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') addLogRowFromInput();
      });
      group.appendChild(label);
      group.appendChild(input);
      logRegionInputs.appendChild(group);
    });
  }

  // builds the fixed 7-column table header (Snapshot + 6 regions + action)
  function buildLogTableHead() {
    logTableHeadRow.innerHTML = '';
    const thTime = document.createElement('th');
    thTime.textContent = 'Snapshot (UT)';
    logTableHeadRow.appendChild(thTime);
    LOG_REGIONS.forEach((region) => {
      const th = document.createElement('th');
      th.textContent = region.label;
      logTableHeadRow.appendChild(th);
    });
    logTableHeadRow.appendChild(document.createElement('th'));
  }

  function loadLog() {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((r) => r && typeof r.time === 'string' && r.regions && typeof r.regions === 'object');
    } catch (e) {
      return [];
    }
  }

  function saveLog() {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(state.logRows));
    } catch (e) {
      // localStorage unavailable (e.g. private browsing quota) — the table
      // still works for the current page load, it just won't persist
    }
  }

  function renderLogTable() {
    logTableBody.innerHTML = '';
    const hasRows = state.logRows.length > 0;
    logTable.style.display = hasRows ? '' : 'none';
    logEmptyNote.style.display = hasRows ? 'none' : '';

    state.logRows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'log-row-clickable';
      if (idx === state.editingLogIdx) tr.className += ' log-row-editing';
      tr.title = 'Click to load these parcels into Step 1 / 2 / 2.1, and into the boxes above for editing';
      tr.addEventListener('click', () => jumpToLogRow(row, idx));

      const tdTime = document.createElement('td');
      tdTime.textContent = row.time;
      tr.appendChild(tdTime);

      LOG_REGIONS.forEach((region) => {
        const td = document.createElement('td');
        td.className = 'log-region';
        td.textContent = row.regions[region.id] || '';
        tr.appendChild(td);
      });

      const tdAction = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'log-delete';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation(); // don't also trigger the row's "jump to" click
        state.logRows.splice(idx, 1);
        if (state.editingLogIdx === idx) {
          exitLogEditMode();
        } else if (state.editingLogIdx !== null && state.editingLogIdx > idx) {
          state.editingLogIdx -= 1;
        }
        saveLog();
        renderLogTable();
      });
      tdAction.appendChild(delBtn);
      tr.appendChild(tdAction);

      logTableBody.appendChild(tr);
    });
  }

  // parses "0, 5, 12" (or an empty string) into a set of integer parcel indices
  function parseParcelList(text) {
    const out = new Set();
    if (!text) return out;
    text.split(',').forEach((tok) => {
      const n = parseInt(tok.trim(), 10);
      if (!Number.isNaN(n)) out.add(n);
    });
    return out;
  }

  function clearLogInputs() {
    LOG_REGIONS.forEach((region) => {
      document.getElementById('logInput_' + region.id).value = '';
    });
  }

  function exitLogEditMode() {
    state.editingLogIdx = null;
    clearLogInputs();
    logAddRowBtn.textContent = 'Add row';
    logCancelEditBtn.style.display = 'none';
    logEditingNote.style.display = 'none';
  }

  // clicking a Step 3 row jumps to that row's snapshot, highlights the union
  // of parcels logged across all 6 region columns in Steps 1, 2, 2.1, and
  // loads those same values back into the input boxes so they can be edited
  // and saved in place (instead of appending a duplicate row) via "Update row"
  function jumpToLogRow(row, idx) {
    const snapIdx = SNAPS.findIndex((s) => s.label === row.time);
    if (snapIdx === -1) return;

    const parcelSet = new Set();
    LOG_REGIONS.forEach((region) => {
      parseParcelList(row.regions[region.id]).forEach((n) => parcelSet.add(n));
      document.getElementById('logInput_' + region.id).value = row.regions[region.id] || '';
    });

    state.snapIdx = snapIdx;
    state.mapHighlight = new Set(parcelSet);
    state.profileHighlight = new Set(parcelSet);
    state.contourHighlight = new Set(parcelSet);
    state.editingLogIdx = idx;

    timeSlider.value = snapIdx;
    logAddRowBtn.textContent = 'Update row';
    logCancelEditBtn.style.display = '';
    logEditingNote.style.display = '';
    renderEverything();
    renderLogTable();
  }

  // quotes a CSV field only if it needs it (contains a comma, quote, or newline)
  function csvField(value) {
    const s = String(value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadLogCsv() {
    const header = ['Snapshot (UT)'].concat(LOG_REGIONS.map((r) => r.label));
    const lines = [header.map(csvField).join(',')];
    state.logRows.forEach((row) => {
      const fields = [row.time].concat(LOG_REGIONS.map((r) => row.regions[r.id] || ''));
      lines.push(fields.map(csvField).join(','));
    });
    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ionosphere_parcel_log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- top-level render ----------

  function refreshMapChips() {
    const snap = SNAPS[state.snapIdx];
    const hemiIsNorth = state.hemisphere === 'N';
    const dimFn = (k) => {
      const lat0 = snap.lat[0][k];
      return hemiIsNorth ? lat0 < 0 : lat0 >= 0;
    };
    renderChipRow(mapChips, snap.nParcels, state.mapHighlight, dimFn, () => {
      refreshMapChips();
      renderMap();
    });
  }

  function refreshProfileChips() {
    const snap = SNAPS[state.snapIdx];
    renderChipRow(profileChips, snap.nParcels, state.profileHighlight, null, () => {
      refreshProfileChips();
      renderProfiles();
    });
  }

  function refreshContourChips() {
    const snap = SNAPS[state.snapIdx];
    renderChipRow(contourChips, snap.nParcels, state.contourHighlight, null, () => {
      refreshContourChips();
      renderContours();
    });
  }

  function renderEverything() {
    const snap = SNAPS[state.snapIdx];
    // the date prefix is purely a display aid (day 1 and day 2 never share
    // an HH:MM value, so `snap.label` alone stays an unambiguous match key
    // for the Step 3 log — see jumpToLogRow)
    const fullLabel = snap.dateLabel + ' ' + snap.label;
    timeReadout.textContent = fullLabel;
    parcelCountEl.textContent = snap.nParcels + ' parcels traced';
    logSnapshotReadout.textContent = fullLabel;
    refreshMapChips();
    refreshProfileChips();
    refreshContourChips();
    renderOmni();
    renderMap();
    renderProfiles();
    renderContours();
  }

  // ---------- events ----------

  timeSlider.addEventListener('input', () => {
    state.snapIdx = +timeSlider.value;
    state.mapHighlight.clear();
    state.profileHighlight.clear();
    state.contourHighlight.clear();
    // dragging the slider manually moves away from whatever row was being
    // edited, so an "Update row" click wouldn't clearly apply to it anymore
    if (state.editingLogIdx !== null) {
      exitLogEditMode();
      renderLogTable();
    }
    renderEverything();
  });

  hemiSeg.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    Array.from(hemiSeg.children).forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.hemisphere = btn.dataset.val;
    renderEverything();
  });

  varSelect.addEventListener('change', () => {
    state.variable = varSelect.value;
    renderMap();
  });

  document.getElementById('mapSelectAll').addEventListener('click', () => {
    const snap = SNAPS[state.snapIdx];
    for (let k = 0; k < snap.nParcels; k++) state.mapHighlight.add(k);
    renderEverything();
  });
  document.getElementById('mapClear').addEventListener('click', () => {
    state.mapHighlight.clear();
    renderEverything();
  });
  document.getElementById('profileSyncFromMap').addEventListener('click', () => {
    state.profileHighlight = new Set(state.mapHighlight);
    renderEverything();
  });
  document.getElementById('profileClear').addEventListener('click', () => {
    state.profileHighlight.clear();
    renderEverything();
  });
  document.getElementById('contourSyncFromProfile').addEventListener('click', () => {
    state.contourHighlight = new Set(state.profileHighlight);
    renderEverything();
  });
  document.getElementById('contourClear').addEventListener('click', () => {
    state.contourHighlight.clear();
    renderEverything();
  });

  function addLogRowFromInput() {
    const regions = {};
    let anyValue = false;
    LOG_REGIONS.forEach((region) => {
      const input = document.getElementById('logInput_' + region.id);
      const text = input.value.trim();
      regions[region.id] = text;
      if (text) anyValue = true;
    });
    if (!anyValue) return;
    const snap = SNAPS[state.snapIdx];

    if (state.editingLogIdx !== null && state.editingLogIdx < state.logRows.length) {
      // update the existing row in place rather than appending a duplicate
      state.logRows[state.editingLogIdx] = { time: snap.label, regions };
    } else {
      state.logRows.push({ time: snap.label, regions });
    }

    saveLog();
    exitLogEditMode();
    renderLogTable();
    document.getElementById('logInput_' + LOG_REGIONS[0].id).focus();
  }

  logAddRowBtn.addEventListener('click', addLogRowFromInput);
  logCancelEditBtn.addEventListener('click', exitLogEditMode);
  document.getElementById('logDownloadCsv').addEventListener('click', downloadLogCsv);
  document.getElementById('logClearAll').addEventListener('click', () => {
    if (state.logRows.length === 0) return;
    if (!window.confirm('Clear all logged rows? This cannot be undone.')) return;
    state.logRows = [];
    exitLogEditMode();
    saveLog();
    renderLogTable();
  });

  // ---------- init ----------

  // seed a sensible default selection on first load
  (function seedDefaults() {
    const snap = SNAPS[state.snapIdx];
    if (snap.nParcels > 0) {
      state.mapHighlight.add(0);
      if (snap.nParcels > 1) state.mapHighlight.add(Math.floor(snap.nParcels / 2));
      state.profileHighlight = new Set(state.mapHighlight);
      state.contourHighlight = new Set([0]);
    }
  })();

  buildLogInputs();
  buildLogTableHead();
  state.logRows = loadLog();
  renderLogTable();

  timeSlider.value = state.snapIdx;
  renderEverything();
})();
