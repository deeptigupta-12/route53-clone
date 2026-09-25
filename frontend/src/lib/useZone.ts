"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, getHostedZone } from "./api";
import type { HostedZone } from "./types";

/** Load one hosted zone by ID. `error` is set for 404s and other failures (401 redirects to /login). */
export function useZone(zoneId: string) {
  const [zone, setZone] = useState<HostedZone | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHostedZone(zoneId)
      .then((z) => {
        if (cancelled) return;
        setZone(z);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError(0, "Error", "Unexpected error."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { zone, setZone, error, loading, reload };
}
