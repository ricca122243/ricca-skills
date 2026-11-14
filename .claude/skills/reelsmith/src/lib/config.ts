import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ShotEngine } from "./types.js";
import { fileExists } from "./cache.js";

/**
 * Local, machine-specific preferences — NOT secrets, but not something to
 * commit either (it records this user's choices, e.g. "always downgrade to
 * gemini when over budget", or a specific shot they picked gemini for after
 * seeing the cost). Persists across sessions so the CLI never re-asks the
 * same question twice.
 */
const CONFIG_PATH = path.resolve(process.cwd(), ".reelsmith-config.json");

export type BudgetPolicy = "ask" | "skip" | "downgrade" | "allow" | "abort";

export interface ReelsmithConfig {
  /** What to do, by default, when a shot would exceed BUDGET_USD_LIMIT. */
  onBudgetExceeded?: BudgetPolicy;
  /** Engine to switch to when policy is "downgrade" and no per-shot override exists. */
  fallbackEngine?: ShotEngine;
  /** "<slug>/<shotId>" -> engine the user picked, remembered across sessions. */
  engineOverrides?: Record<string, ShotEngine>;
}

export async function loadConfig(): Promise<ReelsmithConfig> {
  if (!(await fileExists(CONFIG_PATH))) return {};
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as ReelsmithConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(config: ReelsmithConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function engineOverrideKey(slug: string, shotId: string): string {
  return `${slug}/${shotId}`;
}

export async function rememberEngineChoice(
  slug: string,
  shotId: string,
  engine: ShotEngine
): Promise<void> {
  const config = await loadConfig();
  config.engineOverrides = config.engineOverrides ?? {};
  config.engineOverrides[engineOverrideKey(slug, shotId)] = engine;
  await saveConfig(config);
}

export async function rememberBudgetPolicy(policy: BudgetPolicy): Promise<void> {
  const config = await loadConfig();
  config.onBudgetExceeded = policy;
  await saveConfig(config);
}
