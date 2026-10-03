"use client";

import { useEffect, useState } from "react";

export interface VideoMetadata {
  readonly durationSeconds: number;
}

export type MetadataState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error" };

/** What the decode produced, tagged with the file it was produced from. */
type Resolved = { file: File; state: MetadataState<VideoMetadata> };

const IDLE: MetadataState<VideoMetadata> = { status: "idle" };
const LOADING: MetadataState<VideoMetadata> = { status: "loading" };

/**
 * Reads a video's duration by decoding its metadata off-screen.
 *
 * This lives outside the Zod schema on purpose: it is inherently asynchronous
 * and browser-only, whereas the schema must stay synchronous and runnable on
 * the server. The form treats the result as an additional gate before submit.
 *
 * `idle` and `loading` are derived during render from the file itself, and
 * state is only written from the decode callbacks. Setting `loading` from
 * inside the effect instead would render once with the *previous* file's
 * result still showing — briefly reporting a stale duration for a file the user
 * has already replaced.
 */
export function useVideoMetadata(file: File | null): MetadataState<VideoMetadata> {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (file === null) return;

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let cancelled = false;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (cancelled) return;
      const { duration } = video;
      // Some MediaRecorder-produced WebM files report `Infinity` until seeked.
      // Treat an unknown duration as "cannot verify" rather than as a failure.
      setResolved({
        file,
        state:
          Number.isFinite(duration) && duration > 0
            ? { status: "ready", data: { durationSeconds: duration } }
            : { status: "error" },
      });
      cleanup();
    };
    video.onerror = () => {
      if (cancelled) return;
      setResolved({ file, state: { status: "error" } });
      cleanup();
    };
    video.src = url;

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [file]);

  if (file === null) return IDLE;
  // Identity comparison, so a result belonging to a previously selected file is
  // never reported for the current one.
  if (resolved === null || resolved.file !== file) return LOADING;
  return resolved.state;
}
