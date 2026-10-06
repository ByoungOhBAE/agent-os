"""Find the moments a video's burned-in subtitle changes and capture them.

Stdlib + ffmpeg/ffprobe only (no Pillow). Commands:

  detect  VIDEO OUT [--band Y,H] [--start S] [--end E]
          -> OUT/kept.json  {"kept": [t...], "candidates": n, ...}
  check   VIDEO OUT --at T [--band Y,H]
          -> OUT/check/band_<T>.jpg     full frame with the band drawn (is the band on the subtitle?)
          -> OUT/check/ref_<T>.jpg      0.5 s strips for 60 s from T; label ends with * where detect fired
  score   OUT --truth TRUTH.json
          TRUTH.json = {"<window start>": [onset seconds you counted by eye], ...}
          -> prints RECALL hit/total and the missed onsets (exit 1 if any miss)
  sheets  VIDEO OUT [--skip-times FILE]
          -> OUT/strips/*.png + OUT/sheets/sheet_NN.jpg (120 labelled subtitle strips per sheet)
  frames  VIDEO OUT T [T ...] | --all
          -> OUT/frames/frame_<m>m<ss>s<ms>ms.jpg full frames (720p source size)

How detect works (two passes, union; measured 68/68 subtitle changes over 2 videos / 6 windows):
  A. scene pass: crop the subtitle band, keep only near-white pixels, ffmpeg scene score > 0.20 between
     consecutive frames (hard cuts). Detections less than 1.0 s after the FIRST detection of a burst are one
     change; keep the last (settled) one.
  B. reference pass: 8 fps, band shrunk to 192x12 and binarized; compare each frame with the last SETTLED
     subtitle, fire when it differs > 5 % and has stopped moving (or after 1.5 s). Catches cross-fades and
     same-box text swaps that pass A misses frame-to-frame (pass A alone: 20/23 in a fast window).
  Union of A and B, dropping a time < 0.4 s after the previous one.
  No pixel dedupe and no "is this text" filter: both were tried and dropped real changes.
  Expect extra frames (~1 per real change: hand motion, cuts, text animation). Recall is the priority.
"""
import argparse, bisect, json, re, subprocess, sys
from pathlib import Path

SCENE, GAP = 0.20, 1.0
FONT = "C\\:/Windows/Fonts/arial.ttf" if sys.platform == "win32" else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def band_filter(band):
    y, h = band
    return f"crop=iw*0.8:ih*{h}:iw*0.1:ih*{y}"


def parse_band(s):
    y, h = (float(v) for v in s.split(","))
    if not (0 <= y < 1 and 0 < h <= 1 and y + h <= 1):
        raise SystemExit(f"bad --band {s}: need Y,H fractions with Y+H<=1")
    return y, h


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        raise SystemExit(f"command failed ({r.returncode}): {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r


def duration(video):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video])
    return float(r.stdout.strip())


def label(t):
    return f"{int(t // 60):02d}\\:{int(t % 60):02d}.{int(round((t % 1) * 10)) % 10}"


def merge_bursts(times):
    kept, start = [], None
    for t in times:
        if start is not None and t - start < GAP:
            kept[-1] = round(t, 2)
        else:
            kept.append(round(t, 2)); start = t
    return kept


SIG_W, SIG_H, SIG_FPS, SIG_TH = 192, 12, 8, 200
REF_T, STILL, MAXWAIT, UNION_GAP = 0.05, 0.012, 1.5, 0.4
_BIN = bytes(1 if v > SIG_TH else 0 for v in range(256))


def _diff(a, b):
    """Share of differing pixels between two 0/1 byte strings."""
    return (int.from_bytes(a, "big") ^ int.from_bytes(b, "big")).bit_count() / len(a)


