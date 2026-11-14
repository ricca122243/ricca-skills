import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadShots, loadManifest, projectDir } from "./project.js";
import { loadStyle } from "./style.js";
import { estimateShotCost } from "./estimate.js";
import { isInteractive, selectMenu } from "./prompt.js";
import type { Shot, ShotEngine } from "./types.js";

/**
 * Walks every shot in a project, shows what each engine would cost, and
 * (interactively) lets the user pick per shot instead of it being locked
 * in whenever shots.json was written. Non-interactively (an AI agent
 * driving this CLI, or output piped somewhere) it just prints the cost
 * table — engine choice stays whatever shots.json already says, since
 * there's no one to ask.
 */
export async function planProject(slug: string): Promise<void> {
  const manifest = await loadManifest(slug);
  const style = await loadStyle(manifest.style);
  const shots = await loadShots(slug);
  if (shots.length === 0) {
    console.log("No shots yet — add entries to shots.json before planning.");
    return;
  }

  let changed = false;

  for (const shot of shots) {
    const seedanceCost = estimateShotCost({ ...shot, engine: "seedance" });
    const geminiCost = estimateShotCost({ ...shot, engine: "gemini" });

    if (isInteractive()) {
      const nativeAudioNote = shot.nativeAudio
        ? " (native audio/lip-sync — gemini won't generate this)"
        : "";
      const choice = await selectMenu<ShotEngine>(
        `\n[${shot.id}] "${shot.prompt.slice(0, 60)}${shot.prompt.length > 60 ? "…" : ""}"`,
        [
          {
            value: "seedance",
            label: `seedance — ~$${seedanceCost.total.toFixed(2)}${shot.engine === "seedance" ? " (current)" : ""}${nativeAudioNote}`,
          },
          {
            value: "gemini",
            label: `gemini — ~$${geminiCost.total.toFixed(2)}${shot.engine === "gemini" ? " (current)" : ""}`,
          },
        ]
      );
      if (choice !== shot.engine) {
        shot.engine = choice;
        changed = true;
      }
    } else {
      console.log(
        `${shot.id}\tcurrent=${shot.engine}\tseedance=$${seedanceCost.total.toFixed(2)}\tgemini=$${geminiCost.total.toFixed(2)}`
      );
    }
  }

  if (!isInteractive()) {
    console.log(
      "\nNon-interactive — no changes made. Edit shots.json directly to change a shot's engine, " +
        "or run `reelsmith plan <slug>` in a real terminal to pick per shot interactively."
    );
    return;
  }

  if (changed) {
    const file = path.join(projectDir(slug), "shots.json");
    await writeFile(file, JSON.stringify(shots, null, 2) + "\n");
    console.log(`\nUpdated ${file}`);
  } else {
    console.log("\nNo changes.");
  }
}
