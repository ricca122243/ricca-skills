import path from "node:path";
import { mkdir, readFile, writeFile as writeFileRaw } from "node:fs/promises";
import type { ProjectManifest, Shot, Style } from "./types.js";
import { loadShots, loadManifest, projectDir } from "./project.js";
import { loadStyle } from "./style.js";
import {
  shotCacheKey,
  cacheClipPath,
  cacheNarrationAudioPath,
  cacheNarrationWordsPath,
  fileExists,
  copyFromCache,
} from "./cache.js";
import { generateSeedanceShot } from "./seedance.js";
import { generateGeminiShot } from "./gemini.js";
import { synthesizeNarration, type WordTiming } from "./elevenlabs.js";
import { writeAssCaptions } from "./captions.js";
import { runFfmpeg, generatePlaceholderClip } from "./ffmpeg.js";
import { estimateShotCost } from "./estimate.js";
import { resolveBudgetChoice, recordSpend, BudgetAbortError } from "./budget.js";
import { loadConfig, engineOverrideKey, type BudgetPolicy } from "./config.js";

export interface RenderOptions {
  onlyShotId?: string;
  forceAll?: boolean;
  /** Deprecated shorthand for onBudget: "allow". */
  ignoreBudget?: boolean;
  onBudget?: BudgetPolicy;
}

export async function renderProject(slug: string, opts: RenderOptions = {}): Promise<string> {
  const manifest: ProjectManifest = await loadManifest(slug);
  const style: Style = await loadStyle(manifest.style);
  const shots: Shot[] = await loadShots(slug);
  if (shots.length === 0) {
    throw new Error(`shots.json is empty for project "${slug}" — add shots before rendering.`);
  }

  const dir = projectDir(slug);
  const cacheDir = path.join(dir, "render", "cache");
  const clipsDir = path.join(dir, "render", "clips");
  const audioDir = path.join(dir, "render", "audio");
  await mkdir(cacheDir, { recursive: true });
  await mkdir(clipsDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });

  const targets = opts.onlyShotId ? shots.filter((s) => s.id === opts.onlyShotId) : shots;
  if (opts.onlyShotId && targets.length === 0) {
    throw new Error(`No shot with id "${opts.onlyShotId}" in shots.json`);
  }

  const cliPolicy: BudgetPolicy | undefined = opts.ignoreBudget ? "allow" : opts.onBudget;
  const config = await loadConfig();

  const finishedClipPaths: string[] = [];

  for (const shot of shots) {
    const isTarget = !opts.onlyShotId || shot.id === opts.onlyShotId;
    const finalClipPath = path.join(clipsDir, `${shot.id}.mp4`);

    try {
      if (isTarget) {
        await renderShot(slug, shot, style, cacheDir, audioDir, finalClipPath, opts.forceAll, cliPolicy, config);
      } else if (!(await fileExists(finalClipPath))) {
        // A shot outside the --shot filter that has never been rendered:
        // it must be rendered too, or the final concat will be missing it.
        await renderShot(slug, shot, style, cacheDir, audioDir, finalClipPath, false, cliPolicy, config);
      }
    } catch (err) {
      if (err instanceof BudgetAbortError) {
        console.warn(`Render stopped at shot "${shot.id}": ${err.message}`);
        console.warn(
          `${finishedClipPaths.length}/${shots.length} shots finished; re-run \`render ${slug}\` to continue where this left off (cached shots are free).`
        );
        throw err;
      }
      throw err;
    }

    finishedClipPaths.push(finalClipPath);
  }

  const finalPath = path.join(dir, "render", "final.mp4");
  await concatClips(finishedClipPaths, finalPath);
  return finalPath;
}

