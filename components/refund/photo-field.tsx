"use client";

/* eslint-disable @next/next/no-img-element -- The source is a blob: object URL
   for a file the user just picked. `next/image` cannot optimise it, and its
   loader would reject the protocol outright. */

import { FileDropField } from "./file-drop-field";
import { CameraIcon, FileIcon } from "@/components/ui/icons";
import { useObjectUrl } from "@/hooks/use-object-url";
import { PHOTO_CONSTRAINTS, isPreviewableImage } from "@/lib/refund/media";

interface PhotoFieldProps {
  name: "frontPhoto" | "backPhoto";
  label: string;
  hint: string;
  error?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onBlur?: () => void;
  emptyPrompt: string;
}

export function PhotoField(props: PhotoFieldProps) {
  const { file } = props;
  const canPreview = file !== null && isPreviewableImage(file);
  // Only create an object URL when the browser can actually decode the format;
  // pointing an `<img>` at a HEIC blob renders a broken-image icon.
  const previewUrl = useObjectUrl(canPreview ? file : null);

  return (
    <FileDropField
      {...props}
      constraints={PHOTO_CONSTRAINTS}
      capture="environment"
      icon={<CameraIcon className="size-7" />}
      preview={
        previewUrl ? (
          <img
            src={previewUrl}
            alt={`Preview of the ${props.label.toLowerCase()}`}
            className="h-32 w-full rounded-lg object-cover"
          />
        ) : file ? (
          // HEIC/HEIF path: no browser preview is possible, so show a neutral
          // placeholder instead of a broken image. The file is still valid.
          <span className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-lg bg-surface text-muted">
            <FileIcon className="size-7" />
            <span className="text-xs">Preview not available for this format</span>
          </span>
        ) : null
      }
    />
  );
}
