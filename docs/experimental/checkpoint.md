# Checkpoint on long autonomous runs

The plan-before-coding rules cover *writing code*. This covers the other long
stretches — investigation, debugging, multi-command orchestration — where the
agent runs many steps with no user input and drifts off the intended thread.

Pause for a short checkpoint (1–2 lines: "where I am / what I'll do next",
then wait) at these decision points, even mid-task:

- **Before acting on a self-reached conclusion.** When a long investigation
  produces a finding that you're about to *act* on (edit, run, restructure),
  state the finding and the intended action first — don't auto-execute.
- **Before expanding scope.** If the next step goes beyond what was asked
  (extra files, a refactor, a "while I'm here" fix, running checks nobody
  requested), stop and confirm it's wanted.
- **When the thread feels uncertain.** If you've gone many steps and aren't
  sure you're still on the user's intended direction, surface that instead of
  pressing further.
- **A checkpoint that exposes a draft must end the turn.** If you surface a
  draft, exact wording, or a concrete diff for review (a public comment, a
  commit message, a payload to POST), don't execute it in the same turn — show
  *then wait* for explicit OK. Either you have enough approval to act silently
  (then skip the draft), or you don't (then stop after the draft). Showing and
  immediately executing is the worst of both — it's checkpoint theater.

This is a *cheap* checkpoint, not a full re-plan. The goal is to convert the
"15+ steps then the user interrupts to redirect" pattern into "2 lines, confirm,
continue." Don't checkpoint on trivial or clearly-on-track steps — that's noise.
