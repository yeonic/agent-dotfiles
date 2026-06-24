#!/usr/bin/env bash
# Claude Code Stop hook.
# Review-time net for substantive code changes. Instead of asking the SAME agent
# to self-attest ("I checked the standards, it's fine") — which it can satisfy
# with a bare claim — this gates the stop on TRANSCRIPT EVIDENCE that an
# independent reviewer subagent actually ran against the diff since the last
# edit. The reviewer (fresh context, no completion bias) runs the project's
# lint/type/test tooling AND judges the coding + testing standards; this hook
# only enforces that the review happened. The author still must fix its findings.
#
# Fires only when substantive code changed THIS turn — signalled by the
# per-session marker that the PostToolUse hook (mark-code-edit.sh) accumulates.
#
# Termination: the marker is consumed (stop allowed) once the transcript shows a
# completed `standards-review` subagent after the last edit. A bounded retry cap
# keeps a non-complying agent from wedging the session — on cap it releases with
# a loud final warning rather than silently.

set -euo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HOOK_DIR/.." && pwd)"
STANDARDS_DIR="${PI_STANDARDS_DIR:-$REPO/docs/standards}"

input="$(cat)"

session="$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // ""' 2>/dev/null)"
marker="$HOME/.claude/.standards-review-pending-${session}"
attempts_file="$HOME/.claude/.standards-review-attempts-${session}"
[[ -f "$marker" ]] || exit 0   # no code edited this turn → stay silent

# Fire only when accumulated *substantive* changed lines clear the threshold,
# so cosmetic tweaks (1–2 line edits, comment/format-only) stay silent.
min_lines="${PI_REVIEW_MIN_LINES:-3}"
changed="$(cat "$marker" 2>/dev/null)"
[[ "$changed" =~ ^[0-9]+$ ]] || changed=0
if [[ "$changed" -lt "$min_lines" ]]; then
  rm -f "$marker" "$attempts_file"
  exit 0
fi

# Has an independent `standards-review` subagent completed since the last edit?
# Scans the session transcript: a Task tool_use whose description carries the
# "standards-review" sentinel, with a matching non-error tool_result, timestamped
# after the most recent Edit/Write/MultiEdit/NotebookEdit.
review_status="MISSING"
if [[ -n "$transcript" && -f "$transcript" ]]; then
  review_status="$(python3 - "$transcript" <<'PY' 2>/dev/null || true
import json, sys
from datetime import datetime

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}

def epoch(ts):
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None

last_edit = None
review_calls = []          # (epoch, tool_use_id)
completed_ids = set()      # tool_use_ids that returned a non-error result

try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = epoch(o.get("timestamp", ""))
            content = (o.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for b in content:
                if not isinstance(b, dict):
                    continue
                t = b.get("type")
                if t == "tool_use":
                    name = b.get("name", "")
                    if name in EDIT_TOOLS and ts is not None:
                        last_edit = ts if last_edit is None else max(last_edit, ts)
                    elif name in ("Task", "Agent"):  # subagent tool: "Task" stock, "Agent" with agent-teams
                        desc = str((b.get("input") or {}).get("description", "")).lower()
                        if "standards-review" in desc and ts is not None:
                            review_calls.append((ts, b.get("id")))
                elif t == "tool_result":
                    if not b.get("is_error"):
                        tid = b.get("tool_use_id")
                        if tid:
                            completed_ids.add(tid)
except OSError:
    print("MISSING"); sys.exit(0)

if last_edit is None:
    # Marker asserts edits happened but none are in this transcript (rotation /
    # compaction). Can't prove a review post-dates the edit → fail closed.
    print("MISSING"); sys.exit(0)
for ts, tid in review_calls:
    if tid in completed_ids and ts >= last_edit:
        print("OK"); sys.exit(0)
print("MISSING")
PY
)"
  [[ -z "$review_status" ]] && review_status="MISSING"
fi

if [[ "$review_status" == "OK" ]]; then
  rm -f "$marker" "$attempts_file"   # independent review provably ran → release
  exit 0
fi

# No qualifying review yet → block and demand one. Bounded so a stubborn loop
# can't wedge the session.
cap="${PI_REVIEW_MAX_ATTEMPTS:-3}"
attempts=0
[[ -f "$attempts_file" ]] && attempts="$(cat "$attempts_file" 2>/dev/null)"
[[ "$attempts" =~ ^[0-9]+$ ]] || attempts=0
attempts=$(( attempts + 1 ))
printf '%s' "$attempts" > "$attempts_file"

if [[ "$attempts" -gt "$cap" ]]; then
  rm -f "$marker" "$attempts_file"
  printf 'standards-review gate: released after %s attempts WITHOUT an independent review — diff is UNVERIFIED.\n' "$cap" >&2
  exit 0
fi

shopt -s nullglob
standards_paths=()
for f in "$STANDARDS_DIR"/*.md; do standards_paths+=("$f"); done
shopt -u nullglob
standards_ref="(no standard files found)"
[[ ${#standards_paths[@]} -gt 0 ]] && standards_ref="$(printf '%s\n' "${standards_paths[@]}")"

final_note=""
[[ "$attempts" -eq "$cap" ]] && final_note=$'\n(FINAL reminder — after this attempt the gate releases the stop UNVERIFIED.)'

reason="$(
  printf '[Standards review required — task is NOT done yet]\n\n'
  printf 'You made substantive code edits this turn. An INDEPENDENT reviewer must\n'
  printf 'check the diff before you finish — your own self-review does not satisfy\n'
  printf 'this gate. Dispatch a fresh subagent (clean context, no completion bias):\n\n'
  printf '  Task(\n'
  printf '    subagent_type: "general-purpose",\n'
  printf '    description: "standards-review <one-line scope>",   // MUST contain "standards-review"\n'
  printf '    prompt: |\n'
  printf '      Review the current uncommitted diff for standards conformance. Be\n'
  printf '      adversarial; do not rubber-stamp.\n'
  printf '      1. Run `git diff` and `git diff --staged` to see every change.\n'
  printf '      2. Read the standards:\n'
  printf '%s\n' "$standards_ref" | sed 's/^/           /'
  printf '      3. For each changed function/class, check it against the coding\n'
  printf '         standards (naming, function extraction, error handling, comments).\n'
  printf '         If logic or tests changed, also check the testing standards.\n'
  printf "      4. Run the project's lint / type-check / test tooling on the changes.\n"
  printf '      5. Return "PASS" or a concrete list of violations as file:line + fix.\n'
  printf '  )\n\n'
  printf 'Then fix every violation it reports. Re-dispatch if you edit further.\n'
  printf 'Finish only once the reviewer has run and its findings are resolved.%s\n' "$final_note"
)"

jq -n --arg r "$reason" '{decision: "block", reason: $r}'
