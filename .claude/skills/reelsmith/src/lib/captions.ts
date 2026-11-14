import { writeFile } from "node:fs/promises";
import type { CaptionStyle } from "./types.js";
import type { WordTiming } from "./elevenlabs.js";

/** #RRGGBB[AA] -> ASS &HAABBGGRR& (ASS alpha is inverted: 00 = opaque). */
function toAssColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alphaHex = clean.length >= 8 ? clean.slice(6, 8) : "00";
  const invAlpha = (255 - parseInt(alphaHex, 16)).toString(16).padStart(2, "0");
  return `&H${invAlpha}${b}${g}${r}`.toUpperCase();
}

function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function alignmentFor(position: CaptionStyle["position"]): number {
  // ASS \an alignment codes: 2 = bottom-center, 5 = middle-center, 8 = top-center
  if (position === "top") return 8;
  if (position === "center") return 5;
  return 2;
}

function marginVFor(position: CaptionStyle["position"], height: number): number {
  if (position === "center") return Math.round(height / 2 - 40);
  return Math.round(height * 0.08);
}

/**
 * Groups word timings into caption cards of `wordsPerCaption` words and
 * writes an .ass subtitle file styled from the style's caption config.
 */
export async function writeAssCaptions(
  words: WordTiming[],
  caption: CaptionStyle,
  videoWidth: number,
  videoHeight: number,
  outPath: string
): Promise<void> {
  const groups: WordTiming[][] = [];
  for (let i = 0; i < words.length; i += caption.wordsPerCaption) {
    groups.push(words.slice(i, i + caption.wordsPerCaption));
  }

  const events = groups
    .map((group) => {
      const start = group[0].startSeconds;
      const end = group[group.length - 1].endSeconds;
      let text = group.map((w) => w.word).join(" ");
      if (caption.uppercase) text = text.toUpperCase();
      return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Caption,,0,0,0,,${text}`;
    })
    .join("\n");

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${caption.font},${caption.fontSize},${toAssColor(caption.primaryColor)},&H000000FF,${toAssColor(caption.outlineColor)},&H00000000,1,0,0,0,100,100,0,0,1,${caption.outlinePx},0,${alignmentFor(caption.position)},40,40,${marginVFor(caption.position, videoHeight)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;

  await writeFile(outPath, ass, "utf8");
}
