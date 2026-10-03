"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "@/components/ui/icons";
import { acceptAttribute, formatBytes, type MediaConstraints } from "@/lib/refund/media";

interface FileDropFieldProps {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onBlur?: () => void;
  constraints: MediaConstraints;
  /**
   * `user` opens the front camera on mobile, `environment` the rear one.
   * Ignored on desktop, where the file picker opens instead.
   */
  capture?: "user" | "environment";
  /** Rendered when a file is selected — a thumbnail, a video player, etc. */
  preview?: ReactNode;
  /** Icon shown in the empty state. */
  icon: ReactNode;
  /** Extra guidance shown while no file is chosen. */
  emptyPrompt: string;
}

/**
 * A single-file picker that accepts both click-to-browse and drag-and-drop.
 *
 * Built around a real, visually-hidden `<input type="file">` rather than a
 * `<div>` with a click handler: that keeps keyboard focus, the native file
 * dialog, form association, and screen-reader semantics working for free.
 * The visible card is a `<label>`, so clicking anywhere on it activates the
 * input without any JavaScript.
 */
export function FileDropField({
  name,
  label,
  hint,
  error,
  file,
  onFileChange,
  onBlur,
  constraints,
  capture,
  preview,
  icon,
  emptyPrompt,
}: FileDropFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const reactId = useId();
  const inputId = `${name}-${reactId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const dropped = event.dataTransfer.files?.[0];
    // Type and size are validated by the schema, not here — this component
    // stays presentational so the rules live in exactly one place.
    if (dropped) onFileChange(dropped);
  };

  const clearFile = () => {
    onFileChange(null);
    // Resetting the input's value matters: without it, re-picking the same file
    // fires no `change` event and the field silently stays empty.
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
        <span className="sr-only"> (required)</span>
      </label>

      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors",
          // `focus-within` mirrors the hidden input's focus ring onto the card,
          // so keyboard users can see where they are.
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
          isDraggingOver && "border-primary bg-primary-subtle",
          !isDraggingOver && error && "border-danger-border bg-danger-subtle",
          !isDraggingOver && !error && "border-border-strong bg-surface-muted hover:border-primary"
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          accept={acceptAttribute(constraints)}
          capture={capture}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required
          onBlur={onBlur}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          // `sr-only` rather than `display: none` — a hidden input cannot be
          // focused, which would break keyboard access entirely.
          className="sr-only"
        />

        {file ? (
          <div className="flex w-full flex-col items-center gap-3">
            {preview}
            <p className="max-w-full truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)}</p>
          </div>
        ) : (
          <>
            <span className="text-muted" aria-hidden="true">
              {icon}
            </span>
            <p className="text-sm font-medium text-foreground">{emptyPrompt}</p>
            <p className="text-xs text-muted">
              {constraints.label} · up to {formatBytes(constraints.maxBytes)}
            </p>
          </>
        )}
      </label>

      {file ? (
        <Button
          variant="ghost"
          onClick={clearFile}
          className="self-start px-2 py-1 text-xs"
          // Names the specific field, so a screen-reader user hearing three
          // "Remove" buttons in a list can tell them apart.
          aria-label={`Remove ${label.toLowerCase()}`}
        >
          <TrashIcon className="size-4" />
          Remove
        </Button>
      ) : null}

      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
