"use client";

import { useEffect } from "react";

/**
 * Publishes the visible part of the screen as CSS variables on <html>:
 *   --ohf-vv-h    height of what is visible (shrinks when the keyboard opens)
 *   --ohf-vv-top  how far iOS has panned the page to keep a field in view
 *   --ohf-kb      height of the on-screen keyboard, or 0
 * iOS Safari does not resize the page for the keyboard, so without these the
 * composer and every bottom sheet would sit behind it. Chrome on Android
 * resizes the page itself (interactive-widget=resizes-content), and the
 * values then come out as the full height and 0.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--ohf-vv-h", `${Math.round(vv.height)}px`);
      root.style.setProperty("--ohf-vv-top", `${Math.round(vv.offsetTop)}px`);
      root.style.setProperty("--ohf-kb", `${Math.round(keyboard)}px`);
      root.dataset.ohfKeyboard = keyboard > 80 ? "open" : "closed";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
    };
  }, []);
}
