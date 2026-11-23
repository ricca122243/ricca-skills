"""Build the 'Immortal & Rich, but a Snail' short.

Steps: TTS per scene (edge-tts, cached) -> timeline.json -> audio mix (numpy)
-> frames via Playwright (render.js) -> final mp4 (ffmpeg).

Usage: python3 build.py [--frames-only N] [--no-video]
"""
import asyncio, json, os, re, ssl, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "tts")
SR = 44100
FPS = 30
PAD_BEFORE = 0.18   # silence before each line inside its scene
PAD_AFTER = 0.40    # hold after each line
END_HOLD = 1.6      # extra hold on the last scene

os.makedirs(CACHE, exist_ok=True)


# ---------------------------------------------------------------- TTS
async def tts(text, voice, rate, path):
    import edge_tts, edge_tts.communicate as c
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        c._SSL_CTX = ssl.create_default_context(cafile=ca)
    com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words = []
    with open(path, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"w": ch["text"], "s": ch["offset"] / 1e7, "d": ch["duration"] / 1e7})
    json.dump(words, open(path + ".json", "w"))


def load_audio(path):
    """Decode any audio file to mono float32 at SR via ffmpeg."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


# ---------------------------------------------------------------- SFX synth
rng = np.random.default_rng(7)


def env(n, a=0.005, r=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if r:
        e *= np.exp(-t / r)
    return e


def lowpass(x, k):
    k = max(1, int(k))
    return np.convolve(x, np.ones(k) / k, mode="same")


def sfx_whoosh(d=0.38):
    n = int(SR * d)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep: blend from heavy to light low-pass
    for i, k in enumerate(np.linspace(40, 4, 8)):
        seg = slice(i * n // 8, (i + 1) * n // 8)
        out[seg] = lowpass(noise, k)[seg]
    t = np.linspace(0, 1, n)
    return out * np.sin(np.pi * t) ** 2 * 0.5


def sfx_pop():
    n = int(SR * 0.12)
    t = np.arange(n) / SR
    f = np.linspace(280, 1100, n)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.035) * 0.6


def sfx_knock():
    n = int(SR * 0.12)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 140 * t) * env(n, 0.001, 0.03)
    click = lowpass(rng.standard_normal(n), 6) * env(n, 0.0005, 0.008)
    return (body * 0.9 + click * 0.7) * 0.9


def sfx_boom(d=1.4):
    n = int(SR * d)
    t = np.arange(n) / SR
    f = 70 * np.exp(-t * 1.2) + 35
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, 0.45)
    rumble = lowpass(rng.standard_normal(n), 60) * env(n, 0.003, 0.3) * 3
    return (tone + rumble) * 0.8


def sfx_rumble(d=2.6):
    n = int(SR * d)
    x = np.cumsum(rng.standard_normal(n))
    x = x - lowpass(x, 2000)
    x = lowpass(x, 25)
    x /= np.abs(x).max() + 1e-9
    t = np.linspace(0, 1, n)
    return x * np.minimum(1, t * 6) * np.minimum(1, (1 - t) * 3) * 0.7


def sfx_ding():
    n = int(SR * 1.0)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * t) * a for f, a in [(1318.5, 1), (1760, 0.6), (2637, 0.25)])
    return s * env(n, 0.002, 0.25) * 0.35


def sfx_stamp():
    n = int(SR * 0.25)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 90 * t) * env(n, 0.001, 0.06) + lowpass(rng.standard_normal(n), 3) * env(n, 0.0005, 0.02) * 0.6) * 0.8


def sfx_slurp():
    n = int(SR * 0.45)
    t = np.arange(n) / SR
    f = 300 + 250 * np.sin(2 * np.pi * 7 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / t[-1]) * 0.25


# ---------------------------------------------------------------- music
def pluck(freq, d, decay=0.996):
    """Karplus-Strong plucked string."""
    n = int(SR * d)
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = decay * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def music(total):
    bpm = 104
    beat = 60 / bpm
    n = int(SR * total) + SR
    out = np.zeros(n)
    # I - vi - IV - V in C, playful arpeggio (8ths) + bass on beats 1 and 3
    chords = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]
    bass = [36, 33, 29, 31]
    pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    cache = {}

    def pl(m, d, dec):
        k = (m, d, dec)
        if k not in cache:
            cache[k] = pluck(note(m), d, dec)
        return cache[k]

    bar = 0
    t = 0.0
    while t < total + 0.5:
        ch = chords[bar % 4]
        for i, idx in enumerate(pattern):
            s = int((t + i * beat / 2) * SR)
            x = pl(ch[idx], 0.5, 0.994) * 0.16
            out[s:s + len(x)] += x[: max(0, n - s)]
        for i in (0, 2):
            s = int((t + i * beat) * SR)
            x = pl(bass[bar % 4], 0.9, 0.997) * 0.32
            out[s:s + len(x)] += x[: max(0, n - s)]
        # soft shaker on off-beats
        for i in range(4):
            s = int((t + (i + 0.5) * beat) * SR)
            m = int(SR * 0.05)
            x = rng.standard_normal(m) * env(m, 0.001, 0.012) * 0.05
            out[s:s + m] += x[: max(0, n - s)]
        bar += 1
        t += 4 * beat
    out = out[: int(SR * total)]
    fade = int(SR * 1.2)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


# ---------------------------------------------------------------- main
def norm_word(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())


def main():
    spec = json.load(open(os.path.join(HERE, "script.json")))
    voice, rate = spec["voice"], spec["rate"]

    # 1. TTS
    lines = []
    for i, sc in enumerate(spec["scenes"]):
        p = os.path.join(CACHE, f"{i:02d}_{sc['id']}.mp3")
        meta = p + ".txt"
        key = f"{voice}|{rate}|{sc['text']}"
        if not (os.path.exists(p) and os.path.exists(meta) and open(meta).read() == key):
            print("tts:", sc["text"])
            asyncio.run(tts(sc["text"], voice, rate, p))
            open(meta, "w").write(key)
        a = load_audio(p)
        # trim trailing silence
        nz = np.where(np.abs(a) > 0.01)[0]
        a = a[: (nz[-1] + int(0.05 * SR)) if len(nz) else len(a)]
        lines.append((a, json.load(open(p + ".json"))))

    # 2. timeline
    scenes, words, t = [], [], 0.0
    for i, (sc, (a, ws)) in enumerate(zip(spec["scenes"], lines)):
        dur = PAD_BEFORE + len(a) / SR + PAD_AFTER + sc.get("hold", 0) + (END_HOLD if i == len(lines) - 1 else 0)
        hl = set(sc.get("hl", []))
        sw = []
        for w in ws:
            s = t + PAD_BEFORE + w["s"]
            sw.append({"w": w["w"], "s": round(s, 3), "e": round(s + w["d"], 3),
                       "hl": norm_word(w["w"]) in hl, "scene": i})
        scenes.append({"id": sc["id"], "start": round(t, 3), "dur": round(dur, 3),
                       "words": [{"w": norm_word(x["w"]), "s": round(x["s"] - t, 3)} for x in sw]})
        words += sw
        t += dur
    total = round(t, 3)
    # caption display end: until the next word, unless a long pause
    for a, b in zip(words, words[1:]):
        a["until"] = b["s"] if b["s"] - a["e"] < 0.35 else a["e"] + 0.25
    words[-1]["until"] = words[-1]["e"] + 0.4
    tl = {"fps": FPS, "total": total, "scenes": scenes, "words": words}
    json.dump(tl, open(os.path.join(OUT, "timeline.json"), "w"), indent=1)
    print(f"total {total:.2f}s, {len(scenes)} scenes")

    def wt(sid, word, nth=0):
        sc = next(s for s in scenes if s["id"] == sid)
        hits = [w["s"] for w in sc["words"] if w["w"] == word]
        return sc["start"] + hits[nth]

    def st(sid):
        return next(s for s in scenes if s["id"] == sid)["start"]

    # 3. audio
    n = int(SR * (total + 0.5))
    voice_tr = np.zeros(n)
    for sc, (a, _) in zip(scenes, lines):
        s = int((sc["start"] + PAD_BEFORE) * SR)
        voice_tr[s:s + len(a)] += a
    fx = np.zeros(n)

    def put(x, at, g=1.0):
        s = int(at * SR)
        if s < 0 or s >= n:
            return
        x = x[: n - s]
        fx[s:s + len(x)] += x * g

    for sc in scenes[1:]:
        put(sfx_whoosh(), sc["start"] - 0.2, 0.35)
    put(sfx_ding(), wt("rich", "billion"), 0.8)
    put(sfx_pop(), wt("catch", "snail"), 0.9)
    put(sfx_slurp(), wt("catch", "coming"), 0.6)
    put(sfx_boom(), wt("threat", "die"), 0.9)
    put(sfx_pop(), wt("walk", "walk"), 0.5)
    put(sfx_knock(), wt("night", "knock") + 0.05, 1.0)
    put(sfx_knock(), wt("night", "knock") + 0.28, 1.0)
    put(sfx_rumble(3.2), st("launch") + 0.6, 0.9)
    put(sfx_stamp(), wt("mars", "hundred"), 1.0)
    put(sfx_rumble(1.6), st("landing") + 0.1, 0.6)
    put(sfx_knock(), st("landing") + next(s for s in scenes if s["id"] == "landing")["dur"] * 0.55, 0.8)
    put(sfx_ding(), wt("twist", "billion"), 0.9)
    put(sfx_pop(), st("end") + 0.1, 0.7)

    mus = music(total)
    mus_tr = np.zeros(n)
    mus_tr[: len(mus)] = mus
    # duck music under the voice
    venv = lowpass(np.abs(voice_tr), int(0.15 * SR))
    duck = 1 - 0.45 * np.clip(venv / (venv.max() + 1e-9) * 4, 0, 1)
    mix = voice_tr * 1.0 + fx * 0.8 + mus_tr * 0.55 * duck
    mix /= max(1.0, np.abs(mix).max() / 0.95)
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, "mix.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print("audio ok")

    if "--no-video" in sys.argv:
        return

    # 4. frames -> video
    args = ["node", os.path.join(HERE, "render.cjs"), os.path.join(OUT, "timeline.json"), os.path.join(OUT, "video.mp4")]
    if "--frames-only" in sys.argv:
        args.append(sys.argv[sys.argv.index("--frames-only") + 1])
    subprocess.run(args, check=True)
    if "--frames-only" in sys.argv:
        return

    final = os.path.join(OUT, "immortal-snail-en.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(OUT, "video.mp4"), "-i", os.path.join(OUT, "mix.wav"),
                    "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k",
                    "-ar", "44100", "-shortest", "-movflags", "+faststart", final], check=True)
    print("done:", final)


if __name__ == "__main__":
    main()
