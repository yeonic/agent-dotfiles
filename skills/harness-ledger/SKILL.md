---
name: harness-ledger
description: Track and manage the lifecycle of this harness's changes — decisions, experimental rules under evaluation, and permanent (graduated) rules. The agent audits the ledger against the real repo, proposes what to record/graduate/revert, and executes confirmed actions itself. Use when the user says "ledger", "what's pending", "review experiments", "오늘 변경 기록", "실험 정리", "어떤 룰 승격할까", or after applying a harness change that should be recorded.
---

# harness-ledger

Keep a living record of why this harness changed and what state each change is in — without the user ever moving files or editing status by hand. **The contract: the agent proposes, the user confirms, the agent executes.** The user never runs a `git mv`, never edits frontmatter, never promotes or deletes a rule manually.

## Model

Every harness change is one **decision note** at `docs/ledger/decisions/NNNN-slug.md`. Its `status` is the lifecycle:

```
proposed ──► experimental ──► permanent
                  │
                  └──► reverted
```

The filesystem is the source of truth for *existence*; the note carries the *why + intended status*. The `ledger.py audit` command reconciles them and tells the agent what to do.

The engine (resolve path against this skill's dir):

```bash
python3 <skill_dir>/ledger.py audit                  # what needs managing
python3 <skill_dir>/ledger.py list [--status S]      # current records
python3 <skill_dir>/ledger.py new --title ... --status ... --knob ... --target ... --evidence ... [--tags a,b]
python3 <skill_dir>/ledger.py graduate ID            # experimental -> integrated, rebuild, relabel
python3 <skill_dir>/ledger.py revert ID              # drop experimental rule, mark reverted
python3 <skill_dir>/ledger.py set ID STATUS          # manual status fix
```

`graduate` and `revert` do the file moves and rebuild themselves. **The agent calls them — only after the user confirms.**

---

## Mode A: Review & manage (the main loop)

Run when the user asks to review the ledger, or proactively after session work.

1. **Audit.** Run `ledger.py audit`. It flags:
   - `GRADUATED` — an experimental rule's file already moved to integrated → should be `permanent`.
   - `GONE` — an experimental target was deleted → should be `reverted`.
   - `OVERDUE` — an experimental rule passed its `review_by` with no verdict.
   - `MISLABELED` / `BROKEN` — status disagrees with the filesystem.
   - `UNTRACKED` — an experimental rule with no decision note.

2. **For each `experimental` finding, judge it from the user's actual usage** — measure, don't guess. The user only ever confirms; you produce the evidence. Use `evolve-harness`'s extractor across **all pi sessions** (every project; never pass `--grep`), comparing equal windows before and after the rule's `date`:

   ```bash
   S=~/dev/pi-dotfiles/skills/evolve-harness/signals.py
   python3 $S --since <date-Δ> --until <date-1> --totals    # before the rule
   python3 $S --since <date>   --until <today>  --totals    # after the rule
   ```

   Compare the **specific signal the rule targets** (e.g., checkpoint → `long_runs` + `aborts`; a git rule → `gated`), normalized per day since window lengths differ. Recommend:
   - **graduate** if the targeted signal dropped meaningfully and nothing regressed,
   - **revert** if it didn't move (or friction rose / the rule was clearly ignored),
   - **extend** (push `review_by`) if the after-window is too short to tell.

   Always show the before/after numbers behind the recommendation.

3. **Present a single confirm list**, e.g.:

   > Ledger needs these (confirm which):
   > - **0003 checkpoint** — OVERDUE. Friction it targeted (long stretches) dropped 18→7/day since it landed. **Recommend: graduate.**
   > - **0007 foo-rule** — OVERDUE. No measurable change. **Recommend: revert.**
   > - `docs/experimental/bar.md` — UNTRACKED. **Recommend: record (new note).**

4. **On confirmation, the agent executes** the exact commands (`graduate`/`revert`/`new`/`set`). Report what changed. Never ask the user to do it.

---

## Mode B: Record a change (called after applying something)

When a harness change has just been applied (by `evolve-harness` or directly), record it immediately so nothing is lost:

```bash
python3 <skill_dir>/ledger.py new \
  --title "<short>" --status <experimental|permanent> \
  --knob <docs/experimental|extensions/...|skills/...> \
  --target <actual file path> \
  --evidence "<session evidence / why>" --tags "a,b"
```

- New behavioral rules land as `status: experimental` (auto-gets a `review_by` +7d).
- Config/extension/skill changes that are clearly keepers land as `status: permanent`.
- `target` must be the real artifact path, so `audit` can track it.

---

## Boundaries

- **The user only confirms.** Every file move, deletion, rebuild, and status edit is the agent's job via `ledger.py`. If you catch yourself writing "now run `git mv …`" for the user — stop and run it yourself after confirmation.
- **Do not `git commit`/`push`.** Recording and graduating change working-tree files; committing is a separate explicit step (and the guardrails gate will ask).
- **One decision = one note.** Don't batch unrelated changes into a single record.
- **Graduation needs evidence, not vibes.** Prefer re-measuring with `evolve-harness` over guessing whether an experiment helped.