def scene_pass(video, band, start, end):
    """Pass A: frame-to-frame scene score on the binarized band (fast cuts)."""
    vf = f"{band_filter(band)},format=gray,lutyuv=y='if(gt(val,215),255,0)',select='gt(scene,{SCENE})',showinfo"
    r = run(["ffmpeg", "-hide_banner", "-ss", str(start), "-t", str(end - start), "-i", video, "-vf", vf, "-f", "null", "-"])
    cands = [round(float(t) + start, 3) for t in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    return cands, merge_bursts(cands)


def ref_pass(video, band, start, end):
    """Pass B: compare each frame with the last SETTLED subtitle (cross-fades, slow wipes).
    A change fires when the band differs > REF_T from the reference and has stopped moving."""
    y, h = band
    vf = f"crop=iw*0.8:ih*{h}:iw*0.1:ih*{y},scale={SIG_W}:{SIG_H}:flags=area,format=gray,fps={SIG_FPS}"
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(start), "-t", str(end - start),
                          "-i", video, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
    n, size = len(raw) // (SIG_W * SIG_H), SIG_W * SIG_H
    sig = [raw[i * size:(i + 1) * size].translate(_BIN) for i in range(n)]
    kept, pending = [], None
    if not sig:
        return kept
    ref = sig[0]
    for i in range(1, n):
        t, cur = start + i / SIG_FPS, sig[i]
        if pending is None and _diff(cur, ref) > REF_T:
            pending = t
        if pending is not None and (_diff(cur, sig[i - 1]) <= STILL or t - pending >= MAXWAIT):
            if _diff(cur, ref) > REF_T:
                kept.append(round(t, 3)); ref = cur
            pending = None
    return kept


def detect(video, out, band, start=0.0, end=None):
    dur = duration(video)
    end = dur if end is None else min(end, dur)
    cands, a = scene_pass(video, band, start, end)
    b = ref_pass(video, band, start, end)
    kept = []
    for t in sorted(set(a) | set(b)):
        if not kept or t - kept[-1] >= UNION_GAP:
            kept.append(t)
    out.mkdir(parents=True, exist_ok=True)
    data = {"video": str(video), "band": list(band), "start": start, "end": end, "duration": dur,
            "scene": SCENE, "gap": GAP, "ref_t": REF_T, "union_gap": UNION_GAP, "candidates": len(cands),
            "scene_kept": len(a), "ref_kept": len(b), "kept": kept}
    (out / "kept.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    print(f"DETECT_OK candidates={len(cands)} scene={len(a)} ref={len(b)} kept={len(kept)} range={start:.1f}-{end:.1f}s")
    return data


def strip(video, t, band, dest, text, width=400):
    vf = (f"{band_filter(band)},scale={width}:-2,pad=iw+70:ih:70:0:white,"
          f"drawtext=fontfile='{FONT}':text='{text}':x=3:y=(h-th)/2:fontsize=15:fontcolor=red")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.3f}", "-i", video,
         "-frames:v", "1", "-vf", vf, str(dest)])


def tile(src_pattern, count, dest_pattern, per=120, cols=3):
    rows = (min(count, per) + cols - 1) // cols
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-i", src_pattern,
         "-vf", f"tile={cols}x{rows}:padding=3:color=white", "-q:v", "3", dest_pattern])


def check(video, out, at, band):
    d = out / "check"; d.mkdir(parents=True, exist_ok=True)
    y, h = band
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{at + 2:.2f}", "-i", video, "-frames:v", "1",
         "-vf", f"drawbox=x=iw*0.1:y=ih*{y}:w=iw*0.8:h=ih*{h}:color=red@0.9:t=3", str(d / f"band_{int(at)}.jpg")])
    win = d / f"ref_{int(at)}"; win.mkdir(exist_ok=True)
    for f in win.glob("*.png"): f.unlink()
    k = json.loads((out / "kept.json").read_text(encoding="utf-8"))["kept"] if (out / "kept.json").exists() else []
    for i in range(120):
        t = at + i * 0.5
        hit = any(t - 0.5 < x <= t for x in k)
        strip(video, t, band, win / f"r_{i:03d}.png", label(t) + (" *" if hit else ""), width=380)
    tile(str(win / "r_%03d.png"), 120, str(d / f"ref_{int(at)}.jpg"))
    print(f"CHECK_OK band={d / f'band_{int(at)}.jpg'} ref={d / f'ref_{int(at)}.jpg'} detections_in_window="
          f"{sum(1 for x in k if at <= x < at + 60)}")


