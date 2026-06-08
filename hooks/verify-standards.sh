#!/usr/bin/env bash
# Claude Code Stop hook.
# Review-time net mirroring pi's standards-verifier: fire a self-review against
# the testing standards (plus an actual lint/type-check/test run) only when a
# code file was edited THIS turn — signalled by a per-session marker that the
# PostToolUse hook (mark-code-edit.sh) drops. This avoids firing on every Stop
# just because the working tree has pre-existing uncommitted changes.
#
# Loop-safe: honours stop_hook_active so the review is demanded at most once per
# stop sequence (the pi extension used a reviewSent flag for the same reason).

set -euo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HOOK_DIR/.." && pwd)"
STANDARDS_DIR="${PI_STANDARDS_DIR:-$REPO/docs/standards}"

input="$(cat)"
[[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" == "true" ]] && exit 0

session="$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null)"
marker="$HOME/.claude/.standards-review-pending-${session}"
[[ -f "$marker" ]] || exit 0   # no code edited this turn → stay silent
rm -f "$marker"                # consume: one review per edit burst

testing_standards=""
shopt -s nullglob
for f in "$STANDARDS_DIR"/*.md; do
  name="$(basename "$f")"
  [[ "$name" == *coding* ]] && continue
  testing_standards+="<standard file=\"$name\">"$'\n'"$(cat "$f")"$'\n'"</standard>"$'\n\n'
done
shopt -u nullglob

reason="$(
  printf '[Self-review required before finishing]\n\n'
  printf 'You changed code in this turn. Do NOT consider the task done yet.\n\n'
  printf '1. Run `git diff` to see everything you changed this turn.\n'
  printf "2. Run this project's lint / format / type-check / test tooling on the\n"
  printf '   changes (use whatever the repo defines) and fix what it reports.\n'
  printf '3. Check the diff against the testing standards below; apply them only if\n'
  printf '   you added or changed real logic or tests.\n'
  printf '4. List any violations you found and the fixes you made.\n'
  printf '5. If everything already conforms and tooling passes, say so in one line.\n\n'
  printf '%s' "$testing_standards"
)"

jq -n --arg r "$reason" '{decision: "block", reason: $r}'
