"use client";

import { useEffect, useMemo } from "react";

/**
 * Object URL for a `File`, revoked when the file changes or the component
 * unmounts. Forgetting the revoke leaks the whole file — which matters here,
 * where a single video can be 50MB.
 *
 * The URL is derived with `useMemo` rather than held in state and assigned from
 * an effect: state-from-effect costs an extra render on every file change, and
 * means the first paint after a pick renders with a stale (or null) URL. The
 * effect below exists purely for cleanup — when `url` changes, React runs the
 * previous effect's teardown with the *previous* URL still captured, so the old
 * one is always released.
 */
export function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file === null ? null : URL.createObjectURL(file)), [file]);

  useEffect(() => {
    if (url === null) return;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}
