import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Style } from "./types.js";

const STYLES_DIR = path.resolve(process.cwd(), "styles");

export async function loadStyle(name: string): Promise<Style> {
  const file = path.join(STYLES_DIR, `${name}.json`);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(
      `Style "${name}" not found at ${file}. List styles in ./styles/*.json.`
    );
  }
  const style = JSON.parse(raw) as Style;
  if (style.name !== name) {
    throw new Error(
      `Style file ${file} has "name": "${style.name}" but is named ${name}.json — keep them in sync.`
    );
  }
  return style;
}
