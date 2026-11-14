import { writeFile } from "node:fs/promises";
import { env } from "./env.js";
import type { Shot, Style } from "./types.js";

/**
 * Generates one shot's video (with native audio / lip sync) via Seedance 2.0
 * on Replicate, and writes the resulting clip to `outPath`.
 *
 * IMPORTANT: before touching this function, read
 * https://replicate.com/bytedance/seedance-2.0/api — Replicate model
 * versions ship fast and change input field names, defaults, and pricing
 * without notice. The shape below (prompt / aspect_ratio / duration /
 * images) was correct as of this skill's authoring but is NOT guaranteed
 * to still be correct. Confirm against the live API docs (the "API" tab
 * on the model page, or `replicate models get bytedance/seedance-2.0`)
 * before changing or trusting this code.
 */
export async function generateSeedanceShot(
  shot: Shot,
  style: Style,
  outPath: string
): Promise<void> {
  const token = env.replicateToken();
  const prompt = `${style.shotPromptPreamble}${shot.prompt}`;

  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: style.aspectRatio,
    duration: shot.durationSeconds,
    // Seedance 2.0 generates audio (dialogue/lip-sync) together with video
    // by default; set to false if the shot should be silent/instrumental.
    generate_audio: shot.nativeAudio ?? true,
  };
  if (shot.referenceImages?.length) {
    input.images = shot.referenceImages;
  }

  const createRes = await fetch(
    "https://api.replicate.com/v1/models/bytedance/seedance-2.0/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait", // ask Replicate to hold the connection until done, when supported
      },
      body: JSON.stringify({ input }),
    }
  );
  if (!createRes.ok) {
    throw new Error(
      `Replicate Seedance 2.0 request failed: ${createRes.status} ${await createRes.text()}`
    );
  }
  let prediction = (await createRes.json()) as ReplicatePrediction;

  prediction = await pollUntilDone(prediction, token);

  const outputUrl = extractVideoUrl(prediction);
  await downloadTo(outputUrl, outPath);
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  urls: { get: string };
  error?: string;
}

async function pollUntilDone(
  prediction: ReplicatePrediction,
  token: string
): Promise<ReplicatePrediction> {
  let current = prediction;
  while (current.status !== "succeeded" && current.status !== "failed" && current.status !== "canceled") {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(current.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    });
    current = (await res.json()) as ReplicatePrediction;
  }
  if (current.status !== "succeeded") {
    throw new Error(`Seedance 2.0 generation failed: ${current.error ?? current.status}`);
  }
  return current;
}

function extractVideoUrl(prediction: ReplicatePrediction): string {
  // Replicate models return either a string, an array of strings, or an
  // object with a video field depending on the model version — handle the
  // common shapes but re-verify against the live schema if this throws.
  const output = prediction.output;
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (output && typeof output === "object" && "video" in output) {
    return (output as { video: string }).video;
  }
  throw new Error(
    `Unrecognized Seedance 2.0 output shape: ${JSON.stringify(output)}. ` +
      `Check https://replicate.com/bytedance/seedance-2.0/api for the current output schema.`
  );
}

async function downloadTo(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Seedance output: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}