def score(out, truth_file):
    k = json.loads((out / "kept.json").read_text(encoding="utf-8"))["kept"]
    truth = json.loads(Path(truth_file).read_text(encoding="utf-8"))
    tot = hit = 0; miss = []; extra = 0
    for start, onsets in truth.items():
        s = float(start)
        win = [x for x in k if s <= x < s + 60]
        for o in onsets:
            tot += 1
            if any(o - 0.75 <= x <= o + 1.25 for x in win): hit += 1
            else: miss.append(o)
        extra += max(0, len(win) - len(onsets))
    print(f"RECALL {hit}/{tot} missed={miss} extra_frames~{extra}")
    if miss or not tot:
        sys.exit(1)
    print("SCORE_OK")


def sheets(video, out, skip_file=None):
    data = json.loads((out / "kept.json").read_text(encoding="utf-8"))
    k, band = data["kept"], tuple(data["band"])
    skip = sorted(json.loads(Path(skip_file).read_text(encoding="utf-8"))) if skip_file else []
    ends = k[1:] + [data["end"]]
    # an event is skipped when an already-viewed frame time falls inside [start, next start)
    todo = [t for t, e in zip(k, ends) if not (skip and bisect.bisect_left(skip, t) < len(skip)
                                               and skip[bisect.bisect_left(skip, t)] < e)]
    sd, sh = out / "strips", out / "sheets"
    for d in (sd, sh):
        d.mkdir(parents=True, exist_ok=True)
        for f in d.glob("*.*"): f.unlink()
    for i, t in enumerate(todo):
        strip(video, t + 0.25, band, sd / f"s_{i:04d}.png", label(t))
    for n in range(0, len(todo), 120):
        part = sh / f"part_{n // 120:02d}"; part.mkdir(exist_ok=True)
        for j, i in enumerate(range(n, min(n + 120, len(todo)))):
            (sd / f"s_{i:04d}.png").replace(part / f"p_{j:03d}.png")
        tile(str(part / "p_%03d.png"), min(120, len(todo) - n), str(sh / f"sheet_{n // 120 + 1:02d}.jpg"))
    (out / "sheets.json").write_text(json.dumps({"times": todo, "per_sheet": 120}, indent=1), encoding="utf-8")
    print(f"SHEETS_OK events={len(k)} on_sheets={len(todo)} skipped={len(k) - len(todo)} "
          f"sheets={(len(todo) + 119) // 120}")


def frames(video, out, times):
    d = out / "frames"; d.mkdir(parents=True, exist_ok=True)
    for t in times:
        ms = int(round(t * 1000))
        name = f"frame_{ms // 60000}m{(ms // 1000) % 60:02d}s{ms % 1000:03d}ms.jpg"
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t + 0.25:.3f}", "-i", video,
             "-frames:v", "1", "-q:v", "2", str(d / name)])
    print(f"FRAMES_OK {len(times)} -> {d}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("cmd", choices=["detect", "check", "score", "sheets", "frames"])
    p.add_argument("args", nargs="*")
    p.add_argument("--band", default="0.83,0.10")
    p.add_argument("--start", type=float, default=0.0)
    p.add_argument("--end", type=float)
    p.add_argument("--at", type=float)
    p.add_argument("--truth")
    p.add_argument("--skip-times")
    p.add_argument("--all", action="store_true")
    a = p.parse_args()
    band = parse_band(a.band)
    if a.cmd == "score":
        return score(Path(a.args[0]), a.truth)
    video, out = a.args[0], Path(a.args[1])
    if a.cmd == "detect":
        detect(video, out, band, a.start, a.end)
    elif a.cmd == "check":
        if a.at is None: raise SystemExit("check needs --at SECONDS")
        check(video, out, a.at, band)
    elif a.cmd == "sheets":
        sheets(video, out, a.skip_times)
    elif a.cmd == "frames":
        k = json.loads((out / "kept.json").read_text(encoding="utf-8"))["kept"] if a.all else [float(x) for x in a.args[2:]]
        frames(video, out, k)


if __name__ == "__main__":
    main()
