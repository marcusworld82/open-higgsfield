"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { parseSettings } from "@/generation/catalog";
import type { MediaRole, ModelEntry, Shot } from "@/generation/catalog";
import { estimateUsd, formatPrice } from "@/generation/estimate";
import { extrasOf, shotsFrom } from "@/generation/plane";
import {
  aspectFollowsStart,
  blocker,
  endNeedsStart,
  framesAndReferences,
  requiredRoles,
  shotSupport,
  taggableRoles,
} from "@/generation/requirements";
import { MAX_BATCH, useActive } from "@/generation/stores/active";
import { useVideoPrompt } from "@/generation/stores/prompt";
import { useSettings } from "@/generation/stores/settings";

import { swatchFor } from "./artwork";
import { AssetPicker } from "./asset-picker";
import { COUNT_KEYS, ROLE_KINDS, countSetting, roleLimits } from "./data";
import type { RunRecord } from "./history";
import { CaretDownIcon, CloseIcon, MinusIcon, PlusIcon, SlidersIcon, WarningIcon } from "./icons";
import { useMediaTray } from "./media-tray";
import { ModelIcon, modelIconSrc } from "./model-icon";
import { ModelPicker } from "./model-picker";
import { PriceButton } from "./price-button";
import { StylePicker } from "./style-picker";
import { MiniSwitch, Section, SettingControl, panelLabel } from "./video-controls";
import { FramePair, RoleSet, type SlotHandlers } from "./video-inputs";
import { PromptField, ShotsEditor, taggablesOf } from "./video-prompt";

/* The video surface's composer. Video takes more inputs than a bottom bar can
   hold without popups, so it gets a stacked panel: inputs first, then the
   words, then the dials, then the price. On a desktop it stands at the left of
   the gallery; on a phone the same panel is a full-height sheet that opens
   from a compact bar, so the gallery stays the ground on both. */

type Overlay = { kind: "picker" } | { kind: "assets"; role: MediaRole } | null;

/* Keys the panel draws somewhere other than the settings stack. */
const OWN_KEYS = new Set(["mode", "multiShots", ...COUNT_KEYS]);

/* Settings read top to bottom in the order a shot is planned. */
const ORDER = ["duration", "aspectRatio", "resolution", "tier", "sound", "generateAudio"];

const GENJUTSU_MODES: Record<string, { tab: string; lede: string; refs: string; refsHint: string; refsTitle: string }> = {
  "motion-transfer": {
    tab: "Motion transfer",
    lede: "Recast the motion of your video with your own characters.",
    refs: "Characters",
    refsTitle: "Add your characters",
    refsHint: "1–8 images of who performs the motion",
  },
  "object-swap": {
    tab: "Object swap",
    lede: "Swap an object or product in your video and keep the rest.",
    refs: "Objects & products",
    refsTitle: "Add objects or products",
    refsHint: "1–8 images of what goes into the shot",
  },
  restyle: {
    tab: "Restyle",
    lede: "Give the whole video one look, keeping its motion and sound.",
    refs: "Characters",
    refsTitle: "Add characters (optional)",
    refsHint: "Up to 5. Leave empty to restyle the people already in the video",
  },
};

const KLING_O_TABS: Record<string, string> = {
  "first-last": "Frames",
  "image-reference": "Image refs",
  "video-edit": "Video edit",
  "video-reference": "Video refs",
};

function modeTabs(model: ModelEntry): { value: string; label: string }[] | null {
  const field = model.settings.mode;
  if (field?.type !== "enum") return null;
  if (model.id === "genjutsu") return field.values.map((value) => ({ value, label: GENJUTSU_MODES[value]?.tab ?? value }));
  if (framesAndReferences(model)) {
    return [
      { value: "image", label: "Frames" },
      { value: "reference", label: "References" },
    ];
  }
  return field.values.map((value) => ({ value, label: KLING_O_TABS[value] ?? value }));
}

/** Reads a video's length and frame from its metadata, so Genjutsu can say
    what the output will be before the press. */
