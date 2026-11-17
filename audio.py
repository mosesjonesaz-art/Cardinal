#!/usr/bin/env python3
"""Look at a song instead of guessing: spectrograms, colored waveforms and measured numbers.

Claude can't hear audio, but it can read images and numbers. This turns any audio file
(mp3, wav, flac, m4a, ogg, ...) into:

  overview.png     4 stacked panels on one time axis: 3-band waveform (red = lows,
                   yellow = mids, blue = highs), spectrogram, short-term loudness,
                   stereo width. Dashed lines = detected section changes.
  spectrogram.png  big, high-resolution spectrogram (Spek-style: dark blue -> red -> yellow).
  balance.png      average frequency spectrum vs a pink-noise slope, band levels,
                   and a stereo vectorscope.
  zoom_*.png       close-up of a time range (--zoom 1:05-1:25, repeatable).
  report.txt/.json every number: loudness (LUFS), true peak, clipping, dynamics,
                   BPM, key, band balance, high-frequency cutoff, stereo, sections.

Usage:
  python audio.py analyze song.mp3                 # writes to analysis/<song name>/
  python audio.py analyze song.mp3 --out DIR --zoom 0:45-1:05 --zoom 2:10-2:30
"""

import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np

os.environ.setdefault("MPLBACKEND", "Agg")
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402
from scipy import signal  # noqa: E402

# Spek-like palette: silence is black, then blue, purple, red, orange, yellow, white.
SPEK = LinearSegmentedColormap.from_list(
    "spek",
    ["#000000", "#08083a", "#1a1aa8", "#6a1fb0", "#c8203a", "#ff6a00", "#ffc800", "#fff4a0", "#ffffff"],
)
LOW_C, MID_C, HIGH_C = "#ff2d2d", "#ffd21f", "#2f8bff"  # lows red, mids yellow, highs blue
BG = "#0d0d12"
EPS = 1e-12

BANDS = [  # (name, lo Hz, hi Hz)
    ("sub", 20, 60),
    ("bass", 60, 250),
    ("low-mid", 250, 500),
    ("mid", 500, 2000),
    ("high-mid", 2000, 6000),
    ("presence/air", 6000, 20000),
]

KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# Krumhansl-Kessler key profiles.
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


# ---------------------------------------------------------------- helpers


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), EPS))


def mmss(t, _pos=None):
    t = max(0.0, float(t))
    return f"{int(t // 60)}:{int(t % 60):02d}"


def parse_time(s):
    s = s.strip()
    if ":" in s:
        m, sec = s.split(":", 1)
        return int(m) * 60 + float(sec)
    return float(s)


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        sys.exit(f"ffprobe could not read {path}:\n{out.stderr.strip()}")
    info = json.loads(out.stdout)
    audio = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    if not audio:
        sys.exit(f"No audio stream in {path}")
    st, fmt = audio[0], info.get("format", {})
    br = st.get("bit_rate") or fmt.get("bit_rate")
    return {
        "codec": st.get("codec_name"),
        "sample_rate": int(st.get("sample_rate", 44100)),
        "channels": int(st.get("channels", 2)),
        "bit_rate_kbps": round(int(br) / 1000) if br else None,
        "bits_per_sample": st.get("bits_per_raw_sample") or st.get("bits_per_sample") or None,
        "duration_s": float(fmt.get("duration") or st.get("duration") or 0),
        "title": (fmt.get("tags") or {}).get("title"),
    }


def decode(path, sr):
    """Decode anything ffmpeg reads to float32 stereo at sr. Returns array (2, n)."""
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vn", "-f", "f32le", "-acodec", "pcm_f32le",
         "-ac", "2", "-ar", str(sr), "-"],
        capture_output=True,
    )
    if out.returncode != 0:
        sys.exit(f"ffmpeg could not decode {path}:\n{out.stderr.decode(errors='replace').strip()}")
    x = np.frombuffer(out.stdout, dtype=np.float32).reshape(-1, 2).T.copy()
    if x.shape[1] < sr:
        sys.exit("Audio is shorter than one second; nothing to analyze.")
    return x


def k_weight(x, sr):
    """ITU-R BS.1770 K-weighting (same filters pyloudnorm uses)."""
    import pyloudnorm as pyln

    meter = pyln.Meter(sr)
    y = x.astype(np.float64)
    for f in meter._filters.values():
        y = signal.lfilter(f.b, f.a, y, axis=-1)
    return y


def windowed_loudness(kw, sr, win_s, hop_s):
    """Loudness (LUFS) of each window of a K-weighted (2, n) signal."""
    win, hop = int(win_s * sr), int(hop_s * sr)
    power = (kw**2).sum(axis=0)  # sum over channels (L/R weights are 1.0)
    c = np.concatenate([[0.0], np.cumsum(power)])
    starts = np.arange(0, max(1, len(power) - win + 1), hop)
    ms = (c[np.minimum(starts + win, len(power))] - c[starts]) / win
    times = (starts + win / 2) / sr
    return times, -0.691 + 10 * np.log10(np.maximum(ms, EPS))


