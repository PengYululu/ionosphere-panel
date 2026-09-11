"""
Extract a time/lon/lat-windowed, downsampled slice of the 5 global GITM
background fields (TEC, E-east, Rho, Vi-nw-meridional, Vi-nw-zonal) used as
the map background in Step 2.2 ("Period Check"), and write them as one
compact `background_data.js` for the standalone ionosphere_panel web page.

Source arrays (external drive, not touched/modified):
  /Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/tecall_lon_576.npy
  /Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/Eeastall_lon_576.npy
  /Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/rhoall_lon_576.npy
  /Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/vinwmeri_lon_576.npy
  /Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/vinwzonal_lon_576.npy

Each is shape (576, 180, 90) = (time, lon, lat). The 576-step time axis has
no saved companion timestamp/grid array anywhere in the codebase, so this
script reconstructs it from first principles (verified against the
`GITM_tad_keogram.ipynb` notebook cell that builds these arrays, cell 68/73):
  - lon: GITM_functions.load_gitm() on one 3DALL file (run once, see the
    "lon/lat" section below) returns 180 points at 2 degrees, [1, 3, ..., 359]
  - lat: 90 points at 2 degrees, [-89, -87, ..., 89]
  - time: the generating cell built ALL3Dfilelist as
    glob('3DALL_t241010*.bin') + glob('3DALL_t241011*.bin'), each sorted --
    i.e. exactly all of 2024-10-10 (288 files, 5-min cadence, 00:00-23:55)
    followed by all of 2024-10-11 (288 files, 00:00-23:55). Verified by
    `ls` counts on the source drive: 288 + 288 = 576, matching tecall's
    first dimension exactly. Since day 2 begins exactly 5 minutes after day
    1 ends, the whole 576-step axis is one uniform 5-minute series starting
    at 2024-10-10 00:00:00 UT.

Run with: /opt/homebrew/bin/python3.12 extract_background_data.py
"""
import numpy as np
import os
import json
import base64
import datetime

SRC_DIR = '/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/data/'
OUT_PATH = os.path.join(os.path.dirname(__file__), 'background_data.js')

# All UTC (GITM output times are UT). Must stay timezone-AWARE: a naive
# datetime's .timestamp() silently interprets it as local time and converts
# to UTC accordingly, which shifted every value in `times_ms` below by this
# machine's local UTC offset (4h, EDT) -- app.js's stepTimeMs()/snapTimeMs()
# use Date.UTC() and are unaffected, so that mismatch made Step 2.2 sample
# the background field ~4h off from the parcel's actual trace time.
UTC = datetime.timezone.utc
T0 = datetime.datetime(2024, 10, 10, 0, 0, 0, tzinfo=UTC)
CADENCE_MIN = 5
N_TIME_FULL = 576

# Window covers every traced step's actual time across all 49 snapshots --
# 2024-10-10 13:00 to 2024-10-11 03:00 UT, verified directly against
# data.js's own timeLabels (each snapshot backward-traces at most 2h) --
# plus a 20-min margin either side.
WINDOW_START = datetime.datetime(2024, 10, 10, 12, 40, 0, tzinfo=UTC)
WINDOW_END = datetime.datetime(2024, 10, 11, 3, 20, 0, tzinfo=UTC)

# No downsampling on any axis -- native 5-min time cadence, 2-degree lon,
# 2-degree lat, matching the source arrays exactly. (A 10-min time
# downsample was tried first and aliased the short-period, TAD-scale
# wiggles this data exists to show into a visibly different, smoother
# curve that no longer matched the reference notebook plots; a 2x
# longitude downsample was also tried and, while it didn't visibly
# distort values, was dropped along with it for full fidelity.) The
# tightened WINDOW_START/END above (down from a much wider margin) is
# what keeps background_data.js a reasonable size at full resolution.
TIME_STEP = 1
LON_STEP = 1
LAT_STEP = 1

