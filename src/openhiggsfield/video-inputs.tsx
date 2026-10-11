"use client";

import { useState } from "react";
import type { DragEvent, ReactNode } from "react";

import type { MediaItem, MediaRole } from "@/generation/catalog";

import { AudioIcon, CloseIcon, ImageIcon, PlusIcon, VideoIcon } from "./icons";
import { VideoStill } from "./video-still";

/* Upload slots for the video panel. Each slot belongs to one role, so a tap
   says exactly where the file lands; a dropped file goes to the slot it was
   dropped on. */

export type SlotHandlers = {
  /** Open the library for this role, or the file dialog when the library is empty. */
  onPick: (role: MediaRole) => void;
  onDrop: (role: MediaRole, file: File) => void;
  onRemove: (id: string) => void;
  /** The role an upload is in flight for, so only that slot spins. */
  uploadingRole: MediaRole | null;
};

const TAG_NOUN: Partial<Record<MediaRole, string>> = { reference: "Image", video: "Video", audio: "Audio" };

function dropProps(role: MediaRole, onDrop: SlotHandlers["onDrop"], setOver: (over: boolean) => void, disabled = false) {
  if (disabled) return {};
  return {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setOver(false);
      const file = event.dataTransfer.files[0];
      if (file) onDrop(role, file);
    },
  };
}

function Thumb({ item }: { item: MediaItem }) {
  if (item.role === "audio") {
    return (
      <span className="ohf-slot-glyph">
        <AudioIcon size={22} />
      </span>
    );
  }
  if (item.role === "video" && !item.poster) return <VideoStill className="ohf-slot-media" src={item.url} />;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted user upload */
    <img className="ohf-slot-media" src={item.poster || item.url} alt="" />
  );
}

function Filled({
  item,
  tag,
  label,
  onRemove,
  onReplace,
}: {
  item: MediaItem;
  tag?: string;
  label: string;
  onRemove: () => void;
  onReplace?: () => void;
}) {
  return (
    <div className="ohf-slot-filled">
      <button type="button" className="ohf-slot-face" aria-label={`Change ${label.toLowerCase()}`} onClick={onReplace} disabled={!onReplace}>
        <Thumb item={item} />
        {tag && <span className="ohf-slot-tag">{tag}</span>}
      </button>
      <button type="button" className="ohf-slot-remove" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
        <CloseIcon size={11} />
      </button>
    </div>
  );
}

function EmptySlot({
  role,
  title,
  hint,
  badge,
  icon,
  disabled,
  disabledHint,
  big,
  handlers,
}: {
  role: MediaRole;
  title: string;
  hint?: string;
  badge?: string;
  icon: ReactNode;
  disabled?: boolean;
  disabledHint?: string;
  big?: boolean;
  handlers: SlotHandlers;
}) {
  const [over, setOver] = useState(false);
  const busy = handlers.uploadingRole === role;
  return (
    <button
      type="button"
      className={`ohf-slot-empty${big ? " ohf-slot-empty--big" : ""}`}
      data-over={over}
      disabled={disabled || busy}
      aria-busy={busy}
      title={disabled ? disabledHint : undefined}
      onClick={() => handlers.onPick(role)}
      {...dropProps(role, handlers.onDrop, setOver, disabled)}
    >
      {badge && <span className="ohf-slot-badge">{badge}</span>}
      <span className="ohf-slot-icon" aria-hidden>
        {busy ? <span className="ohf-spinner" /> : icon}
      </span>
      <span className="ohf-slot-title">{busy ? "Uploading…" : title}</span>
      {(disabled ? disabledHint : hint) && <span className="ohf-slot-hint">{disabled ? disabledHint : hint}</span>}
    </button>
  );
}

/** Start and end frame, side by side — the pair reads as one instruction. */
export function FramePair({
  start,
  end,
  startRequired,
  hasEnd,
  endLocked,
  handlers,
}: {
  start: MediaItem | undefined;
  end: MediaItem | undefined;
  startRequired: boolean;
  hasEnd: boolean;
  endLocked: boolean;
  handlers: SlotHandlers;
}) {
  return (
    <div className={`ohf-frames${hasEnd ? "" : " ohf-frames--single"}`}>
      {start ? (
        <Filled item={start} label="Start frame" tag="Start" onRemove={() => handlers.onRemove(start.id)} onReplace={() => handlers.onPick("start")} />
      ) : (
        <EmptySlot
          role="start"
          title="Start frame"
          badge={startRequired ? "Required" : "Optional"}
          icon={<ImageIcon size={18} />}
          handlers={handlers}
        />
      )}
      {hasEnd &&
        (end ? (
          <Filled item={end} label="End frame" tag="End" onRemove={() => handlers.onRemove(end.id)} onReplace={() => handlers.onPick("end")} />
        ) : (
          <EmptySlot
            role="end"
            title="End frame"
            badge="Optional"
            icon={<ImageIcon size={18} />}
            disabled={endLocked}
            disabledHint="Add a start frame first"
            handlers={handlers}
          />
        ))}
    </div>
  );
}

/** One role's set: a big drop zone while empty, a row of tiles once filled. */
export function RoleSet({
  role,
  items,
  max,
  title,
  hint,
  badge,
  tagged,
  big,
  handlers,
}: {
  role: MediaRole;
  items: MediaItem[];
  max: number;
  title: string;
  hint?: string;
  badge?: string;
  /** Number the tiles the way the prompt cites them: Image 1, Video 1. */
  tagged: boolean;
  big?: boolean;
  handlers: SlotHandlers;
}) {
  const [over, setOver] = useState(false);
  const icon = role === "video" ? <VideoIcon size={18} /> : role === "audio" ? <AudioIcon size={18} /> : <ImageIcon size={18} />;
  if (items.length === 0) {
    return <EmptySlot role={role} title={title} hint={hint} badge={badge} icon={icon} big={big} handlers={handlers} />;
  }
  const single = max === 1;
  const busy = handlers.uploadingRole === role;
  return (
    <div
      className={`ohf-tiles${single ? " ohf-tiles--single" : ""}`}
      data-over={over}
      {...dropProps(role, handlers.onDrop, setOver, items.length >= max && !single)}
    >
      {items.map((item, index) => (
        <Filled
          key={item.id}
          item={item}
          label={single ? (TAG_NOUN[role] ?? "File") : `${TAG_NOUN[role] ?? "File"} ${index + 1}`}
          tag={tagged && TAG_NOUN[role] ? `@${TAG_NOUN[role]}${index + 1}` : undefined}
          onRemove={() => handlers.onRemove(item.id)}
          onReplace={() => handlers.onPick(role)}
        />
      ))}
      {!single && items.length < max && (
        <button
          type="button"
          className="ohf-tile-add"
          aria-label={`Add ${title.toLowerCase()}, ${items.length} of ${max}`}
          disabled={busy}
          onClick={() => handlers.onPick(role)}
        >
          {busy ? <span className="ohf-spinner" aria-hidden /> : <PlusIcon size={16} />}
          <span className="ohf-tile-add-count">
            {items.length}/{max}
          </span>
        </button>
      )}
    </div>
  );
}