def loudness_range(st):
    """EBU Tech 3342 LRA from short-term (3 s) loudness values."""
    g = st[st > -70]
    if len(g) == 0:
        return None
    g = g[g > 10 * np.log10(np.mean(10 ** (g / 10))) - 20]
    if len(g) < 2:
        return 0.0
    return float(np.percentile(g, 95) - np.percentile(g, 10))


def true_peak(x, sr):
    """4x oversampled peak (dBTP), done in chunks to keep memory low."""
    peak, chunk, pad = 0.0, sr * 10, 64
    for ch in x:
        for s in range(0, len(ch), chunk):
            seg = ch[max(0, s - pad): s + chunk + pad].astype(np.float64)
            peak = max(peak, float(np.max(np.abs(signal.resample_poly(seg, 4, 1)))))
    return db(peak)


def clip_runs(x, thresh=0.999, min_run=3):
    """Count runs of >= min_run consecutive samples at full scale (flat-topped clipping)."""
    runs, worst = 0, 0
    for ch in x:
        hot = np.abs(ch) >= thresh
        if not hot.any():
            continue
        d = np.diff(np.concatenate([[0], hot.astype(np.int8), [0]]))
        lengths = np.flatnonzero(d == -1) - np.flatnonzero(d == 1)
        runs += int((lengths >= min_run).sum())
        worst = max(worst, int(lengths.max()))
    return runs, worst


def band_filter(x, sr, lo, hi):
    if lo and hi:
        sos = signal.butter(4, [lo, hi], btype="bandpass", fs=sr, output="sos")
    elif hi:
        sos = signal.butter(4, hi, btype="lowpass", fs=sr, output="sos")
    else:
        sos = signal.butter(4, lo, btype="highpass", fs=sr, output="sos")
    return signal.sosfiltfilt(sos, x, axis=-1)


def envelope(y, n_cols):
    """Peak envelope of a 1-D signal in n_cols columns."""
    n = len(y) // n_cols * n_cols
    return np.abs(y[:n]).reshape(n_cols, -1).max(axis=1)


def smooth_octave(freqs, psd_db, frac):
    """Smooth a spectrum over 1/frac-octave windows."""
    out = np.empty_like(psd_db)
    lin = 10 ** (psd_db / 10)
    for i, f in enumerate(freqs):
        if f <= 0:
            out[i] = psd_db[i]
            continue
        lo, hi = f * 2 ** (-0.5 / frac), f * 2 ** (0.5 / frac)
        a, b = np.searchsorted(freqs, lo), np.searchsorted(freqs, hi, side="right")
        out[i] = 10 * np.log10(np.mean(lin[a:max(b, a + 1)]) + EPS)
    return out


# ---------------------------------------------------------------- analysis


