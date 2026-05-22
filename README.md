# pi-dotfiles

Personal pi configuration, managed via symlinks into `~/.pi/agent`.

## Layout

```
pi-dotfiles/
├── agent/                 # Files linked directly under ~/.pi/agent/
│   ├── AGENTS.md          # BUILT FILE — do not edit (run ./build.sh)
│   └── settings.json
├── docs/
│   ├── integrated/        # Source of AGENTS.md. ./build.sh concats these in name order.
│   │   └── 0-*.md         # Use numeric prefixes to control order.
│   └── experimental/      # Live-tested rules (pi only, via experimental-injector).
├── extensions/            # Each subdir = one pi extension; linked as-is.
│   ├── footer-status/
│   ├── usage-bridge/
│   ├── experimental-injector/
│   └── guardrails.json
├── skills/                # Linked to ~/.pi/agent/skills (mostly managed elsewhere)
├── build.sh
├── install.sh
└── uninstall.sh
```

## Install

```bash
./install.sh          # runs build.sh, then creates/refreshes symlinks
DRY_RUN=1 ./install.sh
PI_AGENT_DIR=/tmp/pi-test ./install.sh
```

After install, day-to-day:

```bash
# add or edit a permanent rule
$EDITOR docs/integrated/NN-<topic>.md
./build.sh                   # regenerates agent/AGENTS.md
# in any running pi session: /reload
```

```bash
# test a new rule live before committing
$EDITOR docs/experimental/<topic>.md
#   (or equivalently)  $EDITOR ~/.pi/agent/experimental/<topic>.md
# in pi: start a new session (or /reload). The rule is now active.
# graduate it:
git mv docs/experimental/<topic>.md docs/integrated/NN-<topic>.md
./build.sh
```

`~/.pi/agent/experimental/` is a symlink to `docs/experimental/`, so either
path edits the same files.

- Existing real files at the target path are backed up to
  `<path>.backup.<timestamp>` before being replaced with a symlink.
- Existing symlinks are replaced silently.
- The script is idempotent: re-running is a no-op when already installed.

## Uninstall

```bash
./uninstall.sh
```

Removes only symlinks that point back into this repo. Backups remain in place
(`<path>.backup.<timestamp>`) so they can be restored manually if needed.

## What is NOT managed here

These remain in `~/.pi/agent/` untouched (runtime state, secrets, caches, or
upstream-provided examples):

- `auth.json`, `mcp-oauth/`, `mcp.json`
- `*-cache.json`, `*-usage.json`, `*.log`
- `sessions/`, `bin/`, `npm/`
- `agents/`, `prompts/` (these are symlinks to pi package examples)

## Routing rules to the right home

The 200-line guideline applies to the *final* concatenated system prompt, not
to source files. Splitting source files does not save tokens by itself.
Use the right destination for each rule:

| Where | When | Managed by |
|---|---|---|
| `docs/integrated/*.md` → `agent/AGENTS.md` | Applies to **every** turn, every project, every tool | this repo, built |
| `docs/experimental/*.md` | Live-tested before promotion; pi only | this repo, injected at runtime |
| Skill (`SKILL.md`) | Conditional — write a precise `description` so the model loads on-demand | separate (see below) |
| Project `AGENTS.md` (in a work tree) | Scoped to one repo or org | the work repo itself |
| Prompt template (`~/.pi/agent/prompts/*.md`) | Invoked explicitly via `/command` | this repo (future) |

### Skills are managed separately

Skills are NOT in this repo (so this repo stays personal/general). Pi reads
skills from multiple locations automatically:

- `~/.pi/agent/skills/` — default global location (auto-loaded by pi)
- `~/.claude/skills/` — added via `settings.json` `skills` array (shared with Claude Code)

Company/project-specific skills live at `~/.claude/skills/<name>/SKILL.md` and
are visible to both Claude Code and pi without further configuration.
