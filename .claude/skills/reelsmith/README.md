# reelsmith

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Claude Code **skill** for generating short-form videos locally — script to
shots to AI clips to voiceover to burned-in captions to a stitched
`final.mp4`. Not a Revid/CapCut clone with a web UI: the interface is
`SKILL.md` plus a plain Node/TypeScript CLI run with `tsx`, no build step.
ffmpeg does every crop, mux, and caption burn-in. No accounts, no telemetry
— the only network traffic is to Replicate (Seedance 2.0), Google (Gemini
Omni Flash), and ElevenLabs.

See `SKILL.md` for the agent-facing workflow and `CONTRIBUTING.md` to send a PR.

## Install

### 1. Install ffmpeg

ffmpeg does every crop/scale/mux/caption burn-in/concat step, so it has to
be on `PATH` before anything else works:

- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: `winget install ffmpeg` (or https://ffmpeg.org/download.html)

Verify: `ffmpeg -version`.

### 2. Get the skill onto disk

**Claude Code** — clone straight into the skills folder so it's
auto-discovered from `SKILL.md`'s frontmatter:

```bash
git clone https://github.com/karamusluk/reelsmith-claude-skill ~/.claude/skills/reelsmith
# or, project-scoped instead of user-wide:
git clone https://github.com/karamusluk/reelsmith-claude-skill <project>/.claude/skills/reelsmith
cd <that path>
npm install
```

**Any other AI coding tool** (Cursor, Windsurf, Cline, Codex CLI, opencode,
Aider, Amp, or a human terminal) — clone anywhere and point the tool at the
folder; nothing here is Claude-specific, it's a plain Node/TypeScript CLI
with no Claude API or MCP dependency:

```bash
git clone https://github.com/karamusluk/reelsmith-claude-skill
cd reelsmith-claude-skill
npm install
```

Instruction discovery differs per tool, so this repo ships the file each
one auto-reads (all of them just point at `SKILL.md`, so there's one source
of truth):

| Tool | Auto-read file |
|---|---|
| Claude Code | `SKILL.md` (frontmatter) |
| Codex CLI, opencode, Aider, Amp, and other `AGENTS.md`-convention tools | `AGENTS.md` |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Anything else | manually paste/attach `SKILL.md` as context |

The CLI itself is identical everywhere: `npx tsx src/cli.ts <command>`.

### 3. API keys — let the AI tool ask you for them

Don't hand-edit `.env` yourself unless you want to. Once the skill is
installed, just start using it (e.g. ask the tool to "make me a 10 second
video") — the first thing `SKILL.md` tells any agent to do is run:

```bash
npx tsx src/cli.ts env-check
```

which reports which of the three keys below are missing (never the values
themselves) and exits non-zero if any are. `SKILL.md` then instructs the
agent to **ask you for each missing key in chat**, right there, and write
it into `.env` itself (creating it from `.env.example` first if needed) —
you never have to leave the conversation or touch the file by hand. This is
the same handshake in Claude Code, Cursor, Codex CLI, or anything else
that reads `SKILL.md`.

Prefer to do it yourself instead: `cp .env.example .env` and fill in:

| Key | Where to get it | Used for |
|---|---|---|
| `REPLICATE_API_TOKEN` | https://replicate.com/account/api-tokens | Seedance 2.0 video generation |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | Gemini Omni Flash video generation |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys | Narration + word-level timestamps for captions |

`.env` is gitignored — nothing you type ever gets committed.

## Usage

```bash
npx tsx src/cli.ts styles
npx tsx src/cli.ts init my-video --style tiktok-energetic
# fill in projects/my-video/brief.md, script.md, shots.json
npx tsx src/cli.ts estimate my-video
npx tsx src/cli.ts render my-video
npx tsx src/cli.ts render my-video --shot shot2   # re-render one shot
npx tsx src/cli.ts cache-clear my-video           # drop cached generated clips
```

Full concepts (styles, shots.json schema, engine choice, caching, project
layout) are documented in `SKILL.md`.

## Cost estimate: a 30-second video

Worked example — 6 shots of 5 seconds each, 3 with ElevenLabs voiceover
(~12 words / ~70 characters apiece), aspect ratio doesn't affect price.

Prices below are **rough placeholders** (`src/lib/estimate.ts`,
`DEFAULT_PRICES`) — none of the three vendors publish a single stable
per-second/per-character rate in a machine-readable way, and Seedance 2.0
pricing in particular is shown per-model on its Replicate page and can
change with the model version. **Check before a real render:**

- Seedance 2.0 price: the "Run" tab at https://replicate.com/bytedance/seedance-2.0
- Gemini Omni Flash: https://ai.google.dev/gemini-api/docs/pricing
- ElevenLabs: https://elevenlabs.io/pricing (character-based, tier-dependent)

| Shot | Engine | Seconds | Voiceover chars | Video cost | Voiceover cost |
|---|---|---|---|---|---|
| 1 | seedance | 5 | — | $1.50 | — |
| 2 | seedance | 5 | — | $1.50 | — |
| 3 | gemini | 5 | 70 | $0.50 | $0.013 |
| 4 | gemini | 5 | 70 | $0.50 | $0.013 |
| 5 | seedance | 5 | — | $1.50 | — |
| 6 | gemini | 5 | 70 | $0.50 | $0.013 |

At the placeholder rates (`seedancePerSecond=$0.30`,
`geminiOmniFlashPerSecond=$0.10`, `elevenlabsPerThousandChars=$0.18`):

- Video generation: 3×$1.50 (seedance) + 3×$0.50 (gemini) = **$6.00**
- Voiceover: 3×$0.013 = **$0.04**
- **Total: ≈ $6.04** for 30 seconds of finished video

Run `npx tsx src/cli.ts estimate <slug>` against your actual `shots.json`
for a real number, and update `DEFAULT_PRICES` in `src/lib/estimate.ts`
once you've confirmed current rates from the links above — the estimate
command never fetches prices live.

### Choosing a model per shot

`shots.json` sets an engine per shot, but you don't have to guess costs by
hand:

```bash
npx tsx src/cli.ts plan my-video
```

In a real terminal this walks every shot, shows what seedance vs. gemini
would cost for it, and lets you switch — writing the choice back into
`shots.json`. Piped or run by an agent (no TTY), it just prints the cost
table and changes nothing, since there's no one to ask.

### Enforcing a budget

Set `BUDGET_USD_LIMIT` in `.env` to a lifetime USD cap across every
project, tracked in a shared ledger (`.reelsmith-spend.json`, gitignored;
cache hits never touch it). **Hitting the cap doesn't stop the render** —
it hands you (or whatever's driving the CLI) a real choice instead:

```bash
npx tsx src/cli.ts render my-video
# [shot3] over budget by $0.30 (spent $5.70 of $6.00 cap) — no --on-budget
# policy set and no TTY to ask, so this shot is being SKIPPED (silent
# placeholder). To get a different outcome, re-run with one of:
#   --on-budget allow      render it anyway (~$1.50, over budget)
#   --on-budget downgrade  switch to gemini (~$0.50)
#   --on-budget skip       keep skipping silently (removes this warning)
```

In a real terminal with no policy set, that becomes an interactive menu
(switch engine / render anyway / skip / stop), with an option to remember
the answer. Either way the render **keeps going and still finishes** —
`abort` is one menu choice, not the default:

```bash
npx tsx src/cli.ts budget                                  # spend so far + remaining cap
npx tsx src/cli.ts render my-video --on-budget allow        # over budget, just this run
npx tsx src/cli.ts render my-video --on-budget downgrade    # switch to the cheaper engine
npx tsx src/cli.ts config set-on-budget downgrade           # make that the default from now on
npx tsx src/cli.ts config set-fallback-engine gemini        # engine "downgrade" switches to
npx tsx src/cli.ts config set-shot-engine my-video shot3 gemini  # pin one shot's engine
npx tsx src/cli.ts config show                              # see what's persisted
```

`.reelsmith-config.json` (gitignored, machine-local) is where all of this
is remembered across sessions — it's preferences, not a secret.
`--ignore-budget` is a deprecated shorthand for `--on-budget allow`.

## Project layout

```
styles/<name>.json          look, aspect ratio, captions, voice, prompt preamble
projects/<slug>/
  project.json               { slug, style }
  brief.md
  script.md
  shots.json                 render spec (see SKILL.md)
  render/
    cache/                   raw generated clips, keyed by content hash
    audio/                   ElevenLabs narration + .ass caption files
    clips/                   per-shot final (scaled/cropped/captioned) output
    final.mp4                stitched result
```

## Out of scope

No publishing to TikTok/Instagram/YouTube. No stock or viral-clip library —
every shot is generated fresh via the three model APIs above. No web UI.

## Contributing

See `CONTRIBUTING.md`. Participation is governed by `CODE_OF_CONDUCT.md`.

## License

MIT — see `LICENSE`.
