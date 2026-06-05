# Code Style

Judgment-level conventions that linters and type checkers can't enforce.
Language-agnostic; applies to any code being written or reviewed.

## Naming

**Be explicit. No shorthand, no ambiguity.**

- **No abbreviations.** Spell it out: `buf` → `buffer`, `cfg` → `config`, `idx` → `index`. The few exceptions are conventions so universal they no longer read as abbreviations (`id`, `url`, `http`).
- **Booleans read as yes/no questions.** Variables, return types, fields that hold a boolean must be named so the value answers a binary question: `isReady`, `hasItems`, `canRetry`, `shouldFlush`. Avoid `flag`, `status`, `done` for booleans.
- **Function names are verbs.** `parseConfig`, `loadUser`, `validate`. Not `config`, `userParser`, `validation`. The verb names the action; the noun names the result.

## Functions

**Extract for understanding, not for reuse.**

- **Extract raw algorithmic logic into a named method even if used once.** The function name *is* the documentation. If a block does something non-obvious, lifting it out with a precise name beats inline comments.
- **Don't extract boilerplate until it appears at least three times.** Premature extraction creates indirection without payoff and locks in shapes that haven't earned their generality.
- **Function count is not a quality metric.** Many small functions can be *less* readable than one well-structured medium function. Trade off the cost of jumping between definitions against the cost of reading a longer body, and pick deliberately.
- **Inline / nested functions: only when closures matter.** If the inner function doesn't meaningfully benefit from closing over local state, extract it with explicit parameters instead.

## Error Handling

**Catch at boundaries. Name precisely. Never duplicate.**

- **Catch at semantic boundaries.** Adapter ↔ domain. Orchestrator ↔ component. External I/O ↔ pure logic. Not in the middle of a procedure where the catch hides the real shape of the failure.
- **Error names are self-explanatory.** A plain `Error` or `Exception` tells the debugger nothing. Name the failure mode: `InvalidTokenError`, `ConfigMissingError`, `UpstreamUnavailableError`. The type is the first piece of diagnostic information.
- **Silent swallow is sometimes correct, never reflexive.** If a `catch` block intentionally discards an error, write a comment explaining why. No comment = the swallow is a bug.
- **Never throw and log at the same site.** If you `throw` an error, do not also write `log.error(...)`. The catcher (or the framework's top-level handler) will log it. Double-logging produces noisy duplicates and breaks traceability. The error itself is the single source of truth — let it propagate cleanly.

## Comments

**Write what the code can't say. Less is better.**

- **Default silence; add only on explicit request or when the *why* is genuinely unrecoverable.** Don't author docstrings or inline comments as a side effect of editing code. Function names, commit messages, and git blame already carry most of the historical context; reach for a written comment only when those channels can't.
- **Never explain what the code does.** Code explains itself; readers can read it. Comments explain the *why*: the constraint, the historical reason, the surprising trade-off, the upstream bug being worked around.
- **Fewer is better.** Heavy commenting is usually a symptom — the code or the names are doing too little. Fix those first; comment only what remains genuinely non-obvious.
- **No session-local jargon.** Comments outlive the conversation that produced them. Don't write "as we discussed" or reference symbols only meaningful in the current chat. Write so future-you (or anyone else) can read in isolation.
