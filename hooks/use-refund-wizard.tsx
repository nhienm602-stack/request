"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { refundDetailsSchema, type RefundDetails } from "@/lib/refund/details-schema";
import {
  createNullDraftStore,
  createSessionDraftStore,
  type DraftStore,
} from "@/lib/storage/draft-store";

const DRAFT_KEY = "refund-request:details:v1";

// `useLayoutEffect` warns when run during SSR; `useEffect` is the correct
// no-op fallback there. On the client the layout variant matters: it commits
// before paint, so restoring a draft never flashes the empty state.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Re-validating the restored draft is what makes this safe: a payload written by
 * an older release, or edited by hand, is discarded rather than trusted.
 */
function parseDraft(raw: unknown): RefundDetails | null {
  const result = refundDetailsSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** `loading` until the persisted draft has been read on the client. */
export type WizardStatus = "loading" | "ready";

interface WizardState {
  status: WizardStatus;
  details: RefundDetails | null;
  /**
   * True once a submission has been accepted by the server.
   *
   * Step 2 guards against being reached without details, and completing the
   * flow also clears those details — so without this flag the guard cannot tell
   * "never had details" from "just finished successfully", and fires during the
   * redirect to the confirmation page.
   */
  isComplete: boolean;
}

interface RefundWizardValue extends WizardState {
  setDetails: (details: RefundDetails) => void;
  /** Marks the flow finished and clears the stored draft. */
  complete: () => void;
  /** Abandons the draft without marking the flow complete. */
  reset: () => void;
}

const INITIAL_STATE: WizardState = { status: "loading", details: null, isComplete: false };

const RefundWizardContext = createContext<RefundWizardValue | null>(null);

export function RefundWizardProvider({ children }: { children: ReactNode }) {
  // Created lazily and held in a ref: `sessionStorage` is unavailable during
  // SSR, and the store must not be rebuilt on every render.
  const storeRef = useRef<DraftStore<RefundDetails> | null>(null);
  const getStore = useCallback((): DraftStore<RefundDetails> => {
    storeRef.current ??=
      typeof window === "undefined"
        ? createNullDraftStore<RefundDetails>()
        : createSessionDraftStore<RefundDetails>(DRAFT_KEY, parseDraft);
    return storeRef.current;
  }, []);

  // Always starts as `loading`, on both server and client, so the first client
  // render matches the server HTML exactly. Reading `sessionStorage` in a lazy
  // initialiser instead would make the two diverge and trigger a hydration
  // mismatch. Consumers render a skeleton while `status === "loading"`.
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  useIsomorphicLayoutEffect(() => {
    setState({ status: "ready", details: getStore().read(), isComplete: false });
  }, [getStore]);

  const setDetails = useCallback(
    (details: RefundDetails) => {
      getStore().write(details);
      // Starting a fresh set of details reopens the flow, so a previous
      // completion must not linger and suppress the step 2 guard.
      setState({ status: "ready", details, isComplete: false });
    },
    [getStore]
  );

  const complete = useCallback(() => {
    getStore().clear();
    setState({ status: "ready", details: null, isComplete: true });
  }, [getStore]);

  const reset = useCallback(() => {
    getStore().clear();
    setState({ status: "ready", details: null, isComplete: false });
  }, [getStore]);

  const value = useMemo<RefundWizardValue>(
    () => ({ ...state, setDetails, complete, reset }),
    [state, setDetails, complete, reset]
  );

  return <RefundWizardContext.Provider value={value}>{children}</RefundWizardContext.Provider>;
}

export function useRefundWizard(): RefundWizardValue {
  const context = useContext(RefundWizardContext);
  if (context === null) {
    throw new Error("useRefundWizard must be used inside a <RefundWizardProvider>.");
  }
  return context;
}
