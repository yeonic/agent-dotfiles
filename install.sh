#!/usr/bin/env bash
# Install pi-dotfiles by symlinking files into ~/.pi/agent.
# Existing real files are backed up to <path>.backup.<timestamp>.
# Existing symlinks are replaced silently.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI="${PI_AGENT_DIR:-$HOME/.pi/agent}"
TS="$(date +%Y%m%d-%H%M%S)"
DRY_RUN="${DRY_RUN:-0}"

log()  { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[err]\033[0m %s\n' "$*" >&2; }

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  DRY:'; printf ' %q' "$@"; echo
  else
    "$@"
  fi
}

link() {
  # link <src-relative-to-ROOT> <dest-relative-to-PI>
  local src="$ROOT/$1"
  local dest="$PI/$2"

  if [[ ! -e "$src" ]]; then
    err "source missing: $src"
    return 1
  fi

  mkdir -p "$(dirname "$dest")"

  if [[ -L "$dest" ]]; then
    local current
    current="$(readlink "$dest")"
    if [[ "$current" == "$src" ]]; then
      log "ok    $dest"
      return 0
    fi
    log "relink $dest (was -> $current)"
    run rm "$dest"
  elif [[ -e "$dest" ]]; then
    local backup="$dest.backup.$TS"
    warn "backup $dest -> $backup"
    run mv "$dest" "$backup"
  else
    log "new   $dest"
  fi

  run ln -s "$src" "$dest"
}

log "ROOT=$ROOT"
log "PI=$PI"
[[ "$DRY_RUN" == "1" ]] && warn "dry-run mode (no changes)"

# --- build AGENTS.md from docs/integrated/ ---
if [[ -x "$ROOT/build.sh" ]]; then
  log "building agent/AGENTS.md"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  DRY: $ROOT/build.sh"
  else
    "$ROOT/build.sh"
  fi
fi

# --- agent root files ---
link agent/AGENTS.md      AGENTS.md
link agent/settings.json  settings.json

# --- extensions (each directory as a single link) ---
for dir in "$ROOT"/extensions/*/; do
  name="$(basename "$dir")"
  link "extensions/$name" "extensions/$name"
done
link extensions/guardrails.json extensions/guardrails.json

# --- skills (single dir link; only if non-empty) ---
if [[ -n "$(ls -A "$ROOT/skills" 2>/dev/null)" ]]; then
  link skills skills
else
  log "skip  skills (empty)"
fi

# --- experimental rules (live-test staging, editable from either side) ---
link docs/experimental experimental

log "done."
