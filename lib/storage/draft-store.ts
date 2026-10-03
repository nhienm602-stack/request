/**
 * Draft persistence for the wizard.
 *
 * Behind an interface so the storage medium is a swappable detail. Today it is
 * `sessionStorage`; a deployment that needs cross-device resume can drop in a
 * server-backed implementation without touching the provider or the forms.
 *
 * `sessionStorage` (not `localStorage`) is deliberate: this form carries a name,
 * address and phone number, and that should not outlive the browser tab on a
 * shared machine.
 */
export interface DraftStore<T> {
  read(): T | null;
  write(value: T): void;
  clear(): void;
}

/** Used during SSR and wherever storage is unavailable (private mode, quota). */
export function createNullDraftStore<T>(): DraftStore<T> {
  return {
    read: () => null,
    write: () => {},
    clear: () => {},
  };
}

export function createSessionDraftStore<T>(
  key: string,
  /** Guards against stale or hand-edited payloads from a previous release. */
  parse: (raw: unknown) => T | null
): DraftStore<T> {
  const storage = getSessionStorage();
  if (!storage) return createNullDraftStore<T>();

  return {
    read() {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return null;
        return parse(JSON.parse(raw) as unknown);
      } catch {
        // Corrupt payload: drop it rather than trapping the user on a broken step.
        try {
          storage.removeItem(key);
        } catch {
          /* storage went away entirely — nothing further to do */
        }
        return null;
      }
    },
    write(value) {
      try {
        storage.setItem(key, JSON.stringify(value));
      } catch {
        // Quota or private-mode failure. The in-memory wizard state is the
        // source of truth, so losing the backup only costs resume-on-refresh.
      }
    },
    clear() {
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Touching `sessionStorage` throws outright in some privacy configurations.
    return window.sessionStorage;
  } catch {
    return null;
  }
}
