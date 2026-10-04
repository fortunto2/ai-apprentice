"use client";

// Replays one screen moment from the session recording: seeks to `t` and plays `lengthMs`.
// Falls back to the still frame when there is no recording.

import { useEffect, useMemo, useRef } from "react";

export function MomentPlayer({ recording, t, lengthMs = 8000, fallbackUrl, caption, className }: { recording?: Blob | null; t: number; lengthMs?: number; fallbackUrl?: string; caption?: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const url = useMemo(() => (recording ? URL.createObjectURL(recording) : null), [recording]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    const v = video.current;
    if (!v || !url) return;
    let cancelled = false;
    const start = t / 1000;
    const end = start + lengthMs / 1000;
    const onTime = () => {
      if (v.currentTime >= end) {
        v.pause();
        v.currentTime = start;
      }
    };
    const run = async () => {
      // MediaRecorder webm has no duration header; a seek to the far end makes Chrome compute it.
      if (!Number.isFinite(v.duration)) {
        v.currentTime = 1e9;
        await new Promise<void>((r) => v.addEventListener("seeked", () => r(), { once: true }));
      }
      if (cancelled) return;
      v.currentTime = Math.min(start, Math.max(0, (Number.isFinite(v.duration) ? v.duration : start) - 0.5));
      v.addEventListener("timeupdate", onTime);
      await v.play().catch(() => undefined);
    };
    const onMeta = () => void run();
    if (v.readyState >= 1) onMeta();
    else v.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => {
      cancelled = true;
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [url, t, lengthMs]);

  if (url) return <video ref={video} src={url} muted playsInline className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  if (fallbackUrl) return <img src={fallbackUrl} alt="" className={className} />;
  return <div className={`flex items-center justify-center rounded bg-white/5 text-xs text-zinc-500 ${className ?? ""}`}>{caption ?? "Screen moment not stored in this session"}</div>;
}
