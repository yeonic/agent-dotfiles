#!/usr/bin/env bash
# Install this harness into one or more agent tools by symlinking shared sources.
#
# Single source of truth = this repo. Per tool:
#   pi      -> ~/.pi/agent      (AGENTS.md, settings.json, extensions, skills, experimental)
#   claude  -> ~/.claude        (CLAUDE.md, per-skill links, SessionStart/Stop hooks)
#   codex   -> ~/.codex         (AGENTS.md, per-skill links)
#
# Usage:
#   ./install-agents.sh                # all available targets
#   ./install-agents.sh claude codex   # selected targets
#   DRY_RUN=1 ./install-agents.sh      # show actions only
#
# Real files are backed up to <path>.backup.<timestamp>; symlinks are replaced
# silently. settings.json is never symlinked for claude — its hooks are merged.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
DRY_RUN="${DRY_RUN:-0}"

PI_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_DIR:-$HOME/.codex}"

SKILLS=(commit-message evolve-harness grill-me harness-ledger)

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

# link <abs-src> <abs-dest>
link() {
  local src="$1" dest="$2"
  if [[ ! -e "$src" ]]; then err "source missing: $src"; return 1; fi
  mkdir -p "$(dirname "$dest")"
  if [[ -L "$dest" ]]; then
    local current; current="$(readlink "$dest")"
    if [[ "$current" == "$src" ]]; then log "ok    $dest"; return 0; fi
    log "relink $dest (was -> $current)"; run rm "$dest"
  elif [[ -e "$dest" ]]; then
    warn "backup $dest -> $dest.backup.$TS"; run mv "$dest" "$dest.backup.$TS"
  else
    log "new   $dest"
  fi
  run ln -s "$src" "$dest"
}

build_agents() {
  [[ -x "$ROOT/build.sh" ]] || return 0
  log "building agent/AGENTS.md"
  if [[ "$DRY_RUN" == "1" ]]; then echo "  DRY: $ROOT/build.sh"; else "$ROOT/build.sh"; fi
}

install_pi() {
  log "target: pi ($PI_DIR)"
  link "$ROOT/agent/AGENTS.md"     "$PI_DIR/AGENTS.md"
  link "$ROOT/agent/settings.json" "$PI_DIR/settings.json"
  for dir in "$ROOT"/extensions/*/; do
    link "${dir%/}" "$PI_DIR/extensions/$(basename "$dir")"
  done
  link "$ROOT/extensions/guardrails.json" "$PI_DIR/extensions/guardrails.json"
  [[ -n "$(ls -A "$ROOT/skills" 2>/dev/null)" ]] && link "$ROOT/skills" "$PI_DIR/skills"
  link "$ROOT/docs/experimental" "$PI_DIR/experimental"
}

install_codex() {
  log "target: codex ($CODEX_DIR)"
  [[ -d "$CODEX_DIR" ]] || { warn "skip codex (no $CODEX_DIR)"; return 0; }
  link "$ROOT/agent/AGENTS.md" "$CODEX_DIR/AGENTS.md"
  for s in "${SKILLS[@]}"; do link "$ROOT/skills/$s" "$CODEX_DIR/skills/$s"; done
}

merge_claude_settings() {
  local settings="$CLAUDE_DIR/settings.json"
  local hooks="$ROOT/hooks"
  [[ -f "$settings" ]] || echo '{}' > "$settings"
  local merged
  merged="$(jq --arg h "$hooks" '
    def strip: map(select((.hooks // []) | any(.command | contains($h)) | not));
    .hooks = (.hooks // {})
    | .hooks.SessionStart = ((.hooks.SessionStart // []) | strip) + [
        { matcher: "", hooks: [
            { type: "command", command: ($h + "/inject-experimental.sh") },
            { type: "command", command: ($h + "/inject-standards.sh") }
        ] } ]
    | .hooks.Stop = ((.hooks.Stop // []) | strip) + [
        { matcher: "", hooks: [
            { type: "command", command: ($h + "/verify-standards.sh") }
        ] } ]
  ' "$settings")"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  DRY: merge hooks into $settings"
  else
    printf '%s\n' "$merged" > "$settings"
    log "merged hooks into $settings"
  fi
}

install_claude() {
  log "target: claude ($CLAUDE_DIR)"
  [[ -d "$CLAUDE_DIR" ]] || { warn "skip claude (no $CLAUDE_DIR)"; return 0; }
  link "$ROOT/agent/AGENTS.md" "$CLAUDE_DIR/CLAUDE.md"
  for s in "${SKILLS[@]}"; do link "$ROOT/skills/$s" "$CLAUDE_DIR/skills/$s"; done
  merge_claude_settings
}

targets=("$@")
[[ ${#targets[@]} -eq 0 ]] && targets=(pi claude codex)

log "ROOT=$ROOT"
[[ "$DRY_RUN" == "1" ]] && warn "dry-run mode (no changes)"
build_agents

for t in "${targets[@]}"; do
  case "$t" in
    pi)     install_pi ;;
    claude) install_claude ;;
    codex)  install_codex ;;
    *) err "unknown target: $t (expected pi|claude|codex)"; exit 1 ;;
  esac
done

log "done."
