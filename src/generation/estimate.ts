import type { ModelEntry } from "./catalog/types";

/**
 * Planning numbers shown before Generate. Not an invoice.
 * OpenAI and Google figures follow published list rates for a single image.
 * Higgsfield figures are planning estimates — the key's account is billed for the real charge.
 */
export function estimateUsd(
  model: ModelEntry,
  settings: Record<string, unknown>,
  count: number,
): number {
  const copies = Number.isFinite(count) && count > 0 ? Math.round(count) : 1;
  return roundCents(unitUsd(model, settings) * copies);
}

export function formatEstimate(usd: number): string {
  if (usd < 0.01) return `est. $${usd.toFixed(3)}`;
  return `est. $${usd.toFixed(2)}`;
}

function unitUsd(model: ModelEntry, settings: Record<string, unknown>): number {
  if (model.id === "gpt-image-2.5") {
    const quality = typeof settings.quality === "string" ? settings.quality : "high";
    const table: Record<string, number> = { low: 0.02, medium: 0.06, high: 0.15 };
    const base = table[quality] ?? 0.06;
    return settings.variant === "sunburst" ? base * 1.45 : base;
  }
  if (model.id === "nano-banana-pro") {
    return settings.resolution === "4k" ? 0.24 : 0.134;
  }
  if (model.id === "genjutsu") {
    const resolution = typeof settings.resolution === "string" ? settings.resolution : "720p";
    if (resolution === "480p") return 0.28;
    if (resolution === "1080p") return 0.8;
    return 0.45;
  }
  if (model.surface === "image") {
    const resolution = typeof settings.resolution === "string" ? settings.resolution : "1k";
    if (resolution === "4k") return 0.12;
    if (resolution === "2k") return 0.07;
    return 0.04;
  }
  const seconds = typeof settings.duration === "number" ? settings.duration : 5;
  const resolution = typeof settings.resolution === "string" ? settings.resolution : "720p";
  const perSecond = resolution === "1080p" || resolution === "4k" ? 0.12 : 0.07;
  return perSecond * seconds;
}

function roundCents(value: number): number {
  return Math.round(value * 1000) / 1000;
}
