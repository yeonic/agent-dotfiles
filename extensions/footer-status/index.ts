/**
 * footer-status — context usage + Anthropic subscription usage + git PR status,
 * rendered as a single widget line near the editor.
 *
 * Why a widget, not setStatus():
 *   `@vanillagreen/pi-qol` calls `ctx.ui.setFooter(...)` to replace pi's
 *   built-in footer, which silently drops all extension setStatus() output.
 *   Using `setWidget(..., { placement: "belowEditor" })` renders a dedicated
 *   line that coexists with qol's statusline.
 *
 * Sources:
 *   • Context usage      — ctx.getContextUsage()
 *   • Subscription usage — after_provider_response headers
 *                          (anthropic-ratelimit-unified-{5h,7d}-{utilization,status,reset})
 *   • Git PR             — `gh pr view --json ...`
 *
 * Commands:
 *   /status-refresh   Force-refresh PR status now.
 *
 * Optional settings (in ~/.pi/agent/settings.json):
 *   "footerStatus": {
 *     "context": { "enabled": true },
 *     "usage":   { "enabled": true },
 *     "pr":      { "enabled": true, "refreshMs": 60000 },
 *     "placement": "belowEditor",   // or "aboveEditor"
 *     "barWidth": 10,               // gauge cells (set 0 to disable bars)
 *     "divider": true,              // draw a horizontal rule between editor and the line
 *     "debug": false                // write ~/.pi/agent/footer-status.log when true
 *   }
 */

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const WIDGET_KEY = "footer-status";
const DEFAULT_PR_REFRESH_MS = 60_000;
const PR_CMD_TIMEOUT_MS = 6_000;
const USAGE_CACHE_PATH = join(homedir(), ".pi", "agent", "footer-status-usage.json");
const USAGE_BRIDGE_PATH = join(homedir(), ".pi", "agent", "usage-bridge.json");
const UNKNOWN_ACCOUNT = "unknown";

type ColorRole = "success" | "warning" | "error" | "accent" | "dim" | "muted";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface FooterStatusConfig {
	context: { enabled: boolean };
	usage: { enabled: boolean };
	pr: { enabled: boolean; refreshMs: number };
	placement: "aboveEditor" | "belowEditor";
	barWidth: number;
	divider: boolean;
	debug: boolean;
}

