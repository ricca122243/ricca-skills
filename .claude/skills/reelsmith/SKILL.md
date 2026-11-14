---
name: reelsmith
description: Generate short-form videos (script -> shots -> AI clips -> voiceover -> captions -> stitched final.mp4) entirely on the local machine via a Node/TypeScript CLI run with tsx. Use when the user wants to storyboard, generate, narrate, caption, or render a short vertical/horizontal video, or asks for a "Revid"-style workflow. Not for publishing to social platforms and not for sourcing stock/viral clips.
---

# reelsmith — local short-form video generator

A CLI, not a web app. Every project is a folder under `./projects/<slug>/` you can
delete to remove all trace of it. No accounts, no telemetry — the only network
calls are to Replicate (Seedance 2.0), Google (Gemini Omni Flash), and ElevenLabs.

## Before writing or editing ANY API call

**Read the live docs first. Do not write a request shape from memory or from
this file's comments — these three APIs change fast and a stale shape fails
silently or burns money on a bad render.**

- Seedance 2.0 (video, incl. native audio / lip sync): https://replicate.com/bytedance/seedance-2.0
  (open the "API" tab on that page for the current input/output schema)
- Gemini Omni Flash (video, incl. conversational revision): https://ai.google.dev/gemini-api/docs/video
  and https://ai.google.dev/gemini-api/docs/omni
- ElevenLabs (TTS + timestamps): https://elevenlabs.io/docs
  (specifically the `text-to-speech .../with-timestamps` endpoint reference)

The current implementations (`src/lib/seedance.ts`, `src/lib/gemini.ts`,
`src/lib/elevenlabs.ts`) each carry a comment block noting exactly which
fields are unconfirmed / likely to drift. If a render fails with a schema
error, that's the first place to look — fetch the doc, diff the shape, fix
the one function, don't rewrite the pipeline.

## Setup (once) — do this before running any command that hits an API

