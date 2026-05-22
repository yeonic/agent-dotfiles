# experimental-injector

Reads `docs/experimental/*.md` at the start of every pi turn and appends them
to the system prompt under an "Experimental Rules" section.

## Why

Rules in `docs/integrated/` are committed to `AGENTS.md` (via `build.sh`) and
visible to all agents (pi, Codex, Claude Code). Rules in `docs/experimental/`
are tested live by pi only — no rebuild, no commit needed to try them out.

## Workflow

```
1. Notice a pain point in agent behavior.
2. Add a new rule:  docs/experimental/<slug>.md
     (or via the symlink:  ~/.pi/agent/experimental/<slug>.md)
3. Start a new pi session (or /reload). The rule is active.
4. Evaluate over real tasks.
5a. Works well -> git mv docs/experimental/<slug>.md docs/integrated/
                  ./build.sh
                  Now permanent and cross-tool.
5b. Doesn't help -> rm docs/experimental/<slug>.md
```

## Override location

`PI_EXPERIMENTAL_DIR` env var overrides the docs/experimental path (useful
for testing or pointing at another repo).

## Activation

Listed in `~/.pi/agent/settings.json` under `extensions`.