function loadJson(path: string): Record<string, unknown> | undefined {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function loadConfig(cwd: string): FooterStatusConfig {
	const cfg: FooterStatusConfig = {
		// Context is already shown by the built-in progress bar above the editor,
		// so the footer omits it by default. Re-enable via footerStatus.context.enabled.
		context: { enabled: false },
		usage: { enabled: true },
		pr: { enabled: true, refreshMs: DEFAULT_PR_REFRESH_MS },
		placement: "belowEditor",
		barWidth: 6,
		divider: true,
		debug: false,
	};
	const sources = [
		loadJson(join(homedir(), ".pi", "agent", "settings.json")),
		loadJson(join(cwd, ".pi", "settings.json")),
	];
	for (const src of sources) {
		const raw = src?.footerStatus;
		if (!raw || typeof raw !== "object") continue;
		const fs = raw as {
			context?: Partial<FooterStatusConfig["context"]>;
			usage?: Partial<FooterStatusConfig["usage"]>;
			pr?: Partial<FooterStatusConfig["pr"]>;
			placement?: FooterStatusConfig["placement"];
			debug?: boolean;
		};
		if (fs.context && typeof fs.context.enabled === "boolean") cfg.context.enabled = fs.context.enabled;
		if (fs.usage && typeof fs.usage.enabled === "boolean") cfg.usage.enabled = fs.usage.enabled;
		if (fs.pr) {
			if (typeof fs.pr.enabled === "boolean") cfg.pr.enabled = fs.pr.enabled;
			if (typeof fs.pr.refreshMs === "number" && fs.pr.refreshMs > 0) cfg.pr.refreshMs = fs.pr.refreshMs;
		}
		if (fs.placement === "aboveEditor" || fs.placement === "belowEditor") cfg.placement = fs.placement;
		if (typeof (fs as { barWidth?: unknown }).barWidth === "number") {
			const bw = (fs as { barWidth: number }).barWidth;
			if (bw >= 0 && bw <= 40) cfg.barWidth = Math.floor(bw);
		}
		if (typeof (fs as { divider?: unknown }).divider === "boolean") {
			cfg.divider = (fs as { divider: boolean }).divider;
		}
		if (typeof fs.debug === "boolean") cfg.debug = fs.debug;
	}
	return cfg;
}

// ---------------------------------------------------------------------------
// Debug log (opt-in via footerStatus.debug)
// ---------------------------------------------------------------------------

const DEBUG_LOG = join(homedir(), ".pi", "agent", "footer-status.log");
let debugEnabled = true;
function dbg(msg: string): void {
	if (!debugEnabled) return;
	try {
		appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
	} catch {
		/* ignore */
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "0s";
	const s = Math.floor(ms / 1000);
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (d >= 1) return h > 0 ? `${d}d${h}h` : `${d}d`;
	if (h >= 1) return m > 0 ? `${h}h${m}m` : `${h}h`;
	if (m >= 1) return `${m}m`;
	return `${s}s`;
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
	return String(n);
}

/**
 * Render a horizontal gauge of `width` cells filled by `pct` (0..100).
 * Uses thin horizontal line characters for a slim progress-bar look.
 * (Filled: U+2501 ━ heavy horizontal; empty: U+2500 ─ light horizontal.)
 */
function renderBar(ctx: ExtensionContext, pct: number, width: number, color: ColorRole): string {
	if (width <= 0) return "";
	const theme = ctx.ui.theme;
	const clamped = Math.max(0, Math.min(100, pct));
	const fullCells = Math.min(width, Math.round((clamped / 100) * width));
	const full = "━".repeat(fullCells);
	const empty = "─".repeat(Math.max(0, width - fullCells));
	return theme.fg("dim", "[") + theme.fg(color, full) + theme.fg("dim", empty + "]");
}

function colorForPercent(pct: number): ColorRole {
	if (pct >= 85) return "error";
	if (pct >= 70) return "warning";
	return "success";
}

function lowerKeys(input: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(input)) out[k.toLowerCase()] = v;
	return out;
}

function headerVal(headers: Record<string, unknown>, key: string): string | undefined {
	const v = headers[key];
	if (typeof v === "string") return v;
	if (Array.isArray(v) && typeof v[0] === "string") return v[0];
	return undefined;
}

// ---------------------------------------------------------------------------
// Context usage
// ---------------------------------------------------------------------------

function renderContext(ctx: ExtensionContext, cfg: FooterStatusConfig): string | undefined {
	const u = ctx.getContextUsage();
	if (!u) return undefined;
	const theme = ctx.ui.theme;
	const pct = typeof u.percent === "number" ? u.percent : null;
	const color: ColorRole = pct === null ? "dim" : colorForPercent(pct);
	const pieces: string[] = [theme.fg("muted", "ctx")];
	if (cfg.barWidth > 0 && pct !== null) {
		pieces.push(renderBar(ctx, pct, cfg.barWidth, color));
	}
	if (pct !== null) pieces.push(theme.fg(color, `${Math.round(pct)}%`));
	else pieces.push(theme.fg("dim", "?%"));
	return pieces.join(" ");
}

// ---------------------------------------------------------------------------
// Subscription usage (Anthropic rate-limit headers)
// ---------------------------------------------------------------------------

interface RateWindow {
	name: string;
	status?: string;
	utilization?: number;
	resetAt?: Date;
}

interface CodexWindow {
	remainingRequests?: number;
	limitRequests?: number;
	remainingTokens?: number;
	limitTokens?: number;
	resetRequestsMs?: number;
	resetTokensMs?: number;
}

interface UsageAccountState {
	claude: Record<string, RateWindow>;
	codex?: CodexWindow;
}

const usageByAccount = new Map<string, UsageAccountState>();
let windowsLoadedAt: number | null = null;

function accountFingerprint(apiKey: string | undefined): string {
	if (!apiKey) return UNKNOWN_ACCOUNT;
	return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

async function accountKeyForProvider(ctx: ExtensionContext, provider: string): Promise<string> {
	const apiKey = await ctx.modelRegistry.getApiKeyForProvider(provider).catch(() => undefined);
	return `${provider}:${accountFingerprint(apiKey)}`;
}

function getOrInitAccountState(accountKey: string): UsageAccountState {
	const found = usageByAccount.get(accountKey);
	if (found) return found;
	const created: UsageAccountState = { claude: {} };
	usageByAccount.set(accountKey, created);
	return created;
}

function saveUsageCache(): void {
	try {
		mkdirSync(dirname(USAGE_CACHE_PATH), { recursive: true });
		const payload = {
			savedAt: new Date().toISOString(),
			accounts: Array.from(usageByAccount.entries()).map(([accountKey, state]) => ({
				accountKey,
				claude: Object.values(state.claude).map((w) => ({
					name: w.name,
					status: w.status,
					utilization: w.utilization,
					resetAt: w.resetAt ? w.resetAt.toISOString() : undefined,
				})),
				codex: state.codex,
			})),
		};
		writeFileSync(USAGE_CACHE_PATH, JSON.stringify(payload), "utf8");
	} catch {
		/* ignore */
	}
}

function loadUsageCache(): void {
	if (windowsLoadedAt !== null) return;
	windowsLoadedAt = Date.now();
	try {
		const raw = JSON.parse(readFileSync(USAGE_CACHE_PATH, "utf8")) as {
			savedAt?: string;
			accounts?: Array<{
				accountKey: string;
				claude?: Array<{ name: string; status?: string; utilization?: number; resetAt?: string }>;
				codex?: CodexWindow;
			}>;
		};
		for (const acct of raw.accounts ?? []) {
			if (!acct.accountKey) continue;
			const state: UsageAccountState = { claude: {}, codex: acct.codex };
			for (const entry of acct.claude ?? []) {
				if (!entry.name) continue;
				const w: RateWindow = { name: entry.name };
				if (entry.status) w.status = entry.status;
				if (typeof entry.utilization === "number") w.utilization = entry.utilization;
				if (entry.resetAt) {
					const t = new Date(entry.resetAt);
					if (!Number.isNaN(t.getTime()) && t.getTime() > Date.now()) {
						w.resetAt = t;
					}
				}
				state.claude[w.name] = w;
			}
			usageByAccount.set(acct.accountKey, state);
		}
		dbg(`loaded usage cache for ${usageByAccount.size} account(s) (savedAt=${raw.savedAt})`);
	} catch {
		/* no cache yet */
	}
}

function captureAnthropicHeaders(headersIn: Record<string, unknown>, accountKey: string): boolean {
	const headers = lowerKeys(headersIn);
	const names = new Set<string>();
	for (const k of Object.keys(headers)) {
		const m = k.match(/^anthropic-ratelimit-unified-([^-]+)-(status|utilization|reset)$/);
		if (m?.[1] && m[1] !== "overage" && m[1] !== "fallback" && m[1] !== "representative") names.add(m[1]);
	}
	if (names.size === 0) return false;
	const state = getOrInitAccountState(accountKey);
	let changed = false;
	for (const name of names) {
		const w: RateWindow = state.claude[name] ?? { name };
		const status = headerVal(headers, `anthropic-ratelimit-unified-${name}-status`);
		const utilRaw = headerVal(headers, `anthropic-ratelimit-unified-${name}-utilization`);
		const resetRaw = headerVal(headers, `anthropic-ratelimit-unified-${name}-reset`);
		if (status) w.status = status;
		if (utilRaw) {
			const n = Number(utilRaw);
			if (Number.isFinite(n)) w.utilization = n;
		}
		if (resetRaw) {
			const t = /^\d+$/.test(resetRaw) ? new Date(Number(resetRaw) * 1000) : new Date(resetRaw);
			if (!Number.isNaN(t.getTime())) w.resetAt = t;
		}
		state.claude[name] = w;
		changed = true;
	}
	if (changed) saveUsageCache();
	return changed;
}

function captureOpenAIHeaders(headersIn: Record<string, unknown>, accountKey: string): boolean {
	const headers = lowerKeys(headersIn);
	const state = getOrInitAccountState(accountKey);
	const next: CodexWindow = { ...(state.codex ?? {}) };
	const parseNum = (k: string): number | undefined => {
		const v = headerVal(headers, k);
		if (!v) return undefined;
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	};
	const rr = parseNum("x-ratelimit-remaining-requests");
	const lr = parseNum("x-ratelimit-limit-requests");
	const rt = parseNum("x-ratelimit-remaining-tokens");
	const lt = parseNum("x-ratelimit-limit-tokens");
	if (rr === undefined && lr === undefined && rt === undefined && lt === undefined) return false;
	if (rr !== undefined) next.remainingRequests = rr;
	if (lr !== undefined) next.limitRequests = lr;
	if (rt !== undefined) next.remainingTokens = rt;
	if (lt !== undefined) next.limitTokens = lt;
	state.codex = next;
	saveUsageCache();
	return true;
}

function colorForStatus(status: string | undefined): ColorRole {
	if (status === "limit_reached") return "error";
	if (status === "allowed_warning") return "warning";
	return "dim";
}

const WINDOW_LABEL: Record<string, string> = {
	"5h": "5h",
	"7d": "7d",
};

function renderClaudeUsage(ctx: ExtensionContext, accountKey: string, cfg: FooterStatusConfig): string | undefined {
	const state = usageByAccount.get(accountKey);
	const fallback = Array.from(usageByAccount.values()).find((s) => Object.keys(s.claude).length > 0);
	const source = state && Object.keys(state.claude).length > 0 ? state : fallback;
	if (!source) return undefined;
	const windows = Object.values(source.claude);
	if (windows.length === 0) return undefined;
	const theme = ctx.ui.theme;
	const order = ["5h", "7d"];
	const sorted = windows.sort((a, b) => {
		const ai = order.indexOf(a.name);
		const bi = order.indexOf(b.name);
		return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
	});
	const segs: string[] = [theme.fg("muted", "claude")];
	for (const w of sorted) {
		const pct = typeof w.utilization === "number" ? w.utilization * 100 : null;
		const statusColor = colorForStatus(w.status);
		const pctColor: ColorRole = pct !== null ? colorForPercent(pct) : statusColor;
		const label = WINDOW_LABEL[w.name] ?? w.name;
		const pieces: string[] = [theme.fg("muted", label)];
		if (cfg.barWidth > 0 && pct !== null) pieces.push(renderBar(ctx, pct, cfg.barWidth, pctColor));
		if (pct !== null) pieces.push(theme.fg(pctColor, `${Math.round(pct)}%`));
		if (w.resetAt) pieces.push(theme.fg("dim", fmtDuration(w.resetAt.getTime() - Date.now())));
		segs.push(pieces.join(" "));
	}
	return segs.join(theme.fg("dim", " · "));
}

function renderCodexUsage(ctx: ExtensionContext, accountKey: string): string | undefined {
	const fromAccount = usageByAccount.get(accountKey)?.codex;
	const fallback = Array.from(usageByAccount.values()).map((s) => s.codex).find(Boolean);
	const codex = fromAccount ?? fallback;
	const theme = ctx.ui.theme;
	const provider = ctx.model?.provider ?? "unknown";
	const pieces: string[] = [theme.fg("muted", "codex")];
	if (codex) {
		if (codex.remainingRequests !== undefined || codex.limitRequests !== undefined) {
			pieces.push(theme.fg("dim", `req ${codex.remainingRequests ?? "?"}/${codex.limitRequests ?? "?"}`));
		}
		if (codex.remainingTokens !== undefined || codex.limitTokens !== undefined) {
			pieces.push(theme.fg("dim", `tok ${fmtTokens(codex.remainingTokens ?? 0)}/${fmtTokens(codex.limitTokens ?? 0)}`));
		}
		return pieces.join(" ");
	}

	try {
		const raw = JSON.parse(readFileSync(USAGE_BRIDGE_PATH, "utf8")) as { providers?: Record<string, { input?: number; output?: number }> };
		const providers = Object.entries(raw.providers ?? {});
		const codexProvider = providers.find(([name]) => name.includes("openai") || name.includes("codex"));
		if (codexProvider) {
			const usage = codexProvider[1];
			const totalIn = Number(usage.input ?? 0);
			const totalOut = Number(usage.output ?? 0);
			pieces.push(theme.fg("dim", `usage in ${fmtTokens(totalIn)} out ${fmtTokens(totalOut)}`));
			return pieces.join(" ");
		}
	} catch {
		// noop
	}

	pieces.push(theme.fg("dim", `connected (${provider})`));
	return pieces.join(" ");
}

// ---------------------------------------------------------------------------
// Git PR status (gh CLI)
// ---------------------------------------------------------------------------

interface PrInfo {
	number: number;
	state: string;
	isDraft?: boolean;
	reviewDecision?: string;
	mergeable?: string;
	checks?: "PASS" | "FAIL" | "PENDING" | "NONE";
}

let lastPr: PrInfo | null | undefined = undefined;
let lastPrFetchAt = 0;
let prInFlight: Promise<void> | null = null;
let claudeProviderId = "anthropic";
let codexProviderId = "openai";

async function fetchPrInfo(pi: ExtensionAPI): Promise<PrInfo | null | undefined> {
	const fields = "number,state,isDraft,reviewDecision,mergeable,statusCheckRollup";
	const res = await pi
		.exec("gh", ["pr", "view", "--json", fields], { timeout: PR_CMD_TIMEOUT_MS })
		.catch(() => null);
	if (!res) return undefined;
	if (res.code !== 0) return null;
	try {
		const raw = JSON.parse(res.stdout) as {
			number: number;
			state: string;
			isDraft?: boolean;
			reviewDecision?: string | null;
			mergeable?: string | null;
			statusCheckRollup?: Array<{ conclusion?: string | null; status?: string | null }>;
		};
		let checks: PrInfo["checks"] = "NONE";
		const rollup = raw.statusCheckRollup ?? [];
		if (rollup.length > 0) {
			let anyFail = false;
			let anyPending = false;
			for (const r of rollup) {
				const concl = (r.conclusion ?? "").toUpperCase();
				const stat = (r.status ?? "").toUpperCase();
				if (["FAILURE", "TIMED_OUT", "CANCELLED"].includes(concl)) anyFail = true;
				else if (stat && stat !== "COMPLETED") anyPending = true;
				else if (!concl && !stat) anyPending = true;
			}
			checks = anyFail ? "FAIL" : anyPending ? "PENDING" : "PASS";
		}
		return {
			number: raw.number,
			state: raw.state,
			isDraft: raw.isDraft,
			reviewDecision: raw.reviewDecision ?? undefined,
			mergeable: raw.mergeable ?? undefined,
			checks,
		};
	} catch {
		return undefined;
	}
}

function renderPr(ctx: ExtensionContext, pr: PrInfo | null | undefined): string | undefined {
	const theme = ctx.ui.theme;
	if (pr === undefined) return undefined;
	if (pr === null) return `${theme.fg("muted", "pr")} ${theme.fg("muted", "—")}`;
	const state = pr.isDraft ? "DRAFT" : pr.state;
	const stateColor: ColorRole =
		state === "MERGED" ? "accent" : state === "CLOSED" ? "error" : state === "DRAFT" ? "muted" : "success";
	const segs: string[] = [theme.fg("muted", "pr"), theme.fg(stateColor, `#${pr.number} ${state}`)];
	if (pr.reviewDecision) {
		const map: Record<string, { sym: string; color: ColorRole }> = {
			APPROVED: { sym: "review ✓", color: "success" },
			CHANGES_REQUESTED: { sym: "review ✗", color: "error" },
			REVIEW_REQUIRED: { sym: "review ?", color: "warning" },
		};
		const m = map[pr.reviewDecision];
		if (m) segs.push(theme.fg(m.color, m.sym));
	}
	if (pr.checks && pr.checks !== "NONE") {
		const cmap: Record<string, { sym: string; color: ColorRole }> = {
			PASS: { sym: "ci ✓", color: "success" },
			FAIL: { sym: "ci ✗", color: "error" },
			PENDING: { sym: "ci …", color: "warning" },
		};
		segs.push(theme.fg(cmap[pr.checks]!.color, cmap[pr.checks]!.sym));
	}
	if (pr.mergeable === "CONFLICTING") segs.push(theme.fg("error", "conflict"));
	return segs.join(" ");
}

async function refreshPr(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	cfg: FooterStatusConfig,
	force = false,
): Promise<void> {
	if (!force && Date.now() - lastPrFetchAt < cfg.pr.refreshMs) return;
	if (prInFlight) return prInFlight;
	prInFlight = (async () => {
		try {
			lastPr = await fetchPrInfo(pi);
			lastPrFetchAt = Date.now();
			dbg(`pr fetched -> ${JSON.stringify(lastPr)}`);
			void renderWidget(ctx, cfg);
		} finally {
			prInFlight = null;
		}
	})();
	return prInFlight;
}

// ---------------------------------------------------------------------------
// Widget composition (factory form so we can draw a width-aware divider)
// ---------------------------------------------------------------------------

interface FooterWidgetState {
	lines: string[];
	divider: boolean;
	placement: "aboveEditor" | "belowEditor";
	requestRender: (() => void) | null;
	dividerStyle: (s: string) => string;
}

const widgetState: FooterWidgetState = {
	lines: [],
	divider: true,
	placement: "belowEditor",
	requestRender: null,
	dividerStyle: (s) => s,
};

let widgetMounted = false;

function ensureWidgetMounted(ctx: ExtensionContext, cfg: FooterStatusConfig): void {
	widgetState.divider = cfg.divider;
	widgetState.placement = cfg.placement;
	if (widgetMounted) return;
	widgetMounted = true;
	ctx.ui.setWidget(
		WIDGET_KEY,
		(tui, theme) => {
			widgetState.requestRender = () => tui.requestRender();
			widgetState.dividerStyle = (s: string) => theme.fg("dim", s);
			return {
				invalidate(): void {},
				dispose(): void {
					widgetState.requestRender = null;
				},
				render(width: number): string[] {
					const out: string[] = [];
					if (widgetState.divider && width > 2) {
						out.push(widgetState.dividerStyle("\u2500".repeat(Math.max(0, width - 2))));
					}
					for (const line of widgetState.lines) {
						out.push(truncateToWidth(line, width, ""));
					}
					return out;
				},
			};
		},
		{ placement: cfg.placement },
	);
}

async function renderWidget(ctx: ExtensionContext, cfg: FooterStatusConfig): Promise<void> {
	ensureWidgetMounted(ctx, cfg);
	const lines: string[] = [];
	if (cfg.pr.enabled) {
		lines.push(renderPr(ctx, lastPr) ?? `${ctx.ui.theme.fg("muted", "pr")} ${ctx.ui.theme.fg("dim", "—")}`);
	}
	if (cfg.usage.enabled) {
		const claudeKey = await accountKeyForProvider(ctx, claudeProviderId);
		const codexKey = await accountKeyForProvider(ctx, codexProviderId);
		const claude = renderClaudeUsage(ctx, claudeKey, cfg) ?? `${ctx.ui.theme.fg("muted", "claude")} ${ctx.ui.theme.fg("dim", "—")}`;
		lines.push(claude);
		lines.push(renderCodexUsage(ctx, codexKey) ?? `${ctx.ui.theme.fg("muted", "codex")} ${ctx.ui.theme.fg("dim", "—")}`);
	}
	if (cfg.context.enabled) {
		const c = renderContext(ctx, cfg);
		if (c) lines.push(c);
	}
	widgetState.lines = lines;
	if (lines.length === 0) dbg("widget cleared (no segments)");
	widgetState.requestRender?.();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
	let cfg: FooterStatusConfig | null = null;
	const getConfig = (cwd: string): FooterStatusConfig => {
		if (!cfg) {
			cfg = loadConfig(cwd);
			debugEnabled = cfg.debug;
		}
		return cfg;
	};

	pi.on("session_start", async (_event, ctx) => {
		const c = getConfig(ctx.cwd);
		dbg(`session_start cwd=${ctx.cwd}`);
		ctx.ui.notify("footer-status loaded", "info");
		if (c.usage.enabled) loadUsageCache();
		void renderWidget(ctx, c);
		if (c.pr.enabled) void refreshPr(pi, ctx, c, true);
	});

	pi.on("agent_start", async (_event, ctx) => {
		void renderWidget(ctx, getConfig(ctx.cwd));
	});

	pi.on("turn_end", async (_event, ctx) => {
		const c = getConfig(ctx.cwd);
		if (c.pr.enabled) void refreshPr(pi, ctx, c, false);
		void renderWidget(ctx, c);
	});

	pi.on("after_provider_response", async (event, ctx) => {
		const c = getConfig(ctx.cwd);
		const evt = event as { status?: number; headers?: Record<string, unknown> | unknown };
		const headersAny = evt.headers;
		let headers: Record<string, unknown> = {};
		if (headersAny && typeof (headersAny as { forEach?: unknown }).forEach === "function" && typeof (headersAny as Record<string, unknown>).get === "function") {
			(headersAny as { forEach: (cb: (v: string, k: string) => void) => void }).forEach((v, k) => {
				headers[k] = v;
			});
		} else if (headersAny && typeof headersAny === "object") {
			headers = headersAny as Record<string, unknown>;
		}
		if (!c.usage.enabled) return;
		const lower = lowerKeys(headers);
		dbg(`after_provider_response provider=${ctx.model?.provider ?? "none"} keys=${Object.keys(lower).slice(0, 20).join(",")}`);
		const hasAnthropic = Object.keys(lower).some((k) => k.startsWith("anthropic-ratelimit-unified-"));
		const hasOpenAI =
			"x-ratelimit-remaining-requests" in lower ||
			"x-ratelimit-limit-requests" in lower ||
			"x-ratelimit-remaining-tokens" in lower ||
			"x-ratelimit-limit-tokens" in lower;
		let capturedAnthropic = false;
		let capturedOpenAI = false;
		if (hasAnthropic) {
			claudeProviderId = ctx.model?.provider ?? claudeProviderId;
			const claudeKey = await accountKeyForProvider(ctx, claudeProviderId);
			capturedAnthropic = captureAnthropicHeaders(headers, claudeKey);
		}
		if (hasOpenAI) {
			codexProviderId = ctx.model?.provider ?? codexProviderId;
			const codexKey = await accountKeyForProvider(ctx, codexProviderId);
			capturedOpenAI = captureOpenAIHeaders(headers, codexKey);
		}
		dbg(`capture results anth=${capturedAnthropic} openai=${capturedOpenAI} claudeProvider=${claudeProviderId} codexProvider=${codexProviderId}`);
		if (capturedAnthropic || capturedOpenAI) void renderWidget(ctx, c);
	});

	pi.on("message_update", (_event, ctx) => {
		void renderWidget(ctx, getConfig(ctx.cwd));
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		widgetMounted = false;
		widgetState.lines = [];
		widgetState.requestRender = null;
	});

	pi.registerCommand("status-refresh", {
		description: "Refresh footer subscription/PR/context status now",
		handler: async (_args, ctx) => {
			const c = getConfig(ctx.cwd);
			await refreshPr(pi, ctx, c, true);
			void renderWidget(ctx, c);
			ctx.ui.notify("Footer status refreshed", "info");
		},
	});
}
