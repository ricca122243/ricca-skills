import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env.js";
import { fileExists } from "./cache.js";
import { estimateShotCost } from "./estimate.js";
import { loadConfig, saveConfig, rememberEngineChoice, rememberBudgetPolicy, type BudgetPolicy } from "./config.js";
import { isInteractive, selectMenu, confirm, promptNumber } from "./prompt.js";
import type { Shot, ShotEngine } from "./types.js";

/**
 * A single append-only ledger of actual spend across every project, so a
 * lifetime budget (BUDGET_USD_LIMIT in .env) is enforced regardless of
 * which project a shot belongs to. Cache hits never touch this file — a
 * reused clip cost nothing the second time.
 */
const LEDGER_PATH = path.resolve(process.cwd(), ".reelsmith-spend.json");
const ENV_PATH = path.resolve(process.cwd(), ".env");

export interface SpendEntry {
  timestamp: string;
  project: string;
  shotId: string;
  usd: number;
}

interface Ledger {
  entries: SpendEntry[];
}

async function loadLedger(): Promise<Ledger> {
  if (!(await fileExists(LEDGER_PATH))) return { entries: [] };
  const raw = await readFile(LEDGER_PATH, "utf8");
  return JSON.parse(raw) as Ledger;
}

async function saveLedger(ledger: Ledger): Promise<void> {
  await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

export async function totalSpentUsd(): Promise<number> {
  const ledger = await loadLedger();
  return ledger.entries.reduce((sum, e) => sum + e.usd, 0);
}

export async function recordSpend(project: string, shotId: string, usd: number): Promise<void> {
  const ledger = await loadLedger();
  ledger.entries.push({ timestamp: new Date().toISOString(), project, shotId, usd });
  await saveLedger(ledger);
}

async function raiseBudgetLimit(newLimit: number): Promise<void> {
  let lines: string[] = [];
  if (await fileExists(ENV_PATH)) {
    lines = (await readFile(ENV_PATH, "utf8")).split("\n");
  }
  const idx = lines.findIndex((l) => l.startsWith("BUDGET_USD_LIMIT="));
  const line = `BUDGET_USD_LIMIT=${newLimit}`;
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  await writeFile(ENV_PATH, lines.join("\n").replace(/\n*$/, "\n"));
  process.env.BUDGET_USD_LIMIT = String(newLimit);
}

export class BudgetAbortError extends Error {}

export type BudgetOutcome =
  | { action: "proceed" | "allow" }
  | { action: "downgrade"; engine: ShotEngine }
  | { action: "skip" }
  | { action: "abort" };

function otherEngine(engine: ShotEngine): ShotEngine {
  return engine === "seedance" ? "gemini" : "seedance";
}

/**
 * Decides what to do about a shot that (with its current engine) would
 * push lifetime spend over BUDGET_USD_LIMIT. Never throws to hard-stop the
 * whole render by itself — it always resolves to an outcome, including
 * "abort" (which the caller turns into a clean stop, not a crash).
 *
 * Precedence for how the decision gets made:
 *   1. `cliPolicy` — an explicit --on-budget flag for this run.
 *   2. persisted `.reelsmith-config.json` default (remembered from a past choice).
 *   3. an interactive terminal — ask, with the option to remember the answer.
 *   4. non-interactive with no policy configured — "skip", loudly logged
 *      with the exact commands to get a different outcome. This is the
 *      path an AI agent driving the CLI hits: it gets a clear, parseable
 *      menu of next commands instead of a stack trace, and can choose one
 *      itself (or hand the choice to the human it's working with).
 */
export async function resolveBudgetChoice(
  slug: string,
  shot: Shot,
  dueUsd: number,
  cliPolicy?: BudgetPolicy
): Promise<BudgetOutcome> {
  const limit = env.budgetLimitUsd();
  if (limit === undefined) return { action: "proceed" };

  const spent = await totalSpentUsd();
  if (spent + dueUsd <= limit) return { action: "proceed" };

  const remaining = Math.max(0, limit - spent);
  const alt = otherEngine(shot.engine);
  const altCost = estimateShotCost({ ...shot, engine: alt }).total;
  const config = await loadConfig();
  const policy = cliPolicy ?? config.onBudgetExceeded;

  const overBy = (spent + dueUsd - limit).toFixed(2);

  if (policy && policy !== "ask") {
    console.warn(
      `[${shot.id}] over budget by $${overBy} (spent $${spent.toFixed(2)} of $${limit.toFixed(2)}) — applying policy "${policy}"`
    );
    return applyPolicy(policy, config.fallbackEngine ?? alt);
  }

  if (isInteractive()) {
    console.log(
      `\n[${shot.id}] would push lifetime spend to $${(spent + dueUsd).toFixed(2)}, over the $${limit.toFixed(2)} cap (over by $${overBy}). Remaining budget: $${remaining.toFixed(2)}.`
    );
    const downgradeWarning = shot.nativeAudio
      ? ` — note: ${alt} won't generate native audio/lip-sync like ${shot.engine} does`
      : "";
    const choice = await selectMenu<BudgetOutcome["action"]>("What do you want to do?", [
      { value: "downgrade", label: `Switch this shot to ${alt} (~$${altCost.toFixed(2)})${downgradeWarning}` },
      { value: "allow", label: `Render it anyway with ${shot.engine} (~$${dueUsd.toFixed(2)}, goes over budget)` },
      { value: "skip", label: "Skip this shot (silent placeholder, render continues, $0)" },
      { value: "abort", label: "Stop the whole render here" },
    ]);

    if (choice === "abort") return { action: "abort" };

    if (choice === "downgrade") {
      const remember = await confirm(`Always downgrade over-budget shots to ${alt} from now on?`, false);
      if (remember) {
        await rememberBudgetPolicy("downgrade");
        await saveFallbackEngine(alt);
      } else {
        const rememberShot = await confirm(`Remember ${alt} for shot "${shot.id}" specifically?`, false);
        if (rememberShot) await rememberEngineChoice(slug, shot.id, alt);
      }
      return { action: "downgrade", engine: alt };
    }

    if (choice === "allow") {
      const remember = await confirm("Always allow over-budget shots to render (raise as you go)?", false);
      if (remember) await rememberBudgetPolicy("allow");
      return { action: "allow" };
    }

    if (choice === "skip") {
      const remember = await confirm("Always skip over-budget shots by default?", false);
      if (remember) await rememberBudgetPolicy("skip");
      return { action: "skip" };
    }

    // Fallback: offer to raise the cap outright.
    const newLimit = await promptNumber(`New BUDGET_USD_LIMIT (currently $${limit.toFixed(2)}): `);
    if (newLimit !== undefined) {
      await raiseBudgetLimit(newLimit);
      return { action: "proceed" };
    }
    return { action: "skip" };
  }

  // Non-interactive (an AI agent or a script driving this CLI) with no
  // configured default: never crash the run. Skip this shot, and print the
  // exact next commands so whoever/whatever is orchestrating this can pick.
  console.warn(
    `\n[${shot.id}] over budget by $${overBy} (spent $${spent.toFixed(2)} of $${limit.toFixed(2)} cap) — no --on-budget policy set and no TTY to ask, so this shot is being SKIPPED (silent placeholder).\n` +
      `To get a different outcome, re-run with one of:\n` +
      `  --on-budget allow      render it anyway (~$${dueUsd.toFixed(2)}, over budget)\n` +
      `  --on-budget downgrade  switch to ${alt} (~$${altCost.toFixed(2)})\n` +
      `  --on-budget skip       keep skipping silently (removes this warning)\n` +
      `Or raise the cap: set BUDGET_USD_LIMIT in .env, or run \`reelsmith config set on-budget-exceeded <policy>\` to stop being asked.\n`
  );
  return { action: "skip" };
}

async function applyPolicy(policy: BudgetPolicy, fallbackEngine: ShotEngine): Promise<BudgetOutcome> {
  switch (policy) {
    case "allow":
      return { action: "allow" };
    case "downgrade":
      return { action: "downgrade", engine: fallbackEngine };
    case "abort":
      return { action: "abort" };
    case "skip":
    default:
      return { action: "skip" };
  }
}

async function saveFallbackEngine(engine: ShotEngine): Promise<void> {
  const config = await loadConfig();
  config.fallbackEngine = engine;
  await saveConfig(config);
}
