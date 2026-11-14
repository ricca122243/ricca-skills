import { createInterface } from "node:readline/promises";

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export interface MenuChoice<T> {
  value: T;
  label: string;
}

/**
 * Numbered single-select menu over stdin/stdout. Only call this when
 * isInteractive() is true — in a non-interactive context (an AI agent
 * driving this CLI over a pipe) there's nothing to prompt.
 */
export async function selectMenu<T>(
  question: string,
  choices: MenuChoice<T>[]
): Promise<T> {
  console.log(question);
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (await rl.question(`Choice [1-${choices.length}]: `)).trim();
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
        return choices[n - 1].value;
      }
      console.log(`Enter a number between 1 and ${choices.length}.`);
    }
  } finally {
    rl.close();
  }
}

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
    if (answer === "") return defaultYes;
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function promptNumber(question: string): Promise<number | undefined> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim();
    const n = Number(answer);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } finally {
    rl.close();
  }
}
