"use client";

/** The primary action everywhere in the studio: the button carries the price of
    the press and nothing else. What it does is its accessible name; the figure
    is what the visitor reads. */
export function PriceButton({
  price,
  disabled,
  busy,
  blockedReason,
  shortcut,
  className = "",
  onPress,
}: {
  price: string;
  disabled: boolean;
  busy: boolean;
  /** Why the press cannot go yet, read out with the name. */
  blockedReason?: string | null;
  shortcut?: string | null;
  className?: string;
  onPress: () => void;
}) {
  const name = blockedReason
    ? `Generate, estimated ${price}. ${blockedReason}`
    : `Generate, estimated ${price}${shortcut ? ` (${shortcut})` : ""}`;
  return (
    <button
      type="button"
      className={`ohf-generate ohf-price ${className}`}
      disabled={disabled}
      data-busy={busy}
      aria-label={name}
      title="Planning estimate. Higgsfield bills the key on your account; OpenAI and Google follow published list rates."
      onClick={onPress}
    >
      {busy && <span className="ohf-generate-sheen" aria-hidden />}
      <span className="ohf-price-figure">{price}</span>
    </button>
  );
}
