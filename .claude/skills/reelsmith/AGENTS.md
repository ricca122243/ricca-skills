# Agent instructions

Read `SKILL.md` before doing anything in this repo — it is the full
workflow (projects, styles, shots.json schema, engine choice, caching) and
the mandate to check live API docs before writing any model call. `README.md`
has install/env/ffmpeg/cost details.

Before the first render: run `npx tsx src/cli.ts env-check`. If it reports
missing keys, ask the user for each one in chat and write them into `.env`
yourself (see `SKILL.md`'s "Setup" section) — don't guess, don't skip it.

This file exists because several agentic CLIs (Codex CLI, opencode, Aider,
Amp, and others) auto-read `AGENTS.md` by convention. Claude Code instead
auto-reads `SKILL.md`'s frontmatter — see the "Install" section of
`README.md` for how to register this repo as a Claude Code skill.