function useVideoFacts(url: string | undefined): { seconds: number; ratio: string } | null {
  const [facts, setFacts] = useState<{ url: string; seconds: number; ratio: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const onMeta = () => {
      const { videoWidth: w, videoHeight: h, duration } = video;
      if (!w || !h || !Number.isFinite(duration)) return;
      const value = w / h;
      const named: [string, number][] = [["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4]];
      const nearest = named.reduce((best, entry) => (Math.abs(entry[1] - value) < Math.abs(best[1] - value) ? entry : best));
      setFacts({ url, seconds: Math.round(duration), ratio: nearest[0] });
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.src = url;
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);
  return facts && facts.url === url ? { seconds: facts.seconds, ratio: facts.ratio } : null;
}

export function VideoStudio({
  model,
  generating,
  error,
  focusNonce,
  history,
  notice,
  selection,
  selecting,
  onError,
  onGenerate,
  onOpenKeys,
}: {
  model: ModelEntry;
  generating: boolean;
  error: string | null;
  focusNonce: number;
  history: RunRecord[];
  notice?: ReactNode;
  selection: ReactNode;
  selecting: boolean;
  onError: (message: string | null) => void;
  onGenerate: () => void;
  onOpenKeys: () => void;
}) {
  const setModel = useActive((state) => state.setModel);
  const batch = useActive((state) => state.batch);
  const setBatch = useActive((state) => state.setBatch);
  const prompt = useVideoPrompt();
  const setSettings = useSettings((state) => state.set);
  const raw = useSettings((state) => state.byModel[model.id]);
  const stored = useMemo(() => raw ?? {}, [raw]);
  const values = parseSettings(model, stored);
  const extras = extrasOf(stored);
  const tray = useMediaTray(model, onError);

  const [sheetWanted, setSheet] = useState(false);
  const [overlayWanted, setOverlay] = useState<Overlay>(null);
  const [pendingRole, setUploadingRole] = useState<MediaRole | null>(null);
  /* Picking runs in the gallery takes the dock, so nothing of the panel's
     stays open over it; an upload's spinner lives only as long as the upload. */
  const sheet = sheetWanted && !selecting;
  const overlay = selecting ? null : overlayWanted;
  const uploadingRole = tray.uploading ? pendingRole : null;
  const [shortcut, setShortcut] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const mode = typeof values.mode === "string" ? values.mode : "";
  const limits = roleLimits(model, stored);
  const items = tray.items.filter((item) => (limits[item.role] ?? 0) > 0);
  const byRole = (role: MediaRole) => items.filter((item) => item.role === role).slice(0, limits[role] ?? 0);
  const counts: Partial<Record<MediaRole, number>> = {};
  for (const role of ["start", "end", "reference", "video", "audio"] as const) counts[role] = byRole(role).length;

  const shots = shotSupport(model, values);
  const shotList = shotsFrom(stored.shots);
  const customShots = shots && values.multiShots === true ? shotList.filter((shot) => shot.prompt.trim()) : [];
  const shotSeconds = customShots.reduce((sum, shot) => sum + shot.duration, 0);

  const native = countSetting(model);
  const counts_ = native ? native.counts : Array.from({ length: MAX_BATCH }, (_, index) => index + 1);
  const batchValue = native ? Number(values[native.key]) || counts_[0]! : batch;
  const priceSettings = customShots.length ? { ...values, duration: shotSeconds } : values;
  const price = formatPrice(estimateUsd(model, priceSettings, batchValue));
  const block = blocker(model, values, counts, prompt.text, extras);
  const tags = taggablesOf(items, taggableRoles(model, values));
  const genjutsu = model.id === "genjutsu" ? GENJUTSU_MODES[mode] ?? GENJUTSU_MODES["motion-transfer"]! : null;
  const facts = useVideoFacts(model.id === "genjutsu" ? byRole("video")[0]?.url : undefined);

  /* The Frames tab is the image route with a text fallback, so a stored
     "text" mode is shown — and kept — as Frames. */
  useEffect(() => {
    if (framesAndReferences(model) && mode === "text") setSettings(model.id, { mode: "image" });
  }, [model, mode, setSettings]);

  useEffect(() => {
    setShortcut(/Mac|iP(hone|ad|od)/.test(navigator.userAgent) ? "⌘↵" : "Ctrl↵");
  }, []);

  /* The dock floats over the gallery; it publishes its height so the last row
     of runs clears it. */
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const observer = new ResizeObserver(() => {
      dock.parentElement?.style.setProperty("--ohf-dock-h", `${dock.offsetHeight}px`);
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  /* A flyout closes on a press outside the panel and on Escape; Escape with
     nothing open puts the phone sheet away. */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (overlay && panelRef.current && !panelRef.current.contains(event.target as Node)) setOverlay(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (overlay) setOverlay(null);
      else if (sheet) setSheet(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [overlay, sheet]);


  const libraryHas = (role: MediaRole) => {
    const kind = ROLE_KINDS[role];
    return tray.uploads.some((row) => row.kind === kind) || history.some((row) => row.status === "completed" && row.kind === kind);
  };

  const handlers: SlotHandlers = {
    uploadingRole,
    onPick: (role) => {
      if (libraryHas(role)) {
        setOverlay({ kind: "assets", role });
        return;
      }
      setUploadingRole(role);
      tray.beginDirect(role);
    },
    onDrop: (role, file) => {
      setUploadingRole(role);
      tray.drop(role, file);
    },
    onRemove: (id) => tray.remove(id),
  };

  function setShots(next: Shot[]) {
    setSettings(model.id, { shots: next });
  }

  function press() {
    if (block) {
      setSheet(true);
      return;
    }
    onGenerate();
    /* On a phone the run's tile is the feedback, and it is behind the sheet. */
    setSheet(false);
  }

  const tabs = modeTabs(model);
  const activeTab = framesAndReferences(model) && mode === "text" ? "image" : mode;
  const startRequired = requiredRoles(model, values).includes("start");
  const startItem = byRole("start")[0];
  const settingKeys = Object.keys(model.settings)
    .filter((key) => !OWN_KEYS.has(key))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a);
      const ib = ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const promptOptional = model.id === "genjutsu";
  const summary = prompt.text.trim() || (block ?? "Describe the shot");

  const inputs: ReactNode[] = [];
  if (genjutsu) {
    inputs.push(
      <Section key="video" label="Reference video" id="ohf-v-video">
        <RoleSet
          role="video"
          items={byRole("video")}
          max={1}
          big
          title="Add a reference video"
          hint="4–30 seconds. Motion, length and framing come from it"
          tagged={false}
          handlers={handlers}
        />
      </Section>,
      <Section
        key="refs"
        id="ohf-v-refs"
        label={mode === "restyle" ? `${genjutsu.refs} · optional` : genjutsu.refs}
        aside={<span className="ohf-vsec-count">{counts.reference ?? 0}/{limits.reference ?? 0}</span>}
      >
        <RoleSet
          role="reference"
          items={byRole("reference")}
          max={limits.reference ?? 0}
          big
          title={genjutsu.refsTitle}
          hint={genjutsu.refsHint}
          tagged={tags.length > 0}
          handlers={handlers}
        />
      </Section>,
    );
  } else {
    if ((limits.start ?? 0) > 0) {
      inputs.push(
        <Section key="frames" label="Frames" id="ohf-v-frames">
          <FramePair
            start={startItem}
            end={byRole("end")[0]}
            startRequired={startRequired}
            hasEnd={(limits.end ?? 0) > 0}
            endLocked={!startItem && endNeedsStart(model, values)}
            handlers={handlers}
          />
        </Section>,
      );
    }
    for (const role of ["reference", "video", "audio"] as const) {
      const max = limits[role] ?? 0;
      if (!max) continue;
      const noun = role === "reference" ? "Reference images" : role === "video" ? (max === 1 ? "Video" : "Reference videos") : "Audio";
      const required = requiredRoles(model, values).includes(role);
      inputs.push(
        <Section
          key={role}
          id={`ohf-v-${role}`}
          label={noun}
          aside={max > 1 ? <span className="ohf-vsec-count">{counts[role] ?? 0}/{max}</span> : undefined}
        >
          <RoleSet
            role={role}
            items={byRole(role)}
            max={max}
            title={role === "reference" ? "Add reference images" : role === "video" ? "Add a video" : "Add audio"}
            hint={
              role === "audio"
                ? "WAV. The model can follow its timing"
                : max > 1
                  ? `Up to ${max}${tags.length ? ". Tag them in the prompt with @" : ""}`
                  : undefined
            }
            badge={required ? "Required" : "Optional"}
            tagged={tags.length > 0}
            handlers={handlers}
          />
        </Section>,
      );
    }
  }

  const promptHeader = (
    <div className="ohf-vsec-head">
      <label className="ohf-vsec-label" htmlFor="ohf-v-prompt">
        {promptOptional ? "Prompt · optional" : "Prompt"}
      </label>
      {model.settings.multiShots && (
        <MiniSwitch
          label="Multi-shot"
          checked={values.multiShots === true}
          onChange={(next) => setSettings(model.id, { multiShots: next })}
        />
      )}
    </div>
  );

  const placeholder = genjutsu
    ? "Anything to keep or change, like “keep the camera locked”"
    : tags.length
      ? "A dancer in @Image1 spins through the set in @Video1. Type @ to tag an input"
      : "A slow push-in on a sculptor’s hands shaping wet clay, window light";

  const panel = (
    <aside
      ref={panelRef}
      className="ohf-vpanel"
      data-open={sheet}
      aria-label={`${model.label} settings`}
    >
      <div className="ohf-vpanel-sheetbar">
        <span className="ohf-vpanel-grab" aria-hidden />
        <span className="ohf-vpanel-sheettitle">{model.label}</span>
        <button type="button" className="ohf-icon-btn ohf-vpanel-close" aria-label="Close settings" onClick={() => setSheet(false)}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="ohf-vpanel-body ohf-scroll">
        {tabs && (
          <div className="ohf-vtabs" role="tablist" aria-label={model.id === "genjutsu" ? "Genjutsu mode" : "Input mode"} style={{ "--n": tabs.length } as React.CSSProperties}>
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={tab.value === activeTab}
                className="ohf-vtab"
                onClick={() => setSettings(model.id, { mode: tab.value })}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {genjutsu && <p className="ohf-vlede">{genjutsu.lede}</p>}

        {inputs}

        {genjutsu && mode === "restyle" && (
          <Section label="Style" id="ohf-v-style">
            <StylePicker
              selectedId={extras.presetId ?? null}
              selectedName={typeof stored.presetName === "string" ? stored.presetName : null}
              onPick={(style) => setSettings(model.id, { presetId: style.id, presetName: style.name })}
              onOpenKeys={onOpenKeys}
            />
          </Section>
        )}

        <PromptField
          id="ohf-v-prompt"
          value={prompt.text}
          onChange={prompt.setText}
          placeholder={placeholder}
          tags={tags}
          focusNonce={focusNonce}
          onSubmit={press}
          header={promptHeader}
        />
        {shots && values.multiShots === true && <ShotsEditor shots={shotList} support={shots} onChange={setShots} />}

        <Section label="Model" id="ohf-v-model">
          <button
            type="button"
            className="ohf-vmodel"
            aria-haspopup="dialog"
            aria-expanded={overlay?.kind === "picker"}
            onClick={() => setOverlay(overlay?.kind === "picker" ? null : { kind: "picker" })}
          >
            {modelIconSrc(model.id) ? (
              <ModelIcon modelId={model.id} />
            ) : (
              <span className="ohf-model-swatch" style={{ background: swatchFor("video", model.id) }} />
            )}
            <span className="ohf-vmodel-name">{model.label}</span>
            <span className="ohf-caret">
              <CaretDownIcon />
            </span>
          </button>
        </Section>

        {genjutsu && (
          <div className="ohf-vfacts" role="note">
            <span className="ohf-vfacts-label">Length and aspect</span>
            <span className="ohf-vfacts-value">
              {facts ? `${facts.ratio} · ${facts.seconds}s, from your video` : "Follow your reference video"}
            </span>
          </div>
        )}

        {settingKeys.map((key) => {
          if (key === "duration" && customShots.length) {
            return (
              <div key={key} className="ohf-vfacts" role="note">
                <span className="ohf-vfacts-label">{panelLabel("duration")}</span>
                <span className="ohf-vfacts-value">{shotSeconds}s, the sum of your shots</span>
              </div>
            );
          }
          if (key === "aspectRatio" && startItem && aspectFollowsStart(model)) {
            return (
              <div key={key} className="ohf-vfacts" role="note">
                <span className="ohf-vfacts-label">{panelLabel("aspectRatio")}</span>
                <span className="ohf-vfacts-value">Auto, from the start frame</span>
              </div>
            );
          }
          return <SettingControl key={key} model={model} settingKey={key} values={values} />;
        })}
      </div>

      <div className="ohf-vpanel-foot">
        {error && (
          <div className="ohf-alert ohf-vpanel-alert" role="alert">
            <span className="ohf-alert-ic">
              <WarningIcon />
            </span>
            <span className="ohf-alert-text">{error}</span>
            <button type="button" className="ohf-icon-btn ohf-icon-btn--ghost" aria-label="Dismiss error" onClick={() => onError(null)}>
              <CloseIcon size={12} />
            </button>
          </div>
        )}
        <div className="ohf-vpanel-go">
          <BatchStepper
            value={batchValue}
            counts={counts_}
            onChange={(next) => {
              if (!native) setBatch(next);
              else setSettings(model.id, { [native.key]: native.kind === "enum" ? String(next) : next });
            }}
          />
          <PriceButton
            className="ohf-price--wide"
            price={price}
            disabled={Boolean(block)}
            busy={generating}
            blockedReason={block}
            shortcut={shortcut}
            onPress={press}
          />
        </div>
        {block && <p className="ohf-vpanel-why">{block}</p>}
      </div>

      {overlay?.kind === "assets" && (
        <>
          <button type="button" className="ohf-scrim" aria-label="Close panel" tabIndex={-1} onClick={() => setOverlay(null)} />
          <AssetPicker
            key={overlay.role}
            model={model}
            initialRole={overlay.role}
            items={tray.items}
            uploads={tray.uploads}
            history={history}
            staged={tray.staged}
            uploading={tray.uploading}
            onUpload={(role) => {
              setUploadingRole(role);
              tray.begin(role);
            }}
            onApply={tray.apply}
            onClose={() => setOverlay(null)}
          />
        </>
      )}
      {overlay?.kind === "picker" && (
        <>
          <button type="button" className="ohf-scrim" aria-label="Close panel" tabIndex={-1} onClick={() => setOverlay(null)} />
          <ModelPicker
            selectedId={model.id}
            surface="video"
            onPick={(next) => {
              setModel(next.id);
              setOverlay(null);
            }}
            onClose={() => setOverlay(null)}
          />
        </>
      )}
      {tray.input}
    </aside>
  );

  return (
    <>
      {sheet && <button type="button" className="ohf-vsheet-scrim" aria-label="Close settings" tabIndex={-1} onClick={() => setSheet(false)} />}
      {panel}
      <div className="ohf-dock ohf-dock--video" ref={dockRef} data-selecting={selecting}>
        <div className="ohf-composer-wrap">
          {notice}
          {error && !sheet && (
            <div className="ohf-alert ohf-vdock-alert" role="alert">
              <span className="ohf-alert-ic">
                <WarningIcon />
              </span>
              <span className="ohf-alert-text">{error}</span>
              <button type="button" className="ohf-icon-btn ohf-icon-btn--ghost" aria-label="Dismiss error" onClick={() => onError(null)}>
                <CloseIcon size={12} />
              </button>
            </div>
          )}
          <div className="ohf-swap">
            {/* Phone only: the panel folded to one line. */}
            <div className="ohf-vbar" data-hidden={selecting}>
              <button type="button" className="ohf-vbar-open" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
                <span className="ohf-vbar-icon" aria-hidden>
                  <SlidersIcon size={16} />
                </span>
                <span className="ohf-vbar-text">
                  <span className="ohf-vbar-model">{model.label}</span>
                  <span className="ohf-vbar-summary" data-blocked={!prompt.text.trim() && Boolean(block)}>
                    {summary}
                  </span>
                </span>
              </button>
              <PriceButton
                className="ohf-vbar-go"
                price={price}
                disabled={false}
                busy={generating}
                blockedReason={block}
                onPress={press}
              />
            </div>
            {selection}
          </div>
        </div>
      </div>
    </>
  );
}

function BatchStepper({
  value,
  counts,
  onChange,
}: {
  value: number;
  counts: number[];
  onChange: (next: number) => void;
}) {
  const index = Math.max(0, counts.indexOf(value));
  const last = counts.length - 1;
  const step = (delta: number) => {
    const next = counts[Math.min(last, Math.max(0, index + delta))]!;
    if (next !== value) onChange(next);
  };
  if (counts.length < 2) return null;
  return (
    <div className="ohf-batch ohf-vbatch" role="group" aria-label={`Results per press: ${value}`}>
      <button type="button" className="ohf-batch-step" aria-label="Fewer results" disabled={index <= 0} onClick={() => step(-1)}>
        <MinusIcon size={12} />
      </button>
      <span className="ohf-batch-value" aria-live="polite">
        {value}
        <span className="ohf-batch-max" aria-hidden>
          /{counts[last]}
        </span>
      </span>
      <button type="button" className="ohf-batch-step" aria-label="More results" disabled={index >= last} onClick={() => step(1)}>
        <PlusIcon size={12} />
      </button>
    </div>
  );
}

