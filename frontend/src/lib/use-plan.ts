"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DEMO_PLAN_ID, samplePlan } from "@/lib/sample-plan";
import type { Plan } from "@/lib/types";

/**
 * Loads a plan for the owner-facing pages. `save` updates it optimistically, then persists
 * (the /plan/demo sample stays local, so its changes reset between pages).
 */
export function usePlan(id: string) {
  const demo = id === DEMO_PLAN_ID;
  const [plan, setPlan] = useState<Plan | null>(demo ? samplePlan : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    api
      .getPlan(id)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id, demo]);

  const save = useCallback(
    async (patch: Partial<Plan>) => {
      setPlan((p) => (p ? { ...p, ...patch } : p));
      if (!demo) await api.updatePlan(id, patch);
    },
    [id, demo],
  );

  return { plan, error, demo, save };
}
