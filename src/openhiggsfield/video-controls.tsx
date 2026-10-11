"use client";

import type { CSSProperties, ReactNode } from "react";

import type { ModelEntry } from "@/generation/catalog";
import { useSettings } from "@/generation/stores/settings";

import { ratioBox, settingLabel, settingValueLabel } from "./data";

/* Inline controls for the video panel: every value is on the plate, so nothing
   opens a popup to be read. Labels sit above their control. */

const PANEL_LABELS: Record<string, string> = {
  resolution: "Quality",
  aspectRatio: "Aspect ratio",
  duration: "Duration",
  sound: "Sound",
  generateAudio: "Sound",
  enableThinking: "Deep thinking",
  cfgScale: "Prompt adherence",
  tier: "Tier",
  keepOriginalSound: "Keep original sound",
  characterOrientation: "Orientation follows",
  shotType: "Shot type",
  promptExtend: "Prompt extend",
  promptOptimizer: "Prompt optimizer",
  aigcWatermark: "AI watermark",
  outputFormat: "Format",
  cameraMovement: "Camera move",
  fps: "Frame rate",
};

const PANEL_HINTS: Record<string, string> = {
  enableThinking: "Plans the shot before rendering. Slower.",
  cfgScale: "Higher follows the prompt more literally.",
  promptExtend: "Lets the model expand a short prompt.",
  characterOrientation: "Whose facing direction the result keeps.",
};

export function panelLabel(key: string): string {
  return PANEL_LABELS[key] ?? settingLabel(key);
}

export function panelValueLabel(key: string, value: unknown): string {
  if (value === "adaptive") return "Auto";
  if (key === "characterOrientation") return value === "image" ? "Image" : "Video";
  if (key === "fps") return `${String(value)} fps`;
  return settingValueLabel(key, value);
}

export function Section({
  label,
  aside,
  hint,
  children,
  id,
}: {
  label: string;
  aside?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="ohf-vsec" aria-labelledby={id}>
      <div className="ohf-vsec-head">
        <h3 className="ohf-vsec-label" id={id}>
          {label}
        </h3>
        {aside}
      </div>
      {children}
      {hint && <p className="ohf-vsec-hint">{hint}</p>}
    </section>
  );
}

export function Segmented({
  label,
  options,
  value,
  onChange,
  ratio,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
  ratio?: boolean;
}) {
  /* Up to four values share one track; more wrap as a chip field so no value
     is ever cut to fit. */
  const chips = options.length > 4 || ratio;
  return (
    <div
      className={chips ? "ohf-chips" : "ohf-seg"}
      role="radiogroup"
      aria-label={label}
      style={chips ? undefined : ({ "--n": options.length } as CSSProperties)}
    >
      {options.map((option) => {
        const box = ratio ? ratioBox(option.value) : null;
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={chips ? "ohf-chip" : "ohf-seg-opt"}
            onClick={() => onChange(option.value)}
          >
            {ratio && (
              <span className="ohf-chip-ratio" aria-hidden>
                <span className={`ohf-chip-box${box ? "" : " ohf-chip-box--auto"}`} style={box ?? undefined} />
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="ohf-switch-row" onClick={() => onChange(!checked)}>
      <span className="ohf-switch-text">
        <span className="ohf-switch-label">{label}</span>
        {hint && <span className="ohf-switch-hint">{hint}</span>}
      </span>
      <span className="ohf-switch" aria-hidden>
        <span className="ohf-switch-knob" />
      </span>
    </button>
  );
}

/** A compact switch for a section header — the multi-shot toggle. */
export function MiniSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="ohf-mini-switch" onClick={() => onChange(!checked)}>
      <span className="ohf-mini-switch-label">{label}</span>
      <span className="ohf-switch" aria-hidden>
        <span className="ohf-switch-knob" />
      </span>
    </button>
  );
}

export function RangeField({
  label,
  min,
  max,
  step = 1,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  format: (value: number) => string;
  onChange: (next: number) => void;
}) {
  const fill = `${(((value - min) / (max - min || 1)) * 100).toFixed(1)}%`;
  return (
    <div className="ohf-range">
      <input
        type="range"
        className="ohf-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        style={{ "--fill": fill } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="ohf-range-value">{format(value)}</span>
    </div>
  );
}

/** One catalog setting as an inline control. */
export function SettingControl({
  model,
  settingKey,
  values,
}: {
  model: ModelEntry;
  settingKey: string;
  values: Record<string, unknown>;
}) {
  const set = useSettings((state) => state.set);
  const field = model.settings[settingKey];
  if (!field) return null;
  const label = panelLabel(settingKey);
  const value = values[settingKey];

  if (field.type === "boolean") {
    return (
      <Switch
        label={label}
        hint={PANEL_HINTS[settingKey]}
        checked={value === true}
        onChange={(next) => set(model.id, { [settingKey]: next })}
      />
    );
  }

  if (field.type === "range") {
    const number = typeof value === "number" ? value : field.default;
    const decimals = (field.step ?? 1) < 1;
    return (
      <Section label={label} hint={PANEL_HINTS[settingKey]}>
        <RangeField
          label={label}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={number}
          format={(next) => (settingKey === "duration" ? `${next}s` : decimals ? next.toFixed(2) : String(next))}
          onChange={(next) => set(model.id, { [settingKey]: next })}
        />
      </Section>
    );
  }

  const current = typeof value === "string" ? value : field.default;
  return (
    <Section label={label} hint={PANEL_HINTS[settingKey]}>
      <Segmented
        label={label}
        ratio={settingKey === "aspectRatio"}
        options={field.values.map((option) => ({ value: option, label: panelValueLabel(settingKey, option) }))}
        value={current}
        onChange={(next) => set(model.id, { [settingKey]: next })}
      />
    </Section>
  );
}
