import { spawn } from "node:child_process";

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      reject(
        new Error(
          `Failed to run ffmpeg (is it installed and on PATH?): ${err.message}`
        )
      );
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr}`));
    });
  });
}

/**
 * A solid-color, labeled clip used to stand in for a shot that was skipped
 * (e.g. over budget) so the final concat still has one clip per shot and
 * doesn't break. Not billed to any model — pure ffmpeg lavfi source.
 */
export async function generatePlaceholderClip(
  durationSeconds: number,
  width: number,
  height: number,
  fps: number,
  label: string,
  outPath: string
): Promise<void> {
  const safeLabel = label.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
  const inputs = [
    "-f",
    "lavfi",
    "-i",
    `color=c=0x1a1a1a:s=${width}x${height}:d=${durationSeconds}:r=${fps}`,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=44100:cl=stereo`,
  ];
  const encodeArgs = ["-t", String(durationSeconds), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"];

  try {
    await runFfmpeg([
      ...inputs,
      "-vf",
      `drawtext=text='${safeLabel}':fontcolor=white:fontsize=${Math.round(width / 20)}:x=(w-text_w)/2:y=(h-text_h)/2`,
      ...encodeArgs,
      outPath,
    ]);
  } catch (err) {
    // Some ffmpeg builds (e.g. minimal Homebrew installs) ship without
    // libfreetype, so the "drawtext" filter isn't available. Fall back to
    // an unlabeled solid clip rather than failing the whole render over it.
    if (!(err instanceof Error) || !err.message.includes("No such filter")) throw err;
    console.warn(`ffmpeg build has no "drawtext" filter — placeholder clip will be unlabeled.`);
    await runFfmpeg([...inputs, ...encodeArgs, outPath]);
  }
}

export function probeDurationSeconds(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      if (code === 0) resolve(parseFloat(out.trim()));
      else reject(new Error(`ffprobe exited ${code}: ${err}`));
    });
  });
}