1. `npm install`. Confirm ffmpeg is installed: `ffmpeg -version` (see
   README.md if it's missing — this skill cannot install it for you).
2. Run `npx tsx src/cli.ts env-check`. It reports which of
   `REPLICATE_API_TOKEN`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` are set,
   without ever printing a value, and exits non-zero if any are missing.
3. **If you are an AI agent running this skill and any key is missing: ask
   the user for each missing key directly in chat** — say what it's for and
   where to get it (the table in README.md), one request is fine, don't
   guess or reuse a key from anywhere else in the project or environment.
   Once given a value:
   - If `.env` doesn't exist yet, create it by copying `.env.example`.
   - Write the value into `.env` yourself (Edit/Write tool) under the
     matching key.
   - Don't echo the value back in chat after writing it.
   - Re-run `env-check` to confirm before moving on.
4. Optionally ask if they want a spend cap (`BUDGET_USD_LIMIT`) — see
   "Budget decisions" below — and write that into `.env` too if given one.

This handshake is the same regardless of which tool is driving the CLI
(Claude Code, Cursor, Codex CLI, Windsurf, Cline, or a human typing
directly) — none of it depends on Claude specifically. All commands below
run as `npx tsx src/cli.ts <command>` (or `npm run reelsmith -- <command>`),
and none of them wait on interactive stdin unless run from a real terminal
with no policy/flag given — see "Budget decisions" for the one place that
matters.

## Concepts

**Style** — `styles/<name>.json`. The look, aspect ratio, resolution, fps,
pacing hint, caption font/position/size, default ElevenLabs voice id, and a
`shotPromptPreamble` string prepended to every shot prompt sent to the video
model. Two are included (`tiktok-energetic`, `calm-landscape`) — copy one to
make a new look rather than repeating style instructions in prose every time.

**Project** — `projects/<slug>/`:
- `project.json` — `{ slug, style }`, which style this project inherits.
- `brief.md` — audience, goal, key message, target length. Fill this in with
  the user before writing a script.
- `script.md` — the beat-by-beat prose script, for human review before it's
  broken into shots.
- `shots.json` — the actual render spec: an array of shots (see schema
  below). This is what `render` reads.
- `render/` — `clips/` (per-shot final output), `audio/` (narration + .ass
  caption files), `cache/` (raw model output, keyed by content hash),
  `final.mp4` (stitched output).

**Shot** (one entry in `shots.json`):
```jsonc
{
  "id": "shot1",                 // unique within the project
  "engine": "seedance",          // "seedance" | "gemini" — see choice below
  "prompt": "...",               // shot-specific description; style preamble is prepended automatically
  "durationSeconds": 5,
  "nativeAudio": true,           // seedance only: model generates dialogue/lip-sync audio itself
  "voiceover": {                 // mutually exclusive with nativeAudio in practice
    "text": "...",
    "voiceId": "..."             // optional override of style.voiceId
  },
  "referenceImages": ["..."],    // optional image-to-video references
  "forceRegenerate": false       // optional: bypass cache for this shot
}
```

**Engine choice, per shot:**
- `seedance` (Seedance 2.0) — when the shot needs native audio generated
  with the video (dialogue, lip sync, synced SFX).
- `gemini` (Gemini Omni Flash) — when the user wants to iterate on the shot
  conversationally ("make it slower", "change the background") without
  re-writing the prompt from scratch. Cheaper/faster for that loop.

**Voiceover vs. native audio** — a shot has one or the other, not both.
Voiceover shots get narrated by ElevenLabs; the returned word timings drive
caption burn-in styled from the style file. Native-audio shots keep the
video model's own audio track and are not captioned by this pipeline (the
model already produced synced dialogue).

**Caching** — every generated clip is cached under
`projects/<slug>/render/cache/<hash>.mp4`, where the hash covers the shot's
engine, prompt, duration, reference images, voiceover text/voice, and the
*entire* style object. Change any of those (including switching styles) and
it's treated as a new clip — nothing stale is ever reused across a style
change. Re-running `render` after editing one shot only regenerates that
shot; everything else is a cache hit.

**Budget** — set `BUDGET_USD_LIMIT` in `.env` to cap lifetime spend across
every project, tracked in a shared ledger (`.reelsmith-spend.json`,
gitignored). Hitting the cap does **not** stop the render: it triggers a
decision (interactive menu in a real terminal; a configurable policy
otherwise) with real alternatives — switch the shot to the cheaper engine,
render it anyway, skip it (placeholder clip, render continues), or stop.
Nothing is ever silently force-stopped; `abort` is one choice among several,
not the default. See "Budget decisions" below — this is the part to read
before wiring an agent up to run `render` unattended.

## Choosing a model per shot, with real costs

Engine is set per shot in `shots.json` (`"engine": "seedance" | "gemini"`),
but that's a starting point, not final: `npx tsx src/cli.ts plan <slug>`
shows both engines' cost for every shot and — in a real terminal — lets you
pick per shot interactively, writing the choice back to `shots.json`. In a
non-interactive context (piped output, an agent driving the CLI) `plan`
just prints the cost table; nothing changes automatically, since there's no
one to ask.

## Budget decisions

When a shot's cost would push lifetime spend over `BUDGET_USD_LIMIT`,
`render` calls out to a decision instead of throwing:

1. **`--on-budget <policy>` flag on this run** wins if given — the way an
   agent should drive this deterministically without a TTY:
   `ask | skip | downgrade | allow | abort`.
2. **A persisted default** — `npx tsx src/cli.ts config set-on-budget <policy>`
   remembers a policy across sessions in `.reelsmith-config.json` (gitignored,
   machine-local, not a secret).
3. **An interactive menu**, in a real terminal, if neither of the above is
   set — shows the alternative engine's cost, lets you switch/allow/skip/stop,
   and optionally remembers the choice (as a policy default, or for that one
   shot specifically via `config set-shot-engine <slug> <shotId> <engine>`).
4. **Otherwise (no policy, no TTY — the path an AI agent hits by default)**:
   the shot is skipped (a labeled placeholder clip stands in so the final
   video still stitches) and a clear message is printed with the exact
   commands available to get a different outcome. The render keeps going
   and still finishes — check the output for what got skipped.

`--ignore-budget` is a deprecated shorthand for `--on-budget allow`.
`downgrade` switches engine (seedance <-> gemini) for just that shot;
`allow` renders it anyway, over cap; `abort` stops the render cleanly at
that shot (already-finished shots and cache are kept — re-running `render`
picks up where it left off for free on anything cached).

## Typical workflow

1. `npx tsx src/cli.ts styles` — see available looks, or add a new
   `styles/<name>.json` copied from an existing one.
2. `npx tsx src/cli.ts init <slug> --style <name>` — scaffold the project.
3. Fill in `brief.md` with the user, then draft `script.md`.
4. Turn the script into `shots.json` — one shot per beat, picking engine and
   voiceover/native-audio per shot.
5. `npx tsx src/cli.ts estimate <slug>` — sanity-check cost before spending
   real API calls. `plan <slug>` gives the same numbers per-engine and lets
   you switch. Prices in `src/lib/estimate.ts` are rough defaults, not
   fetched live — see README.md for how to get current numbers.
6. `npx tsx src/cli.ts render <slug>` — generates any uncached shots, burns
   captions where there's voiceover, and stitches `render/final.mp4`. See
   "Budget decisions" above for what happens if a shot would exceed
   `BUDGET_USD_LIMIT`.
7. To revise one shot: edit it in `shots.json`, then
   `npx tsx src/cli.ts render <slug> --shot <id>` (or add `--force` to bypass
   cache without changing the prompt).

## Out of scope

Do not add publishing/upload flows for TikTok, Instagram, or YouTube. Do not
add a stock-footage or viral-clip library — every shot is generated fresh.
Do not build a web UI; the CLI + this file are the interface.
