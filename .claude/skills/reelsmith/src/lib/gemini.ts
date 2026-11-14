import { writeFile } from "node:fs/promises";
import { env } from "./env.js";
import type { Shot, Style } from "./types.js";

/**
 * Generates one shot's video via Gemini Omni Flash, and writes the result
 * to `outPath`. Use this engine when the shot may need conversational
 * revision later (re-prompting off the same interaction) rather than a
 * fresh prompt each time.
 *
 * IMPORTANT: before touching this function, read
 * https://ai.google.dev/gemini-api/docs/video and
 * https://ai.google.dev/gemini-api/docs/omni — this is a preview API and
 * the model id, endpoint (Interactions API vs generateContent), and
 * response/file-retrieval shape can change between visits. The call below
 * targets the Interactions API (`POST /v1beta/interactions`) with model
 * `gemini-omni-flash-preview`, which was current as of authoring — confirm
 * before trusting it, especially the field that carries the returned video
 * (this implementation expects a `fileUri` to download, per the Gemini
 * Files API pattern; adjust if the docs show otherwise).
 */
export async function generateGeminiShot(
  shot: Shot,
  style: Style,
  outPath: string,
  previousInteractionId?: string
): Promise<{ interactionId: string }> {
  const key = env.geminiKey();
  const prompt = previousInteractionId
    ? shot.prompt // revision instruction, sent against the prior interaction
    : `${style.shotPromptPreamble}${shot.prompt}`;

  const body: Record<string, unknown> = {
    model: "gemini-omni-flash-preview",
    input: prompt,
    response_format: {
      type: "video",
      aspect_ratio: style.aspectRatio,
    },
  };
  if (previousInteractionId) {
    body.previous_interaction_id = previousInteractionId;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/interactions?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(
      `Gemini Omni Flash request failed: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as GeminiInteraction;

  const fileUri = extractFileUri(data);
  await downloadTo(fileUri, key, outPath);

  return { interactionId: data.id ?? data.name ?? "" };
}

interface GeminiInteraction {
  id?: string;
  name?: string;
  output?: unknown;
}

function extractFileUri(data: GeminiInteraction): string {
  const output = data.output as
    | { video?: { fileUri?: string; uri?: string } }
    | undefined;
  const uri = output?.video?.fileUri ?? output?.video?.uri;
  if (!uri) {
    throw new Error(
      `Unrecognized Gemini Omni Flash response shape: ${JSON.stringify(data)}. ` +
        `Check https://ai.google.dev/gemini-api/docs/omni for the current response schema.`
    );
  }
  return uri;
}

async function downloadTo(
  fileUri: string,
  apiKey: string,
  outPath: string
): Promise<void> {
  const url = fileUri.includes("key=") ? fileUri : `${fileUri}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Gemini Omni Flash output: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}
