import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const OUT_PATH = join(homedir(), ".pi", "agent", "usage-bridge.json");

interface ProviderUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  tokens: number;
  cost: number;
  messages: number;
}

async function collectJsonlFiles(dir: string, out: string[]): Promise<void> {
  let entries: Array<import("node:fs").Dirent> = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await collectJsonlFiles(p, out);
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
}

async function buildUsageSnapshot(): Promise<Record<string, ProviderUsage>> {
  const root = join(homedir(), ".pi", "agent", "sessions");
  const files: string[] = [];
  await collectJsonlFiles(root, files);

  const byProvider = new Map<string, ProviderUsage>();
  const seen = new Set<string>();

  for (const file of files) {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry?.type !== "message" || entry?.message?.role !== "assistant") continue;
      const msg = entry.message;
      const usage = msg?.usage;
      const provider = String(msg?.provider ?? "unknown");
      if (!usage) continue;

      const input = Number(usage.input ?? 0);
      const output = Number(usage.output ?? 0);
      const cacheRead = Number(usage.cacheRead ?? 0);
      const cacheWrite = Number(usage.cacheWrite ?? 0);
      const cost = Number(usage.cost?.total ?? 0);
      const ts = Number(msg.timestamp ?? 0);
      const dedupe = `${ts}:${input + output + cacheRead + cacheWrite}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const prev = byProvider.get(provider) ?? {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        tokens: 0,
        cost: 0,
        messages: 0,
      };
      prev.input += input;
      prev.output += output;
      prev.cacheRead += cacheRead;
      prev.cacheWrite += cacheWrite;
      prev.tokens += input + output + cacheWrite;
      prev.cost += cost;
      prev.messages += 1;
      byProvider.set(provider, prev);
    }
  }

  return Object.fromEntries(byProvider.entries());
}

let inFlight = false;
let queued = false;
async function refreshSnapshot(): Promise<void> {
  if (inFlight) {
    queued = true;
    return;
  }
  inFlight = true;
  try {
    const data = await buildUsageSnapshot();
    await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
    await writeFile(
      OUT_PATH,
      JSON.stringify({ updatedAt: new Date().toISOString(), providers: data }),
      "utf8"
    );
  } catch {
    // noop
  } finally {
    inFlight = false;
    if (queued) {
      queued = false;
      void refreshSnapshot();
    }
  }
}

export default function (pi: ExtensionAPI): void {
  const trigger = () => void refreshSnapshot();

  pi.on("session_start", () => trigger());
  pi.on("turn_end", () => trigger());
  pi.on("session_shutdown", () => trigger());

  // first run when extension loads
  if (!existsSync(OUT_PATH)) trigger();
}
