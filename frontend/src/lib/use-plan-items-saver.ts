"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "./api";
import type { PlanItem } from "./types";

export type SaveStatus = "saved" | "saving" | "error";

// Whitespace-only notes are stored as "no note". Local state keeps the raw text so typing isn't disrupted.
const toPayload = (items: PlanItem[]): PlanItem[] =>
  items.map((i) => ({ ...i, vet_note: i.vet_note?.trim() || null }));

/**
 * Saves a plan's items one PATCH at a time. Edits made while a request is in flight are
 * coalesced into the next request, so the server always ends with the latest local state
 * and responses never overwrite newer local edits (e.g. a vet note being typed).
 */
export function usePlanItemsSaver(planId: string) {
  const queued = useRef<PlanItem[] | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<unknown>(null);

  const drain = useCallback((): Promise<boolean> => {
    if (!running.current) {
      const run = async () => {
        setStatus("saving");
        while (queued.current) {
          const items = queued.current;
          queued.current = null;
          try {
            await api.updatePlan(planId, { items: toPayload(items) });
          } catch (e) {
            queued.current ??= items; // keep the unsaved state (unless a newer edit already replaced it)
            setError(e);
            setStatus("error");
            return false;
          }
        }
        setError(null);
        setStatus("saved");
        return true;
      };
      running.current = run().finally(() => {
        running.current = null;
      });
    }
    return running.current;
  }, [planId]);

  const save = useCallback(
    (items: PlanItem[]) => {
      queued.current = items;
      void drain();
    },
    [drain],
  );

  /** Resolves true once every edit is on the server (retrying anything that failed), false on error. */
  const flush = useCallback(async () => {
    while (running.current || queued.current) {
      if (!(await drain())) return false;
    }
    return true;
  }, [drain]);

  return { save, flush, status, error };
}