def analyze(path, out_dir, zooms):
    import librosa
    import pyloudnorm as pyln

    info = probe(path)
    sr = min(info["sample_rate"], 48000)
    x = decode(path, sr)
    n = x.shape[1]
    dur = n / sr
    mid = x.mean(axis=0)
    side = (x[0] - x[1]) / 2
    rep = {"file": os.path.abspath(path), "format": info, "analysis_sample_rate": sr,
           "duration": mmss(dur), "duration_s": round(dur, 2)}

    # ---- level, loudness, dynamics
    integrated = pyln.Meter(sr).integrated_loudness(x.T.astype(np.float64))
    kw = k_weight(x, sr)
    st_t, st = windowed_loudness(kw, sr, 3.0, 0.5)
    mo_t, mo = windowed_loudness(kw, sr, 0.4, 0.1)
    sample_peak = db(np.max(np.abs(x)))
    tp = true_peak(x, sr)
    rms = db(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    runs, worst = clip_runs(x)
    over = int((np.abs(x) > 1.0).sum())
    lra = loudness_range(st)
    rep["loudness"] = {
        "integrated_lufs": round(float(integrated), 1),
        "max_short_term_lufs": round(float(st.max()), 1),
        "max_momentary_lufs": round(float(mo.max()), 1),
        "loudness_range_lu": None if lra is None else round(lra, 1),
        "sample_peak_dbfs": round(float(sample_peak), 2),
        "true_peak_dbtp": round(float(tp), 2),
        "rms_dbfs": round(float(rms), 1),
        "crest_factor_db": round(float(sample_peak - rms), 1),
        "plr_db": round(float(tp - integrated), 1),
        "clipped_runs": runs,
        "longest_clipped_run_samples": worst,
        "samples_over_full_scale": over,
        "dc_offset": [round(float(c.mean()), 5) for c in x],
    }
    loud = rep["loudness"]
    notes = []
    if tp > -1.0:
        notes.append(f"True peak {tp:+.1f} dBTP is above -1 dBTP; streaming encoders may clip it.")
    if runs:
        notes.append(f"{runs} flat-topped clipping runs (3+ samples at full scale, longest {worst}).")
    if over:
        notes.append(f"{over} decoded samples exceed full scale (inter-sample overs from the encode).")
    if integrated > -9:
        notes.append(f"Very loud master ({integrated:.1f} LUFS); streaming services turn it down to about -14.")
    if lra is not None and lra < 4:
        notes.append(f"Loudness range {lra:.1f} LU is narrow: little loud/quiet contrast between sections.")
    if max(abs(c) for c in loud["dc_offset"]) > 0.005:
        notes.append("Noticeable DC offset.")

    # leading / trailing silence
    frame = int(0.05 * sr)
    fr = db(np.sqrt(np.mean(mid[: n // frame * frame].reshape(-1, frame) ** 2, axis=1)))
    audible = np.flatnonzero(fr > -60)
    lead = audible[0] * 0.05 if len(audible) else 0
    tail = (len(fr) - 1 - audible[-1]) * 0.05 if len(audible) else 0
    rep["silence"] = {"leading_s": round(lead, 2), "trailing_s": round(tail, 2)}

    # ---- spectrum, balance, cutoff
    f, pxx = signal.welch(mid, fs=sr, nperseg=8192, noverlap=4096)
    pxx_db = 10 * np.log10(pxx + EPS)
    band_energy = {}
    for name, lo, hi in BANDS:
        sel = (f >= lo) & (f < min(hi, sr / 2))
        band_energy[name] = float(pxx[sel].sum()) if sel.any() else 0.0
    total = sum(band_energy.values()) + EPS
    rep["band_balance_pct_of_energy"] = {k: round(100 * v / total, 1) for k, v in band_energy.items()}
    loudest = max(band_energy.values()) + EPS
    rep["band_level_db_vs_loudest"] = {k: round(10 * np.log10(v / loudest + EPS), 1) for k, v in band_energy.items()}

    # brick-wall cutoff: steepest drop above 8 kHz in the smoothed spectrum
    sm = smooth_octave(f, pxx_db, 12)
    step = max(1, int(round(400 / (f[1] - f[0]))))
    cutoff = None
    hi_idx = np.flatnonzero(f > 8000)
    if len(hi_idx) > step:
        drops = sm[hi_idx[:-step]] - sm[hi_idx[step:]]
        k = int(np.argmax(drops))
        if drops[k] > 25:
            cutoff = float(f[hi_idx[k] + step // 2])
    rep["high_frequency_cutoff_hz"] = None if cutoff is None else round(cutoff, -1)
    if cutoff:
        notes.append(f"Brick-wall lowpass near {cutoff / 1000:.1f} kHz (lossy encode or generator output); "
                     "nothing real above it.")

    # narrow peaks: 1/24-octave spectrum standing out from 1/3-octave trend
    fine, broad = smooth_octave(f, pxx_db, 24), smooth_octave(f, pxx_db, 3)
    excess = fine - broad
    rng = (f > 80) & (f < min(12000, cutoff or 1e9))
    peaks, props = signal.find_peaks(np.where(rng, excess, -99), height=3.0, distance=max(1, int(30 / (f[1] - f[0]))))
    order = np.argsort(props["peak_heights"])[::-1][:6]
    rep["narrow_spectral_peaks"] = [
        {"hz": round(float(f[peaks[i]])), "note": librosa.hz_to_note(float(f[peaks[i]])),
         "db_above_trend": round(float(props["peak_heights"][i]), 1)}
        for i in order
    ]

    # ---- stereo
    def corr(a, b):
        return float(np.sum(a * b) / np.sqrt(np.sum(a * a) * np.sum(b * b) + EPS))

    low = band_filter(x.astype(np.float64), sr, None, 150)
    rep["stereo"] = {
        "lr_correlation": round(corr(x[0].astype(np.float64), x[1].astype(np.float64)), 3),
        "low_end_correlation_below_150hz": round(corr(low[0], low[1]), 3),
        "side_to_mid_db": round(max(-60.0, float(db(np.sqrt(np.mean(side**2))) - db(np.sqrt(np.mean(mid**2))))), 1),
        "lr_balance_db": round(float(db(np.sqrt(np.mean(x[0] ** 2))) - db(np.sqrt(np.mean(x[1] ** 2)))), 2),
    }
    stv = rep["stereo"]
    if stv["side_to_mid_db"] < -40:
        notes.append("Effectively mono (left and right are identical).")
    if stv["lr_correlation"] < 0.2:
        notes.append("Low L/R correlation: wide or phasey; check how it sounds summed to mono.")
    if stv["low_end_correlation_below_150hz"] < 0.8 and stv["side_to_mid_db"] > -40:
        notes.append("Low end below 150 Hz is not centered (correlation < 0.8); bass may thin out in mono.")
    if abs(stv["lr_balance_db"]) > 1.0:
        notes.append(f"Left/right level imbalance of {stv['lr_balance_db']:+.1f} dB.")

    # ---- tempo, key, sections (librosa at 22.05 kHz mono)
    y22 = librosa.resample(mid.astype(np.float32), orig_sr=sr, target_sr=22050)
    hop = 512
    _, beats = librosa.beat.beat_track(y=y22, sr=22050, hop_length=hop)
    # Tempo: librosa's estimate picks the octave, then the onset autocorrelation peak
    # near it gives a precise value (the beat tracker alone can be off by a few BPM).
    fine_hop = 128
    oenv = librosa.onset.onset_strength(y=y22, sr=22050, hop_length=fine_hop)
    coarse = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=oenv, sr=22050, hop_length=fine_hop))[0])
    fps = 22050 / fine_hop
    lag0 = 60 * fps / coarse
    ac = librosa.autocorrelate(oenv - oenv.mean(), max_size=int(lag0 * 1.1) + 3)
    lo_l, hi_l = int(lag0 * 0.96), min(len(ac) - 2, int(np.ceil(lag0 * 1.04)))
    bpm = coarse
    if hi_l > lo_l >= 1:
        best = lo_l + int(np.argmax(ac[lo_l: hi_l + 1]))
        a_, b_, c_ = ac[best - 1], ac[best], ac[best + 1]
        den = a_ - 2 * b_ + c_
        off = 0.5 * (a_ - c_) / den if den else 0.0
        bpm = 60 * fps / (best + float(np.clip(off, -0.5, 0.5)))
    rep["tempo"] = {"bpm": round(bpm, 1), "half": round(bpm / 2, 1), "double": round(bpm * 2, 1),
                    "beats_detected": int(len(beats))}

    chroma = librosa.feature.chroma_cqt(y=y22, sr=22050, hop_length=hop)
    prof = chroma.mean(axis=1)
    scores = []
    for i in range(12):
        scores.append((np.corrcoef(np.roll(MAJOR, i), prof)[0, 1], f"{KEYS[i]} major"))
        scores.append((np.corrcoef(np.roll(MINOR, i), prof)[0, 1], f"{KEYS[i]} minor"))
    scores.sort(reverse=True)
    rep["key"] = {"best": scores[0][1], "confidence": round(float(scores[0][0]), 2),
                  "runner_up": scores[1][1], "runner_up_confidence": round(float(scores[1][0]), 2)}
    (b_root, b_mode), (r_root, r_mode) = scores[0][1].split(), scores[1][1].split()
    shift = (KEYS.index(r_root) - KEYS.index(b_root)) % 12
    if b_mode != r_mode and shift == (9 if b_mode == "major" else 3):
        rep["key"]["note"] = "best and runner-up are relative keys (same notes); the home chord decides which"

    # Sections: timbre (MFCC), harmony (chroma) and energy per beat, clustered in time order.
    mfcc = librosa.feature.mfcc(y=y22, sr=22050, hop_length=hop, n_mfcc=13)
    pw = np.abs(librosa.stft(y22, n_fft=2048, hop_length=hop)) ** 2
    ff = librosa.fft_frequencies(sr=22050, n_fft=2048)
    energy = np.vstack([10 * np.log10(pw[(ff >= lo) & (ff < hi)].sum(axis=0) + 1e-10)
                        for lo, hi in [(20, 250), (250, 4000), (4000, 11025)]]
                       + [10 * np.log10(pw.sum(axis=0) + 1e-10)])

    def z(a):
        return (a - a.mean(axis=1, keepdims=True)) / (a.std(axis=1, keepdims=True) + 1e-9)

    m = min(chroma.shape[1], mfcc.shape[1], energy.shape[1])
    feats = np.vstack([z(chroma[:, :m]), z(mfcc[:, :m]), 2 * z(energy[:, :m])])
    if len(beats) > 16:
        feats = librosa.util.sync(feats, beats[beats < m], aggregate=np.median)
        frame_times = librosa.frames_to_time(np.concatenate([[0], beats[beats < m]]), sr=22050, hop_length=hop)
    else:
        frame_times = librosa.frames_to_time(np.arange(feats.shape[1]), sr=22050, hop_length=hop)
    k = min(int(np.clip(round(dur / 15), 3, 16)), feats.shape[1] - 1)
    bounds = sorted(set(int(b) for b in librosa.segment.agglomerative(feats, k)) | {0})
    segs = [[bounds[i], bounds[i + 1] if i + 1 < len(bounds) else feats.shape[1]] for i in range(len(bounds))]

    def seg_time(i):
        return float(frame_times[min(i, len(frame_times) - 1)])

    # merge segments shorter than 7 s into the more similar neighbour
    while len(segs) > 1:
        lens = [seg_time(b) - seg_time(a) if b < feats.shape[1] else dur - seg_time(a) for a, b in segs]
        i = int(np.argmin(lens))
        if lens[i] >= 7:
            break
        me = feats[:, segs[i][0]: segs[i][1]].mean(axis=1)
        cand = [j for j in (i - 1, i + 1) if 0 <= j < len(segs)]
        j = min(cand, key=lambda j: np.linalg.norm(feats[:, segs[j][0]: segs[j][1]].mean(axis=1) - me))
        lo_i, hi_i = min(i, j), max(i, j)
        segs[lo_i: hi_i + 1] = [[segs[lo_i][0], segs[hi_i][1]]]
    starts = [seg_time(a) for a, _ in segs]
    starts[0] = 0.0
    sections = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else dur
        a, b = int(s * sr), int(e * sr)
        seg_l = 10 * np.log10(np.mean((kw[:, a:b] ** 2).sum(axis=0)) + EPS) - 0.691
        sf, sp = signal.welch(mid[a:b], fs=sr, nperseg=4096)
        tot = np.sum(sp) + EPS
        share = {nm: round(float(10 * np.log10(np.sum(sp[(sf >= lo) & (sf < hi)]) / tot + EPS)), 1)
                 for nm, lo, hi in [("lows", 20, 250), ("mids", 250, 4000), ("highs", 4000, sr / 2)]}
        sl = x[:, a:b].astype(np.float64)
        width = float(db(np.sqrt(np.mean(((sl[0] - sl[1]) / 2) ** 2))) - db(np.sqrt(np.mean(((sl[0] + sl[1]) / 2) ** 2))))
        sections.append({"n": i + 1, "start": mmss(s), "end": mmss(e), "start_s": round(s, 1),
                         "end_s": round(e, 1), "lufs": round(float(seg_l), 1),
                         "band_db_of_total": share, "side_to_mid_db": round(max(-60.0, width), 1)})
    rep["sections"] = sections

    # loudest and quietest 3 s moments (ignoring silence)
    audible_st = st > -60
    if audible_st.any():
        rep["loudest_moment"] = mmss(st_t[np.argmax(st)])
        rep["quietest_moment"] = mmss(st_t[np.flatnonzero(audible_st)[np.argmin(st[audible_st])]])
    rep["notes"] = notes or ["No technical red flags found."]

    # ---- images
    os.makedirs(out_dir, exist_ok=True)
    plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "savefig.facecolor": BG,
                         "text.color": "#e8e8e8", "axes.labelcolor": "#e8e8e8", "xtick.color": "#c8c8c8",
                         "ytick.color": "#c8c8c8", "axes.edgecolor": "#555", "font.size": 11})
    name = os.path.splitext(os.path.basename(path))[0]
    spec = stft_db(mid, sr)
    plot_overview(out_dir, name, x, mid, sr, dur, spec, st_t, st, sections, rep)
    plot_spectrogram(os.path.join(out_dir, "spectrogram.png"), f"{name}: spectrogram", spec, sr, 0, dur,
                     sections, figsize=(22, 9))
    plot_balance(out_dir, name, f, pxx_db, sm, rep, x, sr, cutoff)
    rep["images"] = ["overview.png", "spectrogram.png", "balance.png"]
    for z in zooms:
        a_s, b_s = (parse_time(v) for v in z.split("-", 1))
        a_s, b_s = max(0, a_s), min(dur, b_s)
        if b_s - a_s < 0.5:
            continue
        fn = f"zoom_{mmss(a_s).replace(':', '')}-{mmss(b_s).replace(':', '')}.png"
        plot_zoom(os.path.join(out_dir, fn), name, x, sr, a_s, b_s)
        rep["images"].append(fn)

    with open(os.path.join(out_dir, "report.json"), "w") as fh:
        json.dump(rep, fh, indent=2)
    text = format_report(rep)
    with open(os.path.join(out_dir, "report.txt"), "w") as fh:
        fh.write(text)
    print(text)
    print(f"\nImages and report in: {os.path.abspath(out_dir)}")
    for im in rep["images"]:
        print(f"  {os.path.join(os.path.abspath(out_dir), im)}")


def stft_db(y, sr, n_fft=4096, hop=None):
    hop = hop or max(256, len(y) // 6000)  # about 6000 columns for any length
    f, t, z = signal.stft(y, fs=sr, nperseg=n_fft, noverlap=n_fft - hop, boundary=None, padded=False)
    mag = 20 * np.log10(np.abs(z) + EPS)
    return f, t, mag - mag.max()  # 0 dB = loudest bin


def plot_spectrogram(fn, title, spec, sr, t0, t1, sections=None, figsize=(22, 9), ax=None, cbar=True):
    f, t, mag = spec
    own = ax is None
    if own:
        fig, ax = plt.subplots(figsize=figsize)
    sel = f >= 20
    im = ax.pcolormesh(t + t0, f[sel], mag[sel], cmap=SPEK, vmin=-100, vmax=0, shading="auto",
                       rasterized=True)
    ax.set_yscale("log")
    ax.set_ylim(20, sr / 2)
    ax.set_yticks([20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000])
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 1000:g}k" if v >= 1000 else f"{v:g}"))
    ax.set_ylabel("Hz")
    ax.set_xlim(t0, t1)
    ax.xaxis.set_major_formatter(FuncFormatter(mmss))
    for s in sections or []:
        ax.axvline(s["start_s"], color="white", ls="--", lw=0.8, alpha=0.6)
    if cbar:
        c = plt.colorbar(im, ax=ax, pad=0.01)
        c.set_label("dB (0 = loudest)")
    if own:
        ax.set_title(title)
        ax.set_xlabel("time")
        fig.tight_layout()
        fig.savefig(fn, dpi=110)
        plt.close(fig)


def three_band(ax, x, sr, t0, t1, cols=3000):
    a, b = int(t0 * sr), int(t1 * sr)
    seg = x[:, a:b].astype(np.float64)
    cols = max(50, min(cols, seg.shape[1] // 8))
    t = np.linspace(t0, t1, cols)
    m = seg.mean(axis=0)
    bands = [(band_filter(m, sr, None, 250), LOW_C, "lows < 250 Hz"),
             (band_filter(m, sr, 250, 4000), MID_C, "mids 250 Hz-4 kHz"),
             (band_filter(m, sr, 4000, None), HIGH_C, "highs > 4 kHz")]
    full = envelope(m, cols)
    ax.fill_between(t, -full, full, color="#3a3a46", lw=0, label="full signal")
    for y, c, lab in bands:
        e = envelope(y, cols)
        ax.fill_between(t, -e, e, color=c, alpha=0.75, lw=0, label=lab)
    ax.set_ylim(-1.05, 1.05)
    ax.axhline(1.0, color="#ff4040", lw=0.6, ls=":")
    ax.axhline(-1.0, color="#ff4040", lw=0.6, ls=":")
    ax.set_xlim(t0, t1)
    ax.xaxis.set_major_formatter(FuncFormatter(mmss))
    ax.set_ylabel("amplitude")
    ax.legend(loc="upper right", fontsize=8, framealpha=0.3, ncol=4)


def plot_overview(out_dir, name, x, mid, sr, dur, spec, st_t, st, sections, rep):
    fig, axs = plt.subplots(4, 1, figsize=(20, 15), sharex=True,
                            gridspec_kw={"height_ratios": [2.2, 3.2, 1.6, 1.2]})
    L = rep["loudness"]
    fig.suptitle(f"{name}   |   {L['integrated_lufs']} LUFS   {L['true_peak_dbtp']:+} dBTP   "
                 f"LRA {L['loudness_range_lu']} LU   {rep['tempo']['bpm']} BPM   {rep['key']['best']}",
                 fontsize=15)
    three_band(axs[0], x, sr, 0, dur)
    axs[0].set_title("3-band waveform: red = lows, yellow = mids, blue = highs (dotted = full scale)",
                     fontsize=11, loc="left")
    plot_spectrogram(None, None, spec, sr, 0, dur, sections, ax=axs[1], cbar=False)
    axs[1].set_title("spectrogram (log frequency; black = silent, yellow/white = loudest)", fontsize=11,
                     loc="left")
    axs[2].plot(st_t, st, color="#ffb000", lw=1.4)
    axs[2].axhline(L["integrated_lufs"], color="#ffffff", lw=0.8, ls="--")
    axs[2].axhline(-14, color="#2f8bff", lw=0.8, ls=":")
    axs[2].text(0.998, -14, "-14 (streaming) ", color="#2f8bff", fontsize=8, va="bottom", ha="right",
                transform=axs[2].get_yaxis_transform())
    axs[2].text(0.002, L["integrated_lufs"], " integrated", color="#ffffff", fontsize=8, va="bottom",
                transform=axs[2].get_yaxis_transform())
    lo = np.percentile(st[st > -70], 2) if (st > -70).any() else -40
    axs[2].set_ylim(max(-60, lo - 4), max(st.max() + 2, -10))
    axs[2].set_ylabel("LUFS (3 s)")
    axs[2].set_title("short-term loudness", fontsize=11, loc="left")
    # stereo width over time: side/mid ratio in 1 s windows
    w = sr
    nwin = x.shape[1] // w
    m = x[:, : nwin * w].astype(np.float64)
    mm = ((m[0] + m[1]) / 2).reshape(nwin, w)
    ss = ((m[0] - m[1]) / 2).reshape(nwin, w)
    width = db(np.sqrt((ss**2).mean(1))) - db(np.sqrt((mm**2).mean(1)))
    tw = (np.arange(nwin) + 0.5)
    axs[3].fill_between(tw, -40, np.clip(width, -40, 6), color="#9b59ff", alpha=0.8, lw=0)
    axs[3].set_ylim(-40, 6)
    axs[3].set_ylabel("side/mid dB")
    axs[3].set_title("stereo width (higher = wider; -40 = mono)", fontsize=11, loc="left")
    axs[3].set_xlabel("time")
    for ax in axs:
        for s in sections:
            ax.axvline(s["start_s"], color="white", ls="--", lw=0.8, alpha=0.5)
    for s in sections:
        axs[0].text(s["start_s"], 1.0, f" S{s['n']}", color="white", fontsize=9, va="top")
    axs[3].xaxis.set_major_formatter(FuncFormatter(mmss))
    axs[3].set_xticks(np.arange(0, dur + 1, 15 if dur < 300 else 30))
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "overview.png"), dpi=100)
    plt.close(fig)


def plot_balance(out_dir, name, f, pxx_db, sm, rep, x, sr, cutoff):
    fig = plt.figure(figsize=(20, 8))
    gs = fig.add_gridspec(1, 3, width_ratios=[2.2, 1, 1])
    ax = fig.add_subplot(gs[0])
    sel = f >= 20
    top = sm[sel].max()
    ax.semilogx(f[sel], pxx_db[sel] - top, color="#555", lw=0.6, label="raw")
    ax.semilogx(f[sel], sm[sel] - top, color="#ffb000", lw=2, label="1/12-octave smoothed")
    # pink-noise reference (-3 dB/octave in this PSD view), anchored at 1 kHz
    ref_at = np.interp(1000, f[sel], sm[sel] - top)
    ax.semilogx(f[sel], ref_at - 10 * np.log10(f[sel] / 1000), color="#2f8bff", ls="--", lw=1,
                label="pink-noise slope (reference)")
    for name_b, lo, hi in BANDS:
        ax.axvspan(lo, hi, color="#ffffff", alpha=0.03 if BANDS.index((name_b, lo, hi)) % 2 else 0.0)
        ax.text(np.sqrt(lo * hi), 3, name_b, ha="center", fontsize=9, color="#bbb")
    if cutoff:
        ax.axvline(cutoff, color="#ff4040", ls=":", lw=1.2)
        ax.text(cutoff, -95, f" cutoff {cutoff / 1000:.1f}k", color="#ff4040", fontsize=9)
    for p in rep["narrow_spectral_peaks"]:
        ax.annotate(f"{p['hz']} Hz", (p["hz"], np.interp(p["hz"], f, sm) - top), xytext=(0, 14),
                    textcoords="offset points", ha="center", fontsize=8, color="#ff8080",
                    arrowprops={"arrowstyle": "-", "color": "#ff8080", "lw": 0.6})
    ax.set_xlim(20, sr / 2)
    ax.set_ylim(-100, 8)
    ax.set_xlabel("Hz")
    ax.set_ylabel("dB (0 = loudest)")
    ax.set_title("average spectrum (whole song, mid channel)")
    ax.legend(loc="lower left", fontsize=9, framealpha=0.3)
    ax.grid(True, which="both", color="#333", lw=0.4)

    ax2 = fig.add_subplot(gs[1])
    names = list(rep["band_balance_pct_of_energy"].keys())
    vals = [rep["band_level_db_vs_loudest"][k] for k in names]
    colors = [LOW_C, LOW_C, MID_C, MID_C, HIGH_C, HIGH_C]
    ax2.barh(names[::-1], [v + 60 for v in vals[::-1]], left=-60, color=colors[::-1])
    for i, v in enumerate(vals[::-1]):
        ax2.text(v + 0.5, i, f"{v:.1f} dB", va="center", fontsize=9)
    ax2.set_xlim(-60, 8)
    ax2.set_title("band energy vs loudest band")

    ax3 = fig.add_subplot(gs[2])
    step = max(1, x.shape[1] // 400000)
    l, r = x[0, ::step], x[1, ::step]
    ax3.hist2d((l - r) / np.sqrt(2), (l + r) / np.sqrt(2), bins=300, range=[[-1, 1], [-1, 1]],
               cmap=SPEK, norm=matplotlib.colors.LogNorm())
    ax3.set_aspect("equal")
    ax3.set_xticks([])
    ax3.set_yticks([])
    s = rep["stereo"]
    ax3.set_title(f"vectorscope (vertical = mono)\ncorrelation {s['lr_correlation']}, "
                  f"<150 Hz {s['low_end_correlation_below_150hz']}", fontsize=10)
    fig.suptitle(f"{name}: tonal balance and stereo", fontsize=14)
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "balance.png"), dpi=100)
    plt.close(fig)


def plot_zoom(fn, name, x, sr, t0, t1):
    a, b = int(t0 * sr), int(t1 * sr)
    m = x[:, a:b].mean(axis=0)
    hop = max(64, len(m) // 4000)
    spec = stft_db(m, sr, n_fft=4096 if t1 - t0 > 3 else 2048, hop=hop)
    fig, axs = plt.subplots(2, 1, figsize=(20, 11), sharex=True, gridspec_kw={"height_ratios": [1.3, 3]})
    three_band(axs[0], x, sr, t0, t1)
    plot_spectrogram(None, None, spec, sr, t0, t1, ax=axs[1], cbar=False)
    axs[1].set_xlabel("time")
    span = t1 - t0
    tick = 1 if span <= 20 else 2 if span <= 40 else 5
    axs[1].set_xticks(np.arange(np.ceil(t0), t1 + 0.01, tick))
    axs[1].xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{int(v // 60)}:{v % 60:04.1f}"))
    fig.suptitle(f"{name}: zoom {mmss(t0)}-{mmss(t1)}", fontsize=14)
    fig.tight_layout()
    fig.savefig(fn, dpi=100)
    plt.close(fig)


def format_report(r):
    L, S, F = r["loudness"], r["stereo"], r["format"]
    lines = [
        f"FILE      {r['file']}",
        f"FORMAT    {F['codec']}, {F['sample_rate']} Hz, {F['channels']} ch"
        + (f", {F['bit_rate_kbps']} kbps" if F["bit_rate_kbps"] else "")
        + f", {r['duration']}",
        "",
        "LOUDNESS AND DYNAMICS",
        f"  integrated          {L['integrated_lufs']} LUFS",
        f"  max short-term      {L['max_short_term_lufs']} LUFS   (max momentary {L['max_momentary_lufs']})",
        f"  loudness range      {L['loudness_range_lu']} LU",
        f"  true peak           {L['true_peak_dbtp']:+} dBTP   (sample peak {L['sample_peak_dbfs']:+} dBFS)",
        f"  crest factor        {L['crest_factor_db']} dB      PLR {L['plr_db']} dB",
        f"  clipping            {L['clipped_runs']} flat-top runs, {L['samples_over_full_scale']} samples over 0 dBFS",
        f"  silence             {r['silence']['leading_s']} s at start, {r['silence']['trailing_s']} s at end",
        "",
        "MUSIC",
        f"  tempo               {r['tempo']['bpm']} BPM   (or {r['tempo']['half']} / {r['tempo']['double']})",
        f"  key (estimate)      {r['key']['best']} ({r['key']['confidence']}), "
        f"runner-up {r['key']['runner_up']} ({r['key']['runner_up_confidence']})",
    ] + ([f"                      {r['key']['note']}"] if r["key"].get("note") else []) + [
        "",
        "TONAL BALANCE (share of energy, dB vs loudest band)",
    ]
    for k, v in r["band_balance_pct_of_energy"].items():
        lines.append(f"  {k:<18}  {v:5.1f} %   {r['band_level_db_vs_loudest'][k]:6.1f} dB")
    cut = r["high_frequency_cutoff_hz"]
    lines.append(f"  high cutoff         {f'{cut / 1000:.1f} kHz brick wall' if cut else 'none (content to Nyquist)'}")
    if r["narrow_spectral_peaks"]:
        lines.append("  narrow peaks        " + ", ".join(
            f"{p['hz']} Hz ({p['note']}, +{p['db_above_trend']} dB)" for p in r["narrow_spectral_peaks"]))
    lines += [
        "",
        "STEREO",
        f"  L/R correlation     {S['lr_correlation']}   (1 = mono, 0 = unrelated, <0 = out of phase)",
        f"  below 150 Hz        {S['low_end_correlation_below_150hz']}",
        f"  side vs mid         {S['side_to_mid_db']} dB",
        f"  L/R balance         {S['lr_balance_db']:+} dB",
        "",
        "SECTIONS (detected from timbre and harmony changes; approximate)",
    ]
    lines.append("        time          loudness     lows   mids  highs (dB of total)   width (side/mid)")
    for s in r["sections"]:
        b = s["band_db_of_total"]
        lines.append(f"  S{s['n']:<3} {s['start']:>5}-{s['end']:<5}  {s['lufs']:6.1f} LUFS  "
                     f"{b['lows']:6.1f} {b['mids']:6.1f} {b['highs']:6.1f}            {s['side_to_mid_db']:6.1f} dB")
    if "loudest_moment" in r:
        lines.append(f"  loudest 3 s around {r['loudest_moment']}, quietest around {r['quietest_moment']}")
    lines += ["", "FLAGS"] + [f"  - {n}" for n in r["notes"]]
    return "\n".join(lines) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyze", help="render images and a report for one audio file")
    a.add_argument("file")
    a.add_argument("--out", help="output folder (default: analysis/<file name>)")
    a.add_argument("--zoom", action="append", default=[], metavar="START-END",
                   help="extra close-up, e.g. 1:05-1:25 (repeatable)")
    args = p.parse_args()
    if not os.path.isfile(args.file):
        sys.exit(f"No such file: {args.file}")
    for z in args.zoom:
        if not re.fullmatch(r"[\d:.]+-[\d:.]+", z):
            sys.exit(f"--zoom wants START-END like 1:05-1:25, got {z!r}")
    base = re.sub(r"[^\w.-]+", "_", os.path.splitext(os.path.basename(args.file))[0])
    analyze(args.file, args.out or os.path.join("analysis", base), args.zoom)


if __name__ == "__main__":
    main()
