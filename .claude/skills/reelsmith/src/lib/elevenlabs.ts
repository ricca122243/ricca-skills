import { writeFile } from "node:fs/promises";
import { env } from "./env.js";

export interface WordTiming {
  word: string;
  startSeconds: number;
  endSeconds: number;
}

export interface Narration {
  audioPath: string;
  words: WordTiming[];
}

/**
 * Synthesizes narration for a shot's voiceover text and returns per-word
 * timings for caption burn-in.
 *
 * IMPORTANT: before touching this function, read
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
 * — confirm the endpoint path, default model_id, and the exact alignment
 * response fields before trusting this code; ElevenLabs has both a
 * `/with-timestamps` REST endpoint and SDK helpers, and field names have
 * shifted across versions. As authored, the endpoint returns
 * `audio_base64` plus a `alignment` object with parallel arrays
 * (`characters`, `character_start_times_seconds`,
 * `character_end_times_seconds`) — this code groups those characters into
 * words by whitespace to build word-level timings.
 */
export async function synthesizeNarration(
  text: string,
  voiceId: string,
  audioOutPath: string
): Promise<Narration> {
  const key = env.elevenlabsKey();

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
      }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `ElevenLabs TTS request failed: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as ElevenLabsResponse;

  const audioBuf = Buffer.from(data.audio_base64, "base64");
  await writeFile(audioOutPath, audioBuf);

  const words = charactersToWords(data.alignment);
  return { audioPath: audioOutPath, words };
}

interface ElevenLabsResponse {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

function charactersToWords(
  alignment: ElevenLabsResponse["alignment"]
): WordTiming[] {
  const { characters, character_start_times_seconds, character_end_times_seconds } =
    alignment;
  const words: WordTiming[] = [];
  let current = "";
  let start = 0;

  const flush = (endIdx: number) => {
    if (current.length === 0) return;
    words.push({
      word: current,
      startSeconds: start,
      endSeconds: character_end_times_seconds[endIdx],
    });
    current = "";
  };

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (/\s/.test(ch)) {
      flush(i - 1);
    } else {
      if (current.length === 0) start = character_start_times_seconds[i];
      current += ch;
    }
  }
  flush(characters.length - 1);

  return words;
}
