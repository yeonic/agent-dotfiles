# pi-dotfiles

Personal agent harness, managed via symlinks from a single source of truth into
**pi**, **Claude Code**, and **Codex CLI**. One repo drives all three tools, so a
rule written once applies everywhere and no single vendor lock-in can strand the
setup.

## Why multi-tool

The instruction conventions overlap enough to share one source:

| Tool | User-level instructions | Models |
|---|---|---|
| pi | `~/.pi/agent/AGENTS.md` | Anthropic + Codex |
| Codex CLI | `~/.codex/AGENTS.md` (native) | OpenAI |
| Claude Code | `~/.claude/CLAUDE.md` | Anthropic |

`docs/integrated/` is the single source. `build.sh` concatenates it into
`agent/AGENTS.md`, which is symlinked to each tool's instruction file. Edit one
place, rebuild, all three update.

## Layout

```
pi-dotfiles/
├── agent/                 # Files linked under ~/.pi/agent/
│   ├── AGENTS.md          # BUILT FILE — do not edit (run ./build.sh)
│   └── settings.json      # pi settings (pi only; not portable to other tools)
├── docs/
│   ├── integrated/        # Source of AGENTS.md. ./build.sh concats in name order.
│   │   └── 0-*.md         # Use numeric prefixes to control order.
│   ├── standards/         # Coding/testing standards (injected, not in base prompt).
│   └── experimental/      # Live-tested rules before promotion.
├── extensions/            # pi extensions (pi only; linked as-is).
│   ├── footer-status/     #   pi TUI footer — pi-specific, not ported
│   ├── usage-bridge/      #   pi usage snapshot — pi-specific, not ported
│   ├── experimental-injector/  # injects docs/experimental at runtime
│   ├── standards-verifier/     # write-time + review-time standards net
│   └── guardrails.json    #   git permission gate
├── hooks/                 # Claude Code hooks (port of the pi extensions above)
│   ├── inject-experimental.sh  # SessionStart: docs/experimental → context
│   ├── inject-standards.sh     # SessionStart: write-time coding standards
│   └── verify-standards.sh     # Stop: review-time net (loop-safe)
├── skills/                # Shared skills, symlinked per-tool
├── statusline/            # Claude Code status line (cwd, model, ctx%, 5h/7d, PR+CI)
│   └── statusline.sh
├── build.sh
├── install-agents.sh
└── uninstall.sh
```

## Install

```bash
./install-agents.sh                 # all available targets (pi, claude, codex)
./install-agents.sh claude codex    # selected targets
DRY_RUN=1 ./install-agents.sh       # show actions only
CLAUDE_DIR=/tmp/c ./install-agents.sh claude   # override a target dir
```

What each target does:

| Target | Action |
|---|---|
| `pi` | Links `AGENTS.md`, `settings.json`, all `extensions/`, `skills/`, `experimental/` into `~/.pi/agent` |
| `claude` | Links `CLAUDE.md` → `AGENTS.md`, `statusline-command.sh` → `statusline/statusline.sh`, per-skill links into `~/.claude/skills`, **merges** hooks into `~/.claude/settings.json` |
| `codex` | Links `AGENTS.md`, per-skill links into `~/.codex/skills` |

- Real files are backed up to `<path>.backup.<timestamp>` before being replaced.
- Existing symlinks are replaced silently; idempotent — re-running is a no-op.
- `~/.claude/settings.json` is **never symlinked** (it holds tool-specific
  permissions/plugins). Only the harness hooks are merged in via `jq`, preserving
  everything else. Re-running does not duplicate them.

After install, day-to-day:

```bash
# add or edit a permanent rule (applies to all three tools)
$EDITOR docs/integrated/NN-<topic>.md
./build.sh                   # regenerates agent/AGENTS.md (symlinks propagate)
# pi: /reload   |   Claude Code / Codex: new session
```

```bash
# test a new rule live before committing
$EDITOR docs/experimental/<topic>.md
# graduate it:
git mv docs/experimental/<topic>.md docs/integrated/NN-<topic>.md
./build.sh
```

