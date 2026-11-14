#!/usr/bin/env tsx
import { Command } from "commander";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { scaffoldProject, projectExists, loadShots, projectDir } from "./lib/project.js";
import { loadStyle } from "./lib/style.js";
import { renderProject } from "./lib/render.js";
import { estimateProjectCost } from "./lib/estimate.js";
import { totalSpentUsd } from "./lib/budget.js";
import { env, envStatus, REQUIRED_ENV_KEYS } from "./lib/env.js";
import { planProject } from "./lib/plan.js";
import { loadConfig, saveConfig, engineOverrideKey, type BudgetPolicy } from "./lib/config.js";
import type { ShotEngine } from "./lib/types.js";

const program = new Command();
program.name("reelsmith").description("Local short-form video generation CLI").version("0.1.0");

program
  .command("env-check")
  .description("Report which required API keys are set in .env (presence only, never prints values)")
  .action(async () => {
    const status = envStatus();
    const missing = REQUIRED_ENV_KEYS.filter((k) => !status[k]);
    for (const k of REQUIRED_ENV_KEYS) console.log(`${k}: ${status[k] ? "set" : "MISSING"}`);
    console.log(`BUDGET_USD_LIMIT: ${status.BUDGET_USD_LIMIT ? "set" : "unset (optional)"}`);
    if (missing.length > 0) {
      console.log(
        `\nMissing: ${missing.join(", ")}.\n` +
          `If an AI agent is driving this CLI: ask the user for each missing key in chat ` +
          `(see README.md for where to get each one), then write/update .env yourself — ` +
          `copy .env.example to .env first if .env doesn't exist. Never guess or reuse a key ` +
          `from elsewhere, and don't echo the value back once it's written.`
      );
      process.exitCode = 1;
    } else {
      console.log("\nAll required keys are set.");
    }
  });

program
  .command("styles")
  .description("List available styles")
  .action(async () => {
    const dir = path.resolve(process.cwd(), "styles");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    for (const f of files) console.log(f.replace(/\.json$/, ""));
  });

program
  .command("init <slug>")
  .description("Scaffold a new project under ./projects/<slug>/")
  .requiredOption("--style <name>", "style name from ./styles/<name>.json")
  .action(async (slug: string, opts: { style: string }) => {
    if (await projectExists(slug)) {
      throw new Error(`Project "${slug}" already exists at ${projectDir(slug)}`);
    }
    await loadStyle(opts.style); // validates the style exists before scaffolding
    await scaffoldProject(slug, opts.style);
    console.log(`Created ${projectDir(slug)}`);
    console.log(`Next: write brief.md and script.md, then fill shots.json.`);
  });

program
  .command("shots <slug>")
  .description("List shots for a project")
  .action(async (slug: string) => {
    const shots = await loadShots(slug);
    if (shots.length === 0) {
      console.log("No shots yet — add entries to shots.json.");
      return;
    }
    for (const shot of shots) {
      const vo = shot.voiceover ? "voiceover" : shot.nativeAudio ? "native-audio" : "silent";
      console.log(`${shot.id}\t${shot.engine}\t${shot.durationSeconds}s\t${vo}`);
    }
  });

program
  .command("estimate <slug>")
  .description("Estimate the cost of rendering a project at current default prices")
  .action(async (slug: string) => {
    const shots = await loadShots(slug);
    const { lines, totalUsd } = estimateProjectCost(shots);
    for (const l of lines) {
      console.log(
        `${l.shotId}\t${l.engine}\tvideo=$${l.videoCost.toFixed(3)}\tvoiceover=$${l.voiceoverCost.toFixed(3)}\ttotal=$${l.total.toFixed(3)}`
      );
    }
    console.log(`---\nEstimated total: $${totalUsd.toFixed(2)} (prices are rough defaults — see src/lib/estimate.ts)`);
  });

program
  .command("plan <slug>")
  .description("Show/choose per-shot engine with cost preview (interactive in a real terminal)")
  .action(async (slug: string) => {
    await planProject(slug);
  });

