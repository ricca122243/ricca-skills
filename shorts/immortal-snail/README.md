# Immortal & Rich… but a Snail (EN short)

Original 44-second vertical cartoon (1080×1920, 30 fps) based on the "immortal snail" thought experiment.
Characters, scenes and jokes are drawn from scratch in `scene.html` (Canvas 2D).

- `script.json` — narration lines per scene, highlighted caption words, extra hold time
- `build.py` — English voice-over (edge-tts, word timings), sound effects and music (numpy), then render + mux
- `scene.html` — characters, 13 scenes, word-by-word captions
- `render.cjs` — Playwright frame capture → ffmpeg

Run: `pip install edge-tts numpy && python3 build.py` → `out/immortal-snail-en.mp4`.
Change the text in `script.json` and run again to re-voice and re-time everything.