VARS = {
    'TEC': {
        'file': 'tecall_lon_576.npy', 'label': 'TEC (TECU)',
        'cmap': 'jet', 'vmin': 0, 'vmax': 80,
    },
    'Eeast': {
        'file': 'Eeastall_lon_576.npy', 'label': 'E-east (V/m)',
        'cmap': 'bwr', 'vmin': -0.05, 'vmax': 0.05,
    },
    'Rho': {
        'file': 'rhoall_lon_576.npy', 'label': 'Rho (×10⁻¹¹ kg/m³)',
        'cmap': 'jet', 'vmin': 0, 'vmax': 3, 'scale': 1e-11,
    },
    'ViNWMeri': {
        'file': 'vinwmeri_lon_576.npy', 'label': 'Vi-nw meridional (m/s)',
        'cmap': 'bwr', 'vmin': -150, 'vmax': 150,
    },
    'ViNWZonal': {
        'file': 'vinwzonal_lon_576.npy', 'label': 'Vi-nw zonal (m/s)',
        'cmap': 'bwr', 'vmin': -100, 'vmax': 100,
    },
}


def main():
    lon_full = np.arange(180) * 2.0 + 1.0     # degrees, [1, 3, ..., 359]
    lat_full = np.arange(90) * 2.0 - 89.0     # degrees, [-89, -87, ..., 89]

    i_start = int(round((WINDOW_START - T0).total_seconds() / 60.0 / CADENCE_MIN))
    i_end = int(round((WINDOW_END - T0).total_seconds() / 60.0 / CADENCE_MIN)) + 1
    i_start = max(0, i_start)
    i_end = min(N_TIME_FULL, i_end)
    print(f'Time window: index [{i_start}, {i_end}) of {N_TIME_FULL} '
          f'({T0 + datetime.timedelta(minutes=i_start * CADENCE_MIN)} to '
          f'{T0 + datetime.timedelta(minutes=(i_end - 1) * CADENCE_MIN)})')

    time_idx = np.arange(i_start, i_end, TIME_STEP)
    lon_idx = np.arange(0, 180, LON_STEP)
    lat_idx = np.arange(0, 90, LAT_STEP)

    times_ms = [
        int((T0 + datetime.timedelta(minutes=int(i) * CADENCE_MIN)).timestamp() * 1000)
        for i in time_idx
    ]
    lon_deg = lon_full[lon_idx]
    lat_deg = lat_full[lat_idx]

    n_t, n_lon, n_lat = len(time_idx), len(lon_idx), len(lat_idx)
    print(f'Output grid: nTime={n_t}, nLon={n_lon}, nLat={n_lat} '
          f'({n_t * n_lon * n_lat} values/var)')

    out_vars = {}
    for key, cfg in VARS.items():
        path = SRC_DIR + cfg['file']
        arr = np.load(path, mmap_mode='r')
        assert arr.shape == (N_TIME_FULL, 180, 90), f'{key}: unexpected shape {arr.shape}'
        sub = np.asarray(arr[time_idx][:, lon_idx][:, :, lat_idx], dtype=np.float32)
        scale = cfg.get('scale', 1.0)
        b64 = base64.b64encode(sub.tobytes()).decode('ascii')
        out_vars[key] = {
            'label': cfg['label'], 'cmap': cfg['cmap'],
            'vmin': cfg['vmin'], 'vmax': cfg['vmax'], 'scale': scale,
            'dataB64': b64,
        }
        print(f'  {key}: raw min/max {np.nanmin(sub):.4g}/{np.nanmax(sub):.4g}, '
              f'{len(b64) / 1e6:.2f} MB base64')

    payload = {
        'nTime': n_t, 'nLon': n_lon, 'nLat': n_lat,
        'lonDeg': [round(float(v), 2) for v in lon_deg],
        'latDeg': [round(float(v), 2) for v in lat_deg],
        'timesMs': times_ms,
        'vars': out_vars,
    }
    json_str = json.dumps(payload, separators=(',', ':'))
    with open(OUT_PATH, 'w') as f:
        f.write('// Float32, row-major [time][lon][lat], base64-encoded per variable.\n')
        f.write('// Generated by extract_background_data.py -- do not hand-edit.\n')
        f.write('const BACKGROUND_DATA = ' + json_str + ';\n')

    size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
    print(f'Wrote {OUT_PATH} ({size_mb:.2f} MB)')


if __name__ == '__main__':
    main()