async function renderShot(
  slug: string,
  originalShot: Shot,
  style: Style,
  cacheDir: string,
  audioDir: string,
  finalClipPath: string,
  force = false,
  cliPolicy: BudgetPolicy | undefined,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  // A remembered per-shot engine choice (from a past "downgrade" decision,
  // or set directly via `config set-engine`) wins over shots.json.
  const remembered = config.engineOverrides?.[engineOverrideKey(slug, originalShot.id)];
  let shot: Shot = remembered && remembered !== originalShot.engine
    ? { ...originalShot, engine: remembered }
    : originalShot;

  let key = shotCacheKey(shot, style);
  let rawCachePath = cacheClipPath(cacheDir, key);
  const forceRegen = force || shot.forceRegenerate;
  let videoCached = !forceRegen && (await fileExists(rawCachePath));

  let cost = estimateShotCost(shot);
  let narrationAudioPath = cacheNarrationAudioPath(cacheDir, key);
  let narrationWordsPath = cacheNarrationWordsPath(cacheDir, key);
  let narrationCached =
    !forceRegen &&
    shot.voiceover !== undefined &&
    (await fileExists(narrationAudioPath)) &&
    (await fileExists(narrationWordsPath));

  let dueUsd = (videoCached ? 0 : cost.videoCost) + (narrationCached ? 0 : cost.voiceoverCost);

  if (dueUsd > 0) {
    const outcome = await resolveBudgetChoice(slug, shot, dueUsd, cliPolicy);

    if (outcome.action === "abort") {
      throw new BudgetAbortError(`stopped by budget policy at shot "${shot.id}"`);
    }

    if (outcome.action === "skip") {
      console.log(`[${shot.id}] skipped (budget) — writing placeholder clip`);
      await generatePlaceholderClip(
        shot.durationSeconds,
        style.width,
        style.height,
        style.fps,
        `[skipped: budget — ${shot.id}]`,
        finalClipPath
      );
      return;
    }

    if (outcome.action === "downgrade") {
      shot = { ...shot, engine: outcome.engine };
      key = shotCacheKey(shot, style);
      rawCachePath = cacheClipPath(cacheDir, key);
      videoCached = !forceRegen && (await fileExists(rawCachePath));
      cost = estimateShotCost(shot);
      narrationAudioPath = cacheNarrationAudioPath(cacheDir, key);
      narrationWordsPath = cacheNarrationWordsPath(cacheDir, key);
      narrationCached =
        !forceRegen &&
        shot.voiceover !== undefined &&
        (await fileExists(narrationAudioPath)) &&
        (await fileExists(narrationWordsPath));
      dueUsd = (videoCached ? 0 : cost.videoCost) + (narrationCached ? 0 : cost.voiceoverCost);
    }

    // "proceed" (shouldn't reach here, dueUsd was within budget) and
    // "allow" both fall through to normal generation below.
  }

  console.log(
    `[${shot.id}] engine=${shot.engine} video=${videoCached ? "cache" : "generate"}` +
      (shot.voiceover ? ` narration=${narrationCached ? "cache" : "generate"}` : "") +
      ` key=${key}`
  );

  if (!videoCached) {
    if (shot.engine === "seedance") {
      await generateSeedanceShot(shot, style, rawCachePath);
    } else {
      await generateGeminiShot(shot, style, rawCachePath);
    }
    // Only record the charge once the call actually succeeded — a failed
    // request (bad key, model error) never happened, so it isn't billed.
    await recordSpend(slug, shot.id, cost.videoCost);
  }

  // Base video normalized to the style's canvas: crop-to-fill + fps.
  const filters = [
    `scale=${style.width}:${style.height}:force_original_aspect_ratio=increase`,
    `crop=${style.width}:${style.height}`,
    `fps=${style.fps}`,
  ];

  if (shot.voiceover) {
    const audioPath = path.join(audioDir, `${shot.id}.mp3`);
    let words: WordTiming[];

    if (narrationCached) {
      await copyFromCache(narrationAudioPath, audioPath);
      words = JSON.parse(await readFile(narrationWordsPath, "utf8"));
    } else {
      const voiceId = shot.voiceover.voiceId ?? style.voiceId;
      const narration = await synthesizeNarration(shot.voiceover.text, voiceId, narrationAudioPath);
      words = narration.words;
      await writeFileRaw(narrationWordsPath, JSON.stringify(words, null, 2));
      await copyFromCache(narrationAudioPath, audioPath);
      await recordSpend(slug, shot.id, cost.voiceoverCost);
    }

    const assPath = path.join(audioDir, `${shot.id}.ass`);
    await writeAssCaptions(words, style.captions, style.width, style.height, assPath);

    await runFfmpeg([
      "-i",
      rawCachePath,
      "-i",
      audioPath,
      "-filter_complex",
      `[0:v]${filters.join(",")},subtitles='${escapeForFfmpeg(assPath)}'[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a:0",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      finalClipPath,
    ]);
  } else {
    // Native-audio shot (or silent shot): keep the model's own audio track as-is.
    await runFfmpeg([
      "-i",
      rawCachePath,
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      finalClipPath,
    ]);
  }
}

function escapeForFfmpeg(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function concatClips(clipPaths: string[], outPath: string): Promise<void> {
  const listPath = outPath.replace(/\.mp4$/, ".concat.txt");
  const list = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFileRaw(listPath, list, "utf8");

  await runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    outPath,
  ]);
}
