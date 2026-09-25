"use client";

import type { BreadcrumbGroupProps } from "@cloudscape-design/components/breadcrumb-group";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getMe } from "@/lib/api";
import type { User } from "@/lib/types";

export interface Notification {
  type: FlashbarProps.Type;
  header?: ReactNode;
  content?: ReactNode;
  /** Optional button shown on the right of the message, e.g. "View records". */
  action?: ReactNode;
}

interface ConsoleContextValue {
  user: User | null;
  breadcrumbs: BreadcrumbGroupProps.Item[];
  setBreadcrumbs: (items: BreadcrumbGroupProps.Item[]) => void;
  flashItems: FlashbarProps.MessageDefinition[];
  notify: (n: Notification) => string;
  dismiss: (id: string) => void;
  /** Header of the split panel registered by the current page, or null when the page has none. */
  splitPanelHeader: string | null;
  setSplitPanelHeader: (header: string | null) => void;
  splitPanelOpen: boolean;
  setSplitPanelOpen: (open: boolean) => void;
  /** Element inside the SplitPanel that pages portal their panel content into. */
  splitPanelTarget: HTMLElement | null;
  setSplitPanelTarget: (el: HTMLElement | null) => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

const AUTO_DISMISS_MS = 8000;

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbGroupProps.Item[]>([]);
  const [notifications, setNotifications] = useState<(Notification & { id: string })[]>([]);
  const nextId = useRef(0);
  const [splitPanelHeader, setSplitPanelHeader] = useState<string | null>(null);
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [splitPanelTarget, setSplitPanelTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // A 401 here is handled by the API client (redirect to /login).
    getMe().then(setUser).catch(() => undefined);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((list) => list.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (n: Notification) => {
      const id = `flash-${nextId.current++}`;
      setNotifications((list) => [{ ...n, id }, ...list]);
      if (n.type === "success") setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      return id;
    },
    [dismiss],
  );

  const flashItems = useMemo<FlashbarProps.MessageDefinition[]>(
    () =>
      notifications.map((n) => ({
        id: n.id,
        type: n.type,
        header: n.header,
        content: n.content,
        action: n.action,
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => dismiss(n.id),
      })),
    [notifications, dismiss],
  );

  const value = useMemo(
    () => ({
      user,
      breadcrumbs,
      setBreadcrumbs,
      flashItems,
      notify,
      dismiss,
      splitPanelHeader,
      setSplitPanelHeader,
      splitPanelOpen,
      setSplitPanelOpen,
      splitPanelTarget,
      setSplitPanelTarget,
    }),
    [user, breadcrumbs, flashItems, notify, dismiss, splitPanelHeader, splitPanelOpen, splitPanelTarget],
  );
  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used inside the /route53 layout");
  return ctx;
}

/** Set the page's breadcrumbs, e.g. useBreadcrumbs([{text: "Route 53", href: "/route53/dashboard"}, ...]). */
export function useBreadcrumbs(items: BreadcrumbGroupProps.Item[]): void {
  const { setBreadcrumbs } = useConsole();
  const key = JSON.stringify(items);
  useEffect(() => {
    setBreadcrumbs(JSON.parse(key) as BreadcrumbGroupProps.Item[]);
  }, [key, setBreadcrumbs]);
}

/** Show success/error messages in the Flashbar at the top of the page. */
export function useNotifications() {
  const { notify, dismiss } = useConsole();
  return { notify, dismiss };
}

/**
 * Register a split panel (shown on the right of the page) for as long as the calling component is mounted.
 * Render the panel body with createPortal(body, target) — only the header string goes through state.
 */
export function useSplitPanel(header: string) {
  const { setSplitPanelHeader, splitPanelTarget, splitPanelOpen, setSplitPanelOpen } = useConsole();
  useEffect(() => {
    setSplitPanelHeader(header);
  }, [header, setSplitPanelHeader]);
  useEffect(
    () => () => {
      setSplitPanelHeader(null);
      setSplitPanelOpen(false);
    },
    [setSplitPanelHeader, setSplitPanelOpen],
  );
  return { target: splitPanelTarget, open: splitPanelOpen, setOpen: setSplitPanelOpen };
}
