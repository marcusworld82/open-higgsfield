"use client";

import { forwardRef, useEffect, useRef } from "react";

/** A video with no poster paints black on a phone, and iOS draws its own play
    button over that black. Seeking a fraction in forces a real frame. */
export const VideoStill = forwardRef<
  HTMLVideoElement,
  { src: string; className?: string; poster?: string; loop?: boolean }
>(function VideoStill({ src, className, poster, loop }, ref) {
  const local = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = local.current;
    if (!video || poster) return;
    const seek = () => {
      if (!Number.isFinite(video.duration) || video.currentTime > 0) return;
      try {
        video.currentTime = Math.min(0.15, video.duration * 0.08 || 0.1);
      } catch {
        /* not seekable yet */
      }
    };
    video.addEventListener("loadeddata", seek);
    return () => video.removeEventListener("loadeddata", seek);
  }, [src, poster]);

  return (
    <video
      ref={(node) => {
        local.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={className}
      src={src}
      poster={poster}
      muted
      loop={loop}
      playsInline
      preload={poster ? "none" : "auto"}
    />
  );
});
