---
name: grill-me
description: Interview the user one question at a time to align on a plan, design, or task before doing real work. The user controls when grilling ends; the skill then produces a chosen artifact (PRD, ADR, implementation plan, code, GitHub issue, summary, etc.) under explicit user approval. Use when the user says "grill me", asks to stress-test a plan, wants help thinking through a design, or starts a non-trivial task with unclear shape.
---

# grill-me

Reach shared understanding with the user before doing real work, then produce a specific artifact under their direction.

The skill has four phases. **Do not skip ahead.**

---

## Phase 1: Grill

**Goal:** walk every meaningful decision branch until the user is convinced you understand.

### Per question

- Ask exactly **one** question.
- Provide your **recommended answer** with a one-line rationale.
- Optionally list 2–3 plausible alternatives.
- Wait for the user's response. Do not move on without it.

### What to ask about (priority order)

1. **Scope** — what's in, what's out, what's the unit of "done".
2. **Assumptions** — what's being taken for granted that may not hold.
3. **Constraints** — time, dependencies, compatibility, security, deployment.
4. **Trade-offs** — which axes matter (simplicity, performance, flexibility, …).
5. **Edge cases** — failure modes, race conditions, empty/large/malformed input.
6. **Verification** — how we'll know it actually works.

When the user's answer opens new sub-branches, descend into them before moving sideways.

### Do NOT ask what you can check

- File / function / type existence and shapes → read the codebase.
- Dependency versions → read `package.json` / lockfile.
- Existing patterns → grep, read related files.

Replace "what does X look like?" with "I checked X — it does Y. Keep that shape?".

### End condition

**Only the user ends Phase 1.** Wait for an explicit signal:
- "ok / done / let's wrap up"
- "produce a plan / write the PRD / make the issue"
- a direct request for output

Do not declare the grill over on your own.

---

## Phase 2: Output Selection

Once the user signals end, ask exactly once:

> "What should we produce? Options:
> - **Code** — actual file changes
> - **Implementation plan** — steps, no code yet
> - **PRD / design doc**
> - **ADR**
> - **GitHub issue(s)**
> - **Summary / decision memo**
> - **Tests / QA checklist**
>
> I recommend: **\<best fit\>** because \<reason\>."

Wait for the user's choice. If the user names a custom output, accept it.

---

## Phase 3: Plan Review

Before producing, write a precise plan for the chosen artifact:

- **Code:** file-by-file change list in execution order, one line per change, with the verification step for each.
- **Doc / ADR / PRD:** outline of sections + the key claim or decision in each.
- **Issue(s):** title and 3–5 line body for each issue.
- **Other:** the structure and key contents.

Show the plan in full. Then ask:

> "Approve as-is, or change [section / file / order / scope]?"

Iterate until the user gives explicit approval. **Do not produce until then.**

---

## Phase 4: Produce

Execute the plan. Stick to it.

If during production you discover something that forces a deviation (a missing file, an unstated assumption broken, a tool error), **stop and report** before deviating. Do not silently improvise.

When done, summarize what was produced and where (file paths, issue numbers, etc.).

---

## Anti-patterns (avoid)

- **Multi-question barrages** — one at a time.
- **Recommending nothing** — always give a recommended answer with rationale.
- **Asking what you could check** — read the codebase instead.
- **Declaring the grill over** — only the user does that.
- **Producing before plan approval** — never.
- **Drifting from the approved plan during Phase 4** — surface deviations.
