// experimental-injector: inject docs/experimental/*.md into pi's system prompt
// for each turn. Use docs/experimental as a staging area for rules being
// evaluated. Promote successful ones to docs/integrated and rebuild AGENTS.md.

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve repo location even when this file is loaded via symlink from
// ~/.pi/agent/extensions/experimental-injector/index.ts.
const extDir = dirname(realpathSync(fileURLToPath(import.meta.url)));
const EXP_DIR =
  process.env.PI_EXPERIMENTAL_DIR ||
  resolve(extDir, "../../docs/experimental");

export default (pi: any) => {
  pi.on("before_agent_start", async (event: any) => {
    if (!existsSync(EXP_DIR)) return;

    const files = readdirSync(EXP_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (files.length === 0) return;

    const sections = files.map((f) => {
      const body = readFileSync(join(EXP_DIR, f), "utf8").trim();
      return `<!-- experimental: ${f} -->\n${body}`;
    });

    const block = [
      "## Experimental Rules (under evaluation)",
      "",
      "The following rules are being tested. Apply them like permanent rules,",
      "but treat them as not yet finalized — feedback in actual use will",
      "decide whether they graduate to integrated rules.",
      "",
      ...sections,
    ].join("\n");

    return {
      systemPrompt: event.systemPrompt + "\n\n" + block,
    };
  });
};
