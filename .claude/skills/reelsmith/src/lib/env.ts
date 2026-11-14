import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} in .env. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

export const env = {
  replicateToken: () => required("REPLICATE_API_TOKEN"),
  geminiKey: () => required("GEMINI_API_KEY"),
  elevenlabsKey: () => required("ELEVENLABS_API_KEY"),
  /** Optional lifetime spend cap in USD across all projects. Unset = no cap. */
  budgetLimitUsd: (): number | undefined => {
    const raw = process.env.BUDGET_USD_LIMIT;
    if (!raw) return undefined;
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) {
      throw new Error(`BUDGET_USD_LIMIT in .env must be a non-negative number, got "${raw}"`);
    }
    return n;
  },
};

export const REQUIRED_ENV_KEYS = [
  "REPLICATE_API_TOKEN",
  "GEMINI_API_KEY",
  "ELEVENLABS_API_KEY",
] as const;

/** Presence only — never returns or logs the actual values. */
export function envStatus(): Record<(typeof REQUIRED_ENV_KEYS)[number], boolean> & {
  BUDGET_USD_LIMIT: boolean;
} {
  return {
    REPLICATE_API_TOKEN: Boolean(process.env.REPLICATE_API_TOKEN),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    ELEVENLABS_API_KEY: Boolean(process.env.ELEVENLABS_API_KEY),
    BUDGET_USD_LIMIT: Boolean(process.env.BUDGET_USD_LIMIT),
  };
}
