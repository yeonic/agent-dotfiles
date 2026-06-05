---
name: evolve-harness
description: Review a day's pi sessions to find where the agent didn't follow instructions, lost direction, or had to be corrected — then propose concrete, harness-level changes (rules, standards, guardrails, hooks, skills) that would prevent the same friction. Use when the user says "evolve the harness", "오늘 세션 회고", "review today's sessions", "하네스 진화", "agent 개선점 잡아줘", or asks what to tune in the agent setup based on recent usage.
---

# evolve-harness

Turn a day of real sessions into a short list of **harness evolutions**: changes to *this* agent's configuration that would have prevented the friction you observe. The deliverable is not "the agent should try harder" — it is a specific edit to a specific knob, justified by session evidence and framed from the model's own point of view (why did I go wrong, and what configuration would have stopped me).

Four phases. **Do not skip ahead, and do not write any file until Phase 4 is approved.**

---

## Phase 0: Know the knobs (read first, every run)

Before judging anything, load what already exists so you propose **gaps, not duplicates**. Read:

- `~/dev/pi-dotfiles/docs/integrated/*.md` — always-on rules compiled into `AGENTS.md` (cross-tool).
- `~/dev/pi-dotfiles/docs/experimental/*.md` — live-test rules (pi-only, injected each turn).
- `~/dev/pi-dotfiles/docs/standards/*.md` — coding (write-time) + testing (review-time), injected by `standards-verifier`.
- `~/dev/pi-dotfiles/extensions/guardrails.json` — deterministic command/path gates.
- `~/dev/pi-dotfiles/extensions/*/` — custom hooks (block/inject/transform).
- `~/dev/pi-dotfiles/skills/*/` — reusable workflows.
- **The ledger** — run `python3 ~/dev/pi-dotfiles/skills/harness-ledger/ledger.py list`. This tells you what was already tried, what is under evaluation, and what was already reverted, so you don't re-propose a settled or failed idea.

If a friction is already covered by an existing rule/gate, that is itself a finding: the rule exists but **did not fire** → the problem is enforcement or salience, not absence. If it matches a `reverted` ledger entry, say so instead of re-proposing it.

### The knob map (proposals must land on one of these)

| Knob | Use when | How to apply |
|------|----------|--------------|
| `docs/experimental/<slug>.md` | **Default landing zone.** A new behavioral rule worth testing before committing. | Create one file, one rule. Live next session, no rebuild. Reversible by `rm`. |
| `docs/integrated/*.md` + `./build.sh` | A rule already proven in experimental, or obviously correct and cross-tool. | Edit source, rebuild `AGENTS.md`. |
| `docs/standards/*.md` | The friction is about code/test quality at write or review time. | Edit the standard the verifier already injects. |
| `extensions/guardrails.json` | A text rule the model can (and did) ignore; needs a hard ask/deny. | Add a `permissionGate` pattern. |
| `extensions/<name>/` (new or existing) | Enforcement/automation a rule can't express (inject context on a trigger, block a tool, transform input). | Write/extend a TS extension. |
| `skills/<name>/` or a prompt template | A recurring multi-step task done ad hoc each time. | Capture the workflow as a skill. |

Bias toward the **least invasive, most reversible** knob. New behavioral rules start in `docs/experimental/` unless the user says otherwise.

---

## Phase 1: Extract signals