program
  .command("render <slug>")
  .description("Render a project's shots and stitch the final video")
  .option("--shot <id>", "only render a single shot (others are reused/cached)")
  .option("--force", "ignore cache and regenerate every targeted shot", false)
  .option("--ignore-budget", "deprecated alias for --on-budget allow", false)
  .option(
    "--on-budget <policy>",
    "what to do when a shot would exceed BUDGET_USD_LIMIT: ask|skip|downgrade|allow|abort " +
      "(default: ask if interactive, otherwise skip — see README)"
  )
  .action(
    async (
      slug: string,
      opts: { shot?: string; force: boolean; ignoreBudget: boolean; onBudget?: BudgetPolicy }
    ) => {
      const finalPath = await renderProject(slug, {
        onlyShotId: opts.shot,
        forceAll: opts.force,
        ignoreBudget: opts.ignoreBudget,
        onBudget: opts.onBudget,
      });
      console.log(`Rendered: ${finalPath}`);
    }
  );

program
  .command("cache-clear <slug>")
  .description("Delete the cached generated clips for a project (voiceover/render outputs are untouched)")
  .action(async (slug: string) => {
    const cacheDir = path.join(projectDir(slug), "render", "cache");
    await rm(cacheDir, { recursive: true, force: true });
    console.log(`Cleared ${cacheDir}`);
  });

program
  .command("budget")
  .description("Show lifetime spend recorded across all projects, and the configured cap")
  .action(async () => {
    const spent = await totalSpentUsd();
    const limit = env.budgetLimitUsd();
    console.log(`Spent so far: $${spent.toFixed(2)}`);
    console.log(
      limit === undefined
        ? "No cap set (BUDGET_USD_LIMIT unset in .env)."
        : `Cap: $${limit.toFixed(2)} — remaining: $${Math.max(0, limit - spent).toFixed(2)}`
    );
  });

const configCmd = program.command("config").description("View or set persisted local preferences (.reelsmith-config.json)");

configCmd
  .command("show")
  .description("Print the current config")
  .action(async () => {
    console.log(JSON.stringify(await loadConfig(), null, 2));
  });

configCmd
  .command("set-on-budget <policy>")
  .description("Set the default policy for over-budget shots: ask|skip|downgrade|allow|abort")
  .action(async (policy: string) => {
    const valid = ["ask", "skip", "downgrade", "allow", "abort"];
    if (!valid.includes(policy)) {
      throw new Error(`Policy must be one of ${valid.join(", ")}`);
    }
    const config = await loadConfig();
    config.onBudgetExceeded = policy as BudgetPolicy;
    await saveConfig(config);
    console.log(`onBudgetExceeded = ${policy}`);
  });

configCmd
  .command("set-fallback-engine <engine>")
  .description("Set the engine used when policy is 'downgrade' (seedance|gemini)")
  .action(async (engine: string) => {
    if (engine !== "seedance" && engine !== "gemini") {
      throw new Error(`Engine must be "seedance" or "gemini"`);
    }
    const config = await loadConfig();
    config.fallbackEngine = engine as ShotEngine;
    await saveConfig(config);
    console.log(`fallbackEngine = ${engine}`);
  });

configCmd
  .command("set-shot-engine <slug> <shotId> <engine>")
  .description("Remember a specific engine for one shot, overriding shots.json")
  .action(async (slug: string, shotId: string, engine: string) => {
    if (engine !== "seedance" && engine !== "gemini") {
      throw new Error(`Engine must be "seedance" or "gemini"`);
    }
    const config = await loadConfig();
    config.engineOverrides = config.engineOverrides ?? {};
    config.engineOverrides[engineOverrideKey(slug, shotId)] = engine as ShotEngine;
    await saveConfig(config);
    console.log(`${slug}/${shotId} -> ${engine}`);
  });

configCmd
  .command("forget-shot-engine <slug> <shotId>")
  .description("Remove a remembered per-shot engine override")
  .action(async (slug: string, shotId: string) => {
    const config = await loadConfig();
    if (config.engineOverrides) delete config.engineOverrides[engineOverrideKey(slug, shotId)];
    await saveConfig(config);
    console.log(`Forgot override for ${slug}/${shotId}`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
