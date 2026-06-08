#!/usr/bin/env bash
# Claude Code status line — two rows, p10k-lean style.
#   line 1: cwd  (branch)  Model
#   line 2: [ctx:N%]   claude · 5h [━─────] 6% 3h55m · 7d [━─────] 12% 1d13h
#
# All data is native statusline stdin JSON:
#   .workspace.current_dir, .model.display_name, .context_window.used_percentage,
#   .rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}
#   (rate_limits is Claude Pro/Max only, present after the first API response;
#    absent otherwise — handled gracefully. resets_at may also be absent.)

ESC="$(printf '\033')"
BAR_SEGMENTS=6
FILL="━"   # U+2501 heavy — used portion
EMPTY="─"  # U+2500 light — remaining portion

col() { printf '%s[%sm%s%s[0m' "$ESC" "$1" "$2" "$ESC"; }

# Color tier by used-percentage: green < 50, yellow < 80, red otherwise.
tier() { local p="$1"; if [[ "$p" -ge 80 ]]; then echo 31; elif [[ "$p" -ge 50 ]]; then echo 33; else echo 32; fi; }

input="$(cat)"
j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }

cwd="$(j '.workspace.current_dir // .cwd')"
model="$(j '.model.display_name')"
ctx="$(j '.context_window.used_percentage')"

# === line 1: location / branch / model ===
short_cwd="${cwd/#$HOME/\~}"
line1="$(col 34 "$short_cwd")"
if git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
  branch="$(git -C "$cwd" -c gc.auto=0 symbolic-ref --short HEAD 2>/dev/null || true)"
  [[ -n "$branch" ]] && line1="$line1 $(col 36 "($branch)")"
fi
[[ -n "$model" ]] && line1="$line1 $(col 35 "$model")"

# === line 2: context + subscription usage gauges (native data) ===
line2=""
if [[ -n "$ctx" ]]; then
  ci="$(printf '%.0f' "$ctx")"
  line2="$(col "$(tier "$ci")" "[ctx:${ci}%]")"
fi

# Render a bar of BAR_SEGMENTS cells, filled proportional to <pct> (rounded).
render_bar() {
  local pct="$1" filled i bar=""
  filled=$(( (pct * BAR_SEGMENTS + 50) / 100 ))
  (( filled < 0 )) && filled=0
  (( filled > BAR_SEGMENTS )) && filled=$BAR_SEGMENTS
  for (( i = 0; i < BAR_SEGMENTS; i++ )); do
    (( i < filled )) && bar+="$FILL" || bar+="$EMPTY"
  done
  printf '%s' "$bar"
}

# Human "time until reset" from an absolute epoch: 1d13h / 3h55m / 12m.
countdown() {
  local at="$1" now rem
  [[ -z "$at" || ! "$at" =~ ^[0-9]+$ ]] && return 0
  now="$(date +%s)"; rem=$(( at - now ))
  (( rem <= 0 )) && return 0
  if   (( rem >= 86400 )); then printf '%dd%dh' $(( rem / 86400 )) $(( (rem % 86400) / 3600 ))
  elif (( rem >= 3600  )); then printf '%dh%dm' $(( rem / 3600 ))  $(( (rem % 3600) / 60 ))
  else                          printf '%dm'    $(( rem / 60 )); fi
}

# "<label> [bar] N% <countdown>" colored by tier; countdown dimmed.
gauge() { # <label> <pct-raw> <resets_at>
  local label="$1" pct cnt c out
  pct="$(printf '%.0f' "$2")"; c="$(tier "$pct")"
  cnt="$(countdown "$3")"
  out="$(col "$c" "$label") $(col "$c" "[$(render_bar "$pct")] ${pct}%")"
  [[ -n "$cnt" ]] && out="$out $(col 90 "$cnt")"
  printf '%s' "$out"
}

five_h="$(j '.rate_limits.five_hour.used_percentage')"
seven_d="$(j '.rate_limits.seven_day.used_percentage')"
five_h_reset="$(j '.rate_limits.five_hour.resets_at')"
seven_d_reset="$(j '.rate_limits.seven_day.resets_at')"

sep=" $(col 90 '·') "
usage=""
[[ -n "$five_h"  ]] && usage="$(gauge 5h "$five_h" "$five_h_reset")"
[[ -n "$seven_d" ]] && usage="${usage:+$usage$sep}$(gauge 7d "$seven_d" "$seven_d_reset")"
[[ -n "$usage" ]] && line2="${line2:+$line2   }$usage"

printf '%s\n' "$line1"
[[ -n "$line2" ]] && printf '%s\n' "$line2"