`~/.pi/agent/experimental/` is a symlink to `docs/experimental/`, so either path
edits the same files.

## How instructions reach each tool

| Source | pi | Claude Code | Codex CLI |
|---|---|---|---|
| `docs/integrated/*` → `AGENTS.md` | symlink | `CLAUDE.md` symlink | `AGENTS.md` symlink |
| `docs/experimental/*` | `experimental-injector` ext | `inject-experimental.sh` (SessionStart) | — (not auto-injected) |
| `docs/standards/*coding*` (write-time) | `standards-verifier` ext | `inject-standards.sh` (SessionStart) | — |
| `docs/standards/*` (review-time net) | `standards-verifier` ext | `verify-standards.sh` (Stop) | — |
| `skills/*` | `~/.pi/agent/skills` (dir link) | per-skill links | per-skill links |

Hooks are **Claude Code only** — Codex CLI has no equivalent hook system, so on
Codex the standards/experimental rules are covered by `AGENTS.md` content only.

### Claude Code hooks

The two pi extensions that do real work (`experimental-injector`,
`standards-verifier`) are reimplemented as Claude Code hooks in `hooks/`:

- **`inject-experimental.sh`** / **`inject-standards.sh`** — SessionStart hooks
  that emit `additionalContext`. Injected once per session (vs pi's per-turn) to
  stay lean against Claude's accumulating transcript.
- **`verify-standards.sh`** — Stop hook. When the agent tries to finish with
  uncommitted/untracked **code** changes, it blocks with a self-review demand
  (run lint/type-check/test + check against testing standards). Loop-safe via
  `stop_hook_active`.

`footer-status` and `usage-bridge` are pi-TUI-specific and intentionally not
ported. Their useful parts are instead rebuilt on Claude Code's **native**
status line (see below). `guardrails.json` is currently pi only.

### Claude Code status line

`statusline/statusline.sh` (symlinked to `~/.claude/statusline-command.sh`)
renders `cwd (branch) Model [ctx:N%] [5h:N% 7d:N%] PR#N ✓/✗/●`. Unlike the pi
footer — which scrapes `anthropic-ratelimit-unified-*` response headers — Claude
Code passes subscription usage **natively** in the status line stdin JSON
(`.rate_limits.five_hour/.seven_day.used_percentage`, Pro/Max only, present after
the first API response). PR + CI check counts come from `gh pr view`, cached per
branch (60s TTL) and refreshed in a detached background process so rendering
never blocks. `settings.json` already points `statusLine` at
`~/.claude/statusline-command.sh`, so install only swaps the symlink target.

## Skills

Skills now live **in this repo** (`skills/`) and are shared across tools via
symlinks. The installer links each one individually, so they coexist cleanly
with each tool's local-only skills:

- pi: whole `skills/` dir → `~/.pi/agent/skills`
- Claude Code / Codex: per-skill symlink into `~/.claude/skills/<name>` and
  `~/.codex/skills/<name>`

Local-only skills already in `~/.claude/skills` or `~/.codex/skills` (real
directories, not symlinks into this repo) are left untouched — the symlink vs
real-directory distinction is what separates repo-managed from local-only.

## Uninstall

```bash
./uninstall.sh                 # all targets (pi, claude, codex)
./uninstall.sh claude codex    # selected targets
DRY_RUN=1 ./uninstall.sh       # show actions only
```

Removes only symlinks that point back into this repo, across all three targets.
For Claude Code it also strips the merged harness hooks out of
`~/.claude/settings.json` (preserving every other hook and setting). Backups
remain in place (`<path>.backup.<timestamp>`) for manual restore.

## What is NOT managed here

Runtime state, secrets, caches, or upstream-provided files, left untouched:

- `auth.json`, `mcp-oauth/`, `mcp.json`
- `*-cache.json`, `*-usage.json`, `*.log`
- `sessions/`, `bin/`, `npm/`
- `~/.claude/settings.json` (merged, not owned), `~/.claude/commands/`
