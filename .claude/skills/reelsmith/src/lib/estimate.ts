import type { Shot } from "./types.js";

/**
 * Per-second / per-character prices are NOT fetched live — they change
 * often and none of the three docs this skill points at (Seedance 2.0 on
 * Replicate, Gemini Omni Flash, ElevenLabs) reliably publish a stable
 * machine-readable price. Treat these as rough defaults; before quoting a
 * real budget, check:
 *   - https://replicate.com/bytedance/seedance-2.0 (per-second, shown on the model page)
 *   - https://ai.google.dev/gemini-api/docs/pricing
 *   - https://elevenlabs.io/pricing
 */
export const DEFAULT_PRICES = {
  seedancePerSecond: 0.3, // rough Replicate per-second-of-output estimate
  geminiOmniFlashPerSecond: 0.1, // rough estimate, unconfirmed — check pricing page
  elevenlabsPerThousandChars: 0.18, // ~ Creator tier blended rate
};

export interface EstimateLine {
  shotId: string;
  engine: string;
  videoCost: number;
  voiceoverCost: number;
  total: number;
}

export function estimateShotCost(shot: Shot, prices = DEFAULT_PRICES): EstimateLine {
  const perSecond =
    shot.engine === "seedance" ? prices.seedancePerSecond : prices.geminiOmniFlashPerSecond;
  const videoCost = perSecond * shot.durationSeconds;
  const voiceoverCost = shot.voiceover
    ? (shot.voiceover.text.length / 1000) * prices.elevenlabsPerThousandChars
    : 0;
  return {
    shotId: shot.id,
    engine: shot.engine,
    videoCost,
    voiceoverCost,
    total: videoCost + voiceoverCost,
  };
}

export function estimateProjectCost(
  shots: Shot[],
  prices = DEFAULT_PRICES
): { lines: EstimateLine[]; totalUsd: number } {
  const lines = shots.map((shot) => estimateShotCost(shot, prices));
  const totalUsd = lines.reduce((sum, l) => sum + l.total, 0);
  return { lines, totalUsd };
}
