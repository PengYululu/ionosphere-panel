"""
Extract solar wind IMF (Bx, By) and OMNI observational (E-field, SYM-H) time
series for the standalone ionosphere_panel web page's Step 0 plot. Parsing
logic mirrors read_swmf_file()/read_omni_file() from ../swmf_omni_functions.py
(and the OMNI section of ../swmf_omni.ipynb), reimplemented here so this
folder stays self-contained (no dependency on the main Code/ project).

Reads the local copies imf20241009_12.dat / omni_20241009_12.txt (themselves
copied from /Users/yulupeng/Documents/AAA_research/Results/2024_1010_storm/
20241010_inputs/, the SWMF input set for the same 2024-10-10 GITM run this
panel visualizes) and writes omni_data.js.

Run with: python3 extract_omni_data.py
"""
import json
import os
from datetime import datetime, timedelta, timezone

IMF_FILE = os.path.join(os.path.dirname(__file__), 'imf20241009_12.dat')
OMNI_FILE = os.path.join(os.path.dirname(__file__), 'omni_20241009_12.txt')
OUT_PATH = os.path.join(os.path.dirname(__file__), 'omni_data.js')

# padded a few hours around the panel's 49 traced snapshots (2024-10-10
# 15:00 through 2024-10-11 03:00) so the moving red line has some run-up
# and recovery context on either side
WINDOW_START = datetime(2024, 10, 10, 12, 0, 0)
WINDOW_END = datetime(2024, 10, 11, 6, 0, 0)


def read_swmf_imf(file):
    """bx/by (nT) vs time, SWMF-ready IMF file (see read_swmf_file in swmf_omni_functions.py)."""
    times, bx, by = [], [], []
    with open(file, 'r') as f:
        started = False
        for line in f:
            if not started:
                if line.strip() == '#START':
                    started = True
                continue
            parts = line.split()
            if len(parts) < 9:
                continue
            year, month, day, hour, minute, second = (int(p) for p in parts[0:6])
            t = datetime(year, month, day, hour, minute, second)
            if not (WINDOW_START <= t <= WINDOW_END):
                continue
            times.append(t)
            bx.append(float(parts[7]))
            by.append(float(parts[8]))
    return times, bx, by


def read_omni(file):
    """Efield (mV/m) and symH (nT) vs time, OMNIWeb hi-res file (see read_omni_file)."""
    times, efield, symh = [], [], []
    with open(file, 'r') as f:
        data_section = False
        for line in f:
            line = line.strip()
            if not line or line.startswith('<'):
                continue
            if line.startswith('YYYY'):
                data_section = True
                continue
            if not data_section:
                continue
            entries = line.split()
            if len(entries) < 17:
                continue
            try:
                year, doy, hour, minute = (int(entries[i]) for i in range(4))
                t = datetime(year, 1, 1) + timedelta(days=doy - 1, hours=hour, minutes=minute)
                if not (WINDOW_START <= t <= WINDOW_END):
                    continue
                sh = float(entries[15]) if entries[15] != '99999' else None
                ef = float(entries[16]) if entries[16] != '999.99' else None
            except ValueError:
                continue
            times.append(t)
            efield.append(ef)
            symh.append(sh)
    return times, efield, symh


def epoch_ms(t):
    # these are naive UT timestamps (from OMNI/SWMF files) — attach UTC
    # explicitly so the epoch value doesn't depend on the machine's local
    # timezone (a naive datetime.timestamp() would assume local time)
    return int(t.replace(tzinfo=timezone.utc).timestamp() * 1000)


def main():
    imf_times, bx, by = read_swmf_imf(IMF_FILE)
    omni_times, efield, symh = read_omni(OMNI_FILE)
    print(f'imf: {len(imf_times)} points, {imf_times[0]} .. {imf_times[-1]}')
    print(f'omni: {len(omni_times)} points, {omni_times[0]} .. {omni_times[-1]}')

    payload = {
        'imf': {
            'times': [epoch_ms(t) for t in imf_times],
            'bx': [round(v, 3) for v in bx],
            'by': [round(v, 3) for v in by],
        },
        'omni': {
            'times': [epoch_ms(t) for t in omni_times],
            'efield': [None if v is None else round(v, 3) for v in efield],
            'symH': [None if v is None else round(v, 2) for v in symh],
        },
    }
    json_str = json.dumps(payload, separators=(',', ':'))
    with open(OUT_PATH, 'w') as f:
        f.write('const OMNI_DATA = ' + json_str + ';\n')

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f'Wrote {OUT_PATH} ({size_kb:.1f} KB)')


if __name__ == '__main__':
    main()