Run the bundled extractor (resolve its path against this skill's directory):

```bash
python3 <skill_dir>/signals.py            # today, all projects
python3 <skill_dir>/signals.py --date YYYY-MM-DD
python3 <skill_dir>/signals.py --grep rms-server     # one project
```

It prints a compact, capped report (quotes truncated) covering: interrupts (user hit Esc), corrections/redirects, repeated instructions, frustration markers, gated-git the agent ran on its own, tool-error loops, and long unattended stretches. **Work from this report — do not read whole session files into context.**

When a flagged moment needs more context to classify, deep-read only that region: open the session file at the relevant timestamp/quote (grep for it, read a small window). Never load an entire session.

---

## Phase 2: Diagnose (LLM point of view)

For each meaningful friction cluster, classify the **root cause** — why the model behaved that way. Be honest; this is a retro on the model, written by the model.

| Cause | Signature in the sessions |
|-------|---------------------------|
| **Absent** — no rule covered it | One-off correction, novel situation, no relevant rule in Phase 0 |
| **Buried / unread** — rule existed but lost in context | Rule is in Phase 0 but in a long/old context; happened late in a big session |
| **Ambiguous** — rule existed but underspecified | Model followed a rule but interpreted it wrong; user clarifies an edge |
| **Unenforced** — text rule the model can skip | Repeated instruction, or the model did a gated thing anyway |
| **Missing capability** — no reusable path | Same multi-step task reconstructed ad hoc; tool-error loops from not knowing the command |
| **Context loss** — thread dropped | Long unattended stretch, post-compaction confusion, redoing settled work |
| **Over-eagerness / habit** — unrequested scope | Ran checks/builds/edits nobody asked for; interrupts right after a wrong move |

Rules for honest diagnosis:
- **Frequency × severity ranks it.** A redirect that recurred 4× with frustration outranks a polite one-off.
- **Separate "model was wrong" from "user changed their mind."** Only the former is a harness signal.
- **Skip noise:** session-opening task specs, skill/template injections, and the user exploring/asking questions are not failures.
- If the evidence is thin, say "weak signal" rather than inventing a rule.

---

## Phase 3: Propose (no writing yet)

Produce a ranked list. For each evolution point:

> ### N. <one-line title>  ·  cause: <taxonomy>  ·  seen ×<count>
> **Evidence:** `<session path>` @ HH:MM — "<quote>" (+ others)
> **What I did & why (model POV):** <1–2 honest sentences>
> **Proposed evolution:** <exact knob> — <what to add/change>
> **Draft:**
> ```
> <the actual rule text / guardrails pattern / extension sketch / skill outline>
> ```
> **Why this knob:** <why this is the right, least-invasive lever; note if it upgrades an existing-but-unfired rule>

Then stop and ask:

> "Which of these should I apply? (default: write the approved ones to `docs/experimental/` for live testing, nothing committed)"

Constraints:
- Prefer **one rule per proposal**, phrased as a crisp, testable instruction with a short rationale and — where it disambiguates — one example.
- For `unenforced` causes, prefer a **guardrails pattern or hook** over yet another text rule.
- Don't propose more than the evidence supports. 2 strong proposals beat 8 speculative ones.

---

## Phase 4: Apply (only approved items)

For each approved proposal:

- **Experimental rule:** write `~/dev/pi-dotfiles/docs/experimental/<slug>.md` (one rule, with rationale). It is live next session via `experimental-injector` — no rebuild.
- **Integrated rule:** edit the `docs/integrated/` source, then run `~/dev/pi-dotfiles/build.sh`.
- **Standard:** edit the relevant `docs/standards/*.md`.
- **Guardrails:** add the pattern to `extensions/guardrails.json` (validate JSON; mirror existing pattern style).
- **Extension/skill:** create the file(s); keep changes small and self-contained.

Then **record each applied change in the ledger** (so tracking is automatic, not manual):

```bash
python3 ~/dev/pi-dotfiles/skills/harness-ledger/ledger.py new \
  --title "<short>" --status <experimental|permanent> --knob <knob> \
  --target <real file path> --evidence "<session evidence>" --tags "a,b"
```

Finally:
- Summarize what was written and where (paths + ledger ids).
- Experimental rules now carry a `review_by`; their graduation or revert is handled later by the **harness-ledger** skill — the agent proposes the verdict from re-measured evidence and the user only confirms. **Never ask the user to move or delete files themselves.**
- **Do not `git commit` or `git push`.** Mutating git needs separate explicit permission (the guardrails gate will also ask).

---

## Anti-patterns (avoid)

- **Restating existing rules** as if new — Phase 0 exists to prevent this.
- **"Try harder" advice** — every proposal must be a concrete config edit on a named knob.
- **Blaming the user's mind-changes** on the harness — only model errors count.
- **Reading whole sessions** — use the extractor, deep-read only flagged regions.
- **Inventing rules from one weak signal** — rank by frequency × severity; say so when weak.
- **Writing before approval, or committing anything** — Phase 4 is opt-in and never commits.
