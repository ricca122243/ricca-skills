import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import type { ProjectManifest, Shot } from "./types.js";

const PROJECTS_DIR = path.resolve(process.cwd(), "projects");

export function projectDir(slug: string): string {
  return path.join(PROJECTS_DIR, slug);
}

export async function projectExists(slug: string): Promise<boolean> {
  try {
    await access(projectDir(slug));
    return true;
  } catch {
    return false;
  }
}

export async function scaffoldProject(
  slug: string,
  styleName: string
): Promise<void> {
  const dir = projectDir(slug);
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(dir, "render"), { recursive: true });
  await mkdir(path.join(dir, "render", "clips"), { recursive: true });
  await mkdir(path.join(dir, "render", "audio"), { recursive: true });
  await mkdir(path.join(dir, "render", "cache"), { recursive: true });

  const manifest: ProjectManifest = { slug, style: styleName };
  await writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );

  await writeFile(
    path.join(dir, "brief.md"),
    `# Brief: ${slug}\n\n` +
      `- Audience:\n` +
      `- Goal / call to action:\n` +
      `- Key message:\n` +
      `- Length target (seconds):\n` +
      `- Style: ${styleName} (see styles/${styleName}.json)\n`
  );

  await writeFile(
    path.join(dir, "script.md"),
    `# Script: ${slug}\n\n` +
      `Write the beat-by-beat script here in plain prose. Once approved, ` +
      `translate it into shots.json — one shot per beat.\n`
  );

  await writeFile(
    path.join(dir, "shots.json"),
    JSON.stringify([] as Shot[], null, 2) + "\n"
  );
}

export async function loadManifest(slug: string): Promise<ProjectManifest> {
  const file = path.join(projectDir(slug), "project.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as ProjectManifest;
}

export async function loadShots(slug: string): Promise<Shot[]> {
  const file = path.join(projectDir(slug), "shots.json");
  const raw = await readFile(file, "utf8");
  const shots = JSON.parse(raw) as Shot[];
  const ids = new Set<string>();
  for (const shot of shots) {
    if (ids.has(shot.id)) {
      throw new Error(`Duplicate shot id "${shot.id}" in ${file}`);
    }
    ids.add(shot.id);
    if (shot.engine !== "seedance" && shot.engine !== "gemini") {
      throw new Error(
        `Shot "${shot.id}" has unknown engine "${shot.engine}" — use "seedance" or "gemini".`
      );
    }
  }
  return shots;
}
