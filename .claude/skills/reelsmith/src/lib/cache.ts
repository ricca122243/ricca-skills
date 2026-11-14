import { createHash } from "node:crypto";
import { access, copyFile } from "node:fs/promises";
import path from "node:path";
import type { Shot, Style } from "./types.js";

/**
 * Cache key = hash of everything that determines the pixels/audio of a shot:
 * prompt, engine, duration, reference images, voiceover text/voice, and the
 * full style (so switching styles or tweaking captions never serves a stale clip).
 */
export function shotCacheKey(shot: Shot, style: Style): string {
  const payload = JSON.stringify({
    engine: shot.engine,
    prompt: shot.prompt,
    durationSeconds: shot.durationSeconds,
    nativeAudio: shot.nativeAudio ?? false,
    referenceImages: shot.referenceImages ?? [],
    voiceover: shot.voiceover ?? null,
    style,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 20);
}

export function cacheClipPath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.mp4`);
}

export function cacheNarrationAudioPath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.narration.mp3`);
}

export function cacheNarrationWordsPath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.narration.json`);
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function copyFromCache(
  cached: string,
  dest: string
): Promise<void> {
  await copyFile(cached, dest);
}
