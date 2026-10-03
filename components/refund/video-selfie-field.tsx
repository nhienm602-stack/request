"use client";

import { useEffect } from "react";
import { FileDropField } from "./file-drop-field";
import { ArrowLeftIcon, ArrowRightIcon, VideoIcon } from "@/components/ui/icons";
import { useObjectUrl } from "@/hooks/use-object-url";
import { useVideoMetadata } from "@/hooks/use-media-metadata";
import {
  VIDEO_CONSTRAINTS,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MIN_DURATION_SECONDS,
} from "@/lib/refund/media";

interface VideoSelfieFieldProps {
  error?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onBlur?: () => void;
  /**
   * Reports the asynchronous duration check upward. Duration cannot live in the
   * Zod schema — reading it requires decoding the file in a browser — so the
   * form treats it as a second gate alongside the schema.
   */
  onDurationIssue: (message: string | null) => void;
}

/**
 * Video selfie capture.
 *
 * Uses a file input with `capture="user"`, which opens the front camera
 * directly on mobile and the file picker on desktop. The component is
 * deliberately a thin wrapper over `FileDropField` so an in-browser
 * `MediaRecorder` implementation can replace the capture mechanism later
 * without the form, the schema, or the Server Action changing at all.
 */
export function VideoSelfieField({
  error,
  file,
  onFileChange,
  onBlur,
  onDurationIssue,
}: VideoSelfieFieldProps) {
  const previewUrl = useObjectUrl(file);
  const metadata = useVideoMetadata(file);

  useEffect(() => {
    if (metadata.status !== "ready") {
      // `error` (undecodable) is not reported as a duration problem: plenty of
      // valid recordings report no duration until seeked, and blocking on that
      // would reject good submissions. The server-side pipeline is the place to
      // enforce this strictly.
      onDurationIssue(null);
      return;
    }

    const { durationSeconds } = metadata.data;
    if (durationSeconds < VIDEO_MIN_DURATION_SECONDS) {
      onDurationIssue(
        `Your video is too short. Record at least ${VIDEO_MIN_DURATION_SECONDS} seconds so we can see you turn both ways.`
      );
    } else if (durationSeconds > VIDEO_MAX_DURATION_SECONDS) {
      onDurationIssue(
        `Your video is too long. Keep it under ${VIDEO_MAX_DURATION_SECONDS} seconds.`
      );
    } else {
      onDurationIssue(null);
    }
  }, [metadata, onDurationIssue]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border-subtle bg-surface-muted p-4">
        <p className="text-sm font-semibold text-foreground">Video selfie instructions</p>
        <ol className="mt-3 space-y-2 text-sm text-muted">
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">1.</span>
            <span>Look straight at the camera, then slowly turn left.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">2.</span>
            <span>Then slowly turn right and back to centre.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">3.</span>
            <span>Keep your face clearly visible throughout.</span>
          </li>
        </ol>

        {/* The arrows restate steps 1 and 2 visually. They are decorative — the
            text beside each one carries the meaning — so the icons are hidden
            from assistive tech and the labels are not duplicated. */}
        <div className="mt-4 flex items-center justify-center gap-6 border-t border-border-subtle pt-4">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowLeftIcon className="size-5 text-primary" />
            Left
          </span>
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            Right
            <ArrowRightIcon className="size-5 text-primary" />
          </span>
        </div>
      </div>

      <FileDropField
        name="videoSelfie"
        label="Video selfie"
        hint={`Between ${VIDEO_MIN_DURATION_SECONDS} and ${VIDEO_MAX_DURATION_SECONDS} seconds. On a phone this opens your front camera.`}
        error={error}
        file={file}
        onFileChange={onFileChange}
        onBlur={onBlur}
        constraints={VIDEO_CONSTRAINTS}
        capture="user"
        icon={<VideoIcon className="size-7" />}
        emptyPrompt="Record or upload your video selfie"
        preview={
          previewUrl ? (
            <video
              src={previewUrl}
              controls
              // Muted by default so reviewing a clip never blasts audio, and
              // `playsInline` stops iOS from hijacking into fullscreen.
              muted
              playsInline
              preload="metadata"
              className="h-40 w-full rounded-lg bg-black object-contain"
            />
          ) : null
        }
      />
    </div>
  );
}
