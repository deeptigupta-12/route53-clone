"use client";

import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";
import { useCallback, useEffect, useState } from "react";

export interface TablePreferences {
  pageSize: number;
  contentDisplay: CollectionPreferencesProps.ContentDisplayItem[];
}

function defaultsFor(columnIds: readonly string[], defaultPageSize: number): TablePreferences {
  return { pageSize: defaultPageSize, contentDisplay: columnIds.map((id) => ({ id, visible: true })) };
}

/** Stored preferences, repaired against the current columns. Browser storage may be unavailable. */
function load(
  storageKey: string,
  columnIds: readonly string[],
  pageSizes: readonly number[],
  defaultPageSize: number,
): TablePreferences {
  const defaults = defaultsFor(columnIds, defaultPageSize);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Partial<TablePreferences>;
    const pageSize = pageSizes.includes(Number(stored.pageSize)) ? Number(stored.pageSize) : defaultPageSize;
    const known = (stored.contentDisplay ?? []).filter((c) => columnIds.includes(c.id));
    const missing = columnIds.filter((id) => !known.some((c) => c.id === id)).map((id) => ({ id, visible: true }));
    return { pageSize, contentDisplay: [...known, ...missing] };
  } catch {
    return defaults;
  }
}

/**
 * Page size + column visibility/order for a table, persisted in localStorage.
 * `ready` turns true after the stored value is read (after mount), so the first fetch uses it.
 * Pass module-level constants for `columnIds` and `pageSizes`.
 */
export function useTablePreferences(
  storageKey: string,
  columnIds: readonly string[],
  pageSizes: readonly number[],
  defaultPageSize: number,
) {
  const [prefs, setPrefs] = useState<TablePreferences>(() => defaultsFor(columnIds, defaultPageSize));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(load(storageKey, columnIds, pageSizes, defaultPageSize));
    setReady(true);
  }, [storageKey, columnIds, pageSizes, defaultPageSize]);

  const save = useCallback(
    (next: TablePreferences) => {
      setPrefs(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // storage unavailable: preferences last for this visit only
      }
    },
    [storageKey],
  );

  return { prefs, ready, save };
}
