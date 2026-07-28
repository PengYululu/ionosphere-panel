"""
Extract precomputed backward-traced GITM parcel data (trajectories + ionosphere
profiles) into a single compact JSON file for the standalone ionosphere_panel
web page. Reads only from the external data drive; does not touch or modify
anything in the main Code/ project.

Run with: /opt/homebrew/bin/python3.12 extract_data.py
"""
import numpy as np
import glob
import os
import json
import datetime

SRC_DIR = '/Volumes/ExtremePro/GITMSAMI_20241010_compass_grid/GITM_gradient/backward_traced_hmf2/'
OUT_PATH = os.path.join(os.path.dirname(__file__), 'data.js')

TARGET_ALT_KM = 350.0


def sigfig(x, n=4):
    if x is None or (isinstance(x, float) and (np.isnan(x) or np.isinf(x))):
        return None
    if x == 0:
        return 0.0
    return float(np.format_float_positional(x, precision=n, unique=False, fractional=False, trim='0'))


def round_arr(arr, n=4):
    out = []
    for v in np.asarray(arr).ravel():
        out.append(sigfig(float(v), n))
    return np.asarray(out, dtype=object).reshape(np.asarray(arr).shape).tolist()


def main():
    # covers both days of precomputed backward-trace snapshots: 2024-10-10
    # 15:00-23:45, and the following 2024-10-11 00:00-03:00 (the only part of
    # 10/11 that's been run through the parcel-tracing pipeline so far —
    # the raw GITM model output itself extends through all of 10/11, but the
    # derived *_edge_trace_all.npy / *_edge_ion_v3.npy files needed here
    # don't exist yet past 03:00)
    time_tags = sorted(set(
        os.path.basename(f)[:9]
        for pattern in ('1010_*_edge_trace_all.npy', '1011_*_edge_trace_all.npy')
        for f in glob.glob(SRC_DIR + pattern)
    ))
    print(f'Found {len(time_tags)} UT snapshots')

    snapshots = []
    for tag in time_tags:
        traj_path = SRC_DIR + tag + '_edge_trace_all.npy'
        ion_path = SRC_DIR + tag + '_edge_ion_v3.npy'
        if not (os.path.exists(traj_path) and os.path.exists(ion_path)):
            print(f'  skip {tag}: missing file(s)')
            continue

        traj = np.load(traj_path)               # (n_alt, n_steps+1, 3, n_parcels)
        iono = np.load(ion_path, allow_pickle=True).item()

        n_alt, n_stepsp1, _, n_parcels = traj.shape

        # altitude axis (km) from the model grid at this snapshot (step 0)
        alt_full_km = traj[:, 0, 2, 0] / 1000.0          # (n_alt,)
        alt_mid_km = (alt_full_km[:-1] + alt_full_km[1:]) / 2.0  # (n_alt-1,) matches ne_profile

        # downsample altitude axis by 2x for ne_profile to keep the embedded
        # JSON payload reasonably sized (profile shape is smooth, so this
        # loses negligible visual fidelity)
        alt_mid_km_ds = alt_mid_km[::2]

        ialt_ref = int(np.argmin(np.abs(alt_full_km - TARGET_ALT_KM)))

        lons = traj[ialt_ref, :, 0, :]   # (n_steps+1, n_parcels)
        lats = traj[ialt_ref, :, 1, :]

        ne_profile = iono['ne_profile']          # (n_steps+1, n_alt-1, n_parcels)
        hmF2 = iono['hmF2']
        NmF2 = iono['NmF2']
        top_height = iono.get('top_height')
        bottom_height = iono.get('bottom_height')
        times = iono['times']

        # per-step labels for the Step 2 / 2.1 column headers. Usually just
        # "HH:MM", but a handful of early-morning snapshots' backward trace
        # crosses midnight into the previous day (e.g. 1011_0000 traces back
        # to 2024-10-10 22:00) — prefix "MM/DD " only on steps that land on
        # a different calendar day than the snapshot's own t0, so the common
        # case stays compact and the rare crossover case stays unambiguous.
        t0_date = times[0].date() if isinstance(times[0], (datetime.datetime, datetime.date)) else None
        time_labels = []
        for t in times:
            if isinstance(t, (datetime.datetime, datetime.date)):
                if t0_date is not None and t.date() != t0_date:
                    time_labels.append(t.strftime('%m/%d %H:%M'))
                else:
                    time_labels.append(t.strftime('%H:%M'))
            else:
                time_labels.append(str(t))

        # e.g. "1010" -> "Oct 10" — shown next to the HH:MM readout so it's
        # clear which of the two calendar days a snapshot belongs to (the two
        # days' HH:MM ranges don't overlap, so this is purely for clarity —
        # snapshot lookup elsewhere in the app still matches on the plain
        # HH:MM `label` below, unaffected by this)
        month, day = int(tag[0:2]), int(tag[2:4])
        date_label = datetime.date(2024, month, day).strftime('%b %d')

        snap = {
            'tag': tag,
            'label': tag[5:7] + ':' + tag[7:9],
            'dateLabel': date_label,
            'nParcels': int(n_parcels),
            'nSteps': int(n_stepsp1),
            'altMidKm': [round(float(v), 2) for v in alt_mid_km_ds],
            'timeLabels': time_labels,
            'lon': round_arr(lons, 3),          # [step][parcel]
            'lat': round_arr(lats, 3),
            'hmF2': round_arr(hmF2, 4),
            'NmF2': round_arr(NmF2, 4),
            'topHeight': round_arr(top_height, 4) if top_height is not None else None,
            'bottomHeight': round_arr(bottom_height, 4) if bottom_height is not None else None,
            'neProfile': round_arr(ne_profile[:, ::2, :], 3),  # [step][alt][parcel], alt downsampled 2x
        }
        snapshots.append(snap)
        print(f'  {tag}: {n_parcels} parcels, {n_stepsp1} steps')

    payload = {'snapshots': snapshots}
    json_str = json.dumps(payload, separators=(',', ':'))
    with open(OUT_PATH, 'w') as f:
        f.write('const IONO_DATA = ' + json_str + ';\n')

    size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
    print(f'Wrote {OUT_PATH} ({size_mb:.2f} MB)')


if __name__ == '__main__':
    main()
