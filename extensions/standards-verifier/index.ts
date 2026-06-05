// standards-verifier: split coding standards into generation-time guidance and
// a grounded post-write verification net, keeping the base prompt lean.
//
// Two phases:
//
//   WRITE-TIME (before_agent_start): inject the *coding* standards (small, ~1k
//   tokens) into the system prompt for this run, so they steer the code as it
//   is generated. Full text — no lossy compression, so behavior stays stable
//   run to run. Fresh each run, and the base prompt is short, so it is salient
//   instead of buried like the old long AGENTS.md.
//
//   REVIEW-TIME (after edit/write): queue ONE follow-up message that forces a
//   self-review of the diff against the *testing* standards AND demands the
//   agent actually run the project's lint / type-check / test tooling. Grounded
//   tool output, not vibes, is what catches violations a lenient self-review
//   would wave through.
//
// Standards are split by filename:
//   - "coding"  -> write-time (system prompt)
//   - everything else (e.g. "testing") -> review-time (follow-up)
//
// Loop-safe: the review is injected via sendUserMessage (source "extension"),
// which does NOT reset state, so edits made while fixing violations do not
// spawn another review. State resets only on a real user prompt.

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extDir = dirname(realpathSync(fileURLToPath(import.meta.url)));
const STANDARDS_DIR =
  process.env.PI_STANDARDS_DIR || resolve(extDir, "../../docs/standards");

// File extensions considered "code" worth verifying.
const CODE_EXT = new Set([
  ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs", ".swift",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".sh", ".bash", ".sql",
]);

// Filenames matching this are injected at write-time; the rest at review-time.
const isWriteTimeStandard = (file: string): boolean => file.includes("coding");

function isCodeFile(path: string | undefined): boolean {
  if (!path) return false;
  // Skip the standards docs themselves and generated context files.
  if (path.includes("/docs/standards/") || path.endsWith("AGENTS.md")) {
    return false;
  }
  return CODE_EXT.has(extname(path).toLowerCase());
}

// Load standards whose filename satisfies `pick`, concatenated as tagged blocks.
function loadStandards(pick: (file: string) => boolean): string {
  if (!existsSync(STANDARDS_DIR)) return "";
  const files = readdirSync(STANDARDS_DIR)
    .filter((f) => f.endsWith(".md") && pick(f))
    .sort();
  return files
    .map((f) => {
      const body = readFileSync(resolve(STANDARDS_DIR, f), "utf8").trim();
      return `<standard file="${f}">\n${body}\n</standard>`;
    })
    .join("\n\n");
}

function buildWriteTimeBlock(): string {
  const standards = loadStandards(isWriteTimeStandard);
  if (!standards) return "";
  return [
    "## Coding standards (apply while writing code)",
    "",
    "Follow these as you write. They are judgment-level conventions that",
    "linters cannot enforce; honor them in the code you produce, not as an",
    "afterthought.",
    "",
    standards,
  ].join("\n");
}

function buildReviewMessage(): string {
  const standards = loadStandards((f) => !isWriteTimeStandard(f));
  return [
    "[Self-review required before finishing]",
    "",
    "You changed code in this turn. Do NOT consider the task done yet.",
    "",
    "1. Run `git diff` to see everything you changed this turn.",
    "2. Run this project's lint / format / type-check / test tooling on the",
    "   changes (use whatever the repo defines) and fix what it reports.",
    "3. Check the diff against the testing standards below; apply them only if",
    "   you added or changed real logic or tests.",
    "4. List any violations you found and the fixes you made.",
    "5. If everything already conforms and tooling passes, say so in one line.",
    "",
    standards,
  ].join("\n");
}

export default (pi: any) => {
  let reviewSent = false;

  const reset = () => {
    reviewSent = false;
  };

  // WRITE-TIME: steer generation by injecting coding standards into this run's
  // system prompt. Chains onto whatever earlier handlers produced.
  pi.on("before_agent_start", (event: any) => {
    const block = buildWriteTimeBlock();
    if (!block) return;
    return { systemPrompt: event.systemPrompt + "\n\n" + block };
  });

  // Only a genuine user prompt starts a new task. Our own injected review
  // arrives with source "extension" and must NOT reset state (avoids loops).
  pi.on("input", (event: any) => {
    if (event.source === "extension") return;
    reset();
  });

  // REVIEW-TIME: tool_result carries both the tool input (path) and the error
  // flag. On the first successful code edit, queue one grounded review.
  pi.on("tool_result", (event: any) => {
    if (event.isError) return;
    if (event.toolName !== "edit" && event.toolName !== "write") return;

    const path: string | undefined = event.input?.path;
    if (!isCodeFile(path)) return;

    if (reviewSent) return;
    reviewSent = true;

    // Delivered once the agent has no more tool calls.
    pi.sendUserMessage(buildReviewMessage(), { deliverAs: "followUp" });
  });
};
