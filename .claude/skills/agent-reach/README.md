# agent-reach skill

Vendored from https://github.com/Panniantong/Agent-Reach (v1.6.1, MIT).

- `SKILL.md` — the English skill, rendered from `agent_reach/skill/SKILL_en.md` with the channel table filled in.
- `SKILL_zh.md` — the original Chinese skill, rendered the same way.
- `references/` — capabilities, sessions and maintenance notes the skill links to.
- `install.md`, `update.md`, `troubleshooting.md` — upstream docs for installing and updating the CLI.

The skill only describes how to drive the `agent-reach` CLI. The CLI itself is not vendored; install it once per machine:

```bash
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
agent-reach setup
```

Do not install the `agent-reach` package from PyPI; it is a different project.
