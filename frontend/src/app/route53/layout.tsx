"use client";

import AppLayout from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Flashbar from "@cloudscape-design/components/flashbar";
import Input, { type InputProps } from "@cloudscape-design/components/input";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import SplitPanel from "@cloudscape-design/components/split-panel";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import ClientOnly from "@/components/ClientOnly";
import { ConsoleProvider, useConsole } from "@/components/ConsoleContext";
import { logout } from "@/lib/api";
import { NAV_ITEMS, navLinkForPath } from "@/lib/nav";

type FollowEvent = CustomEvent<{ href?: string; external?: boolean }>;

function formatAccountId(id: string): string {
  return id.replace(/^(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3");
}

function ConsoleShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    breadcrumbs,
    flashItems,
    splitPanelHeader,
    splitPanelOpen,
    setSplitPanelOpen,
    setSplitPanelTarget,
  } = useConsole();
  const [navigationOpen, setNavigationOpen] = useState(true);
  // The record panel opens on the right ("side"), as in the Route 53 console.
  const [splitPanelPosition, setSplitPanelPosition] = useState<"side" | "bottom">("side");
  const [search, setSearch] = useState("");
  const searchRef = useRef<InputProps.Ref>(null);

  // Alt+S focuses the console search, like the real AWS console.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const follow = (event: FollowEvent) => {
    const href = event.detail.href;
    if (!href || event.detail.external) return;
    event.preventDefault();
    router.push(href);
  };

  const signOut = async () => {
    try {
      await logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const accountId = user ? formatAccountId(user.account_id) : "";

  return (
    <>
      <div id="top-nav" style={{ position: "sticky", top: 0, zIndex: 1002 }}>
        <TopNavigation
          identity={{
            href: "/route53/dashboard",
            logo: { src: "/aws-logo.svg", alt: "AWS" },
            onFollow: (e) => {
              e.preventDefault();
              router.push("/route53/dashboard");
            },
          }}
          search={
            <Input
              ref={searchRef}
              type="search"
              value={search}
              onChange={({ detail }) => setSearch(detail.value)}
              placeholder="Search  [Alt+S]"
              ariaLabel="Search"
            />
          }
          utilities={[
            { type: "button", iconName: "script", ariaLabel: "CloudShell", title: "CloudShell" },
            { type: "button", iconName: "notification", ariaLabel: "Notifications", title: "Notifications" },
            { type: "button", iconName: "settings", ariaLabel: "Settings", title: "Settings" },
            {
              type: "menu-dropdown",
              text: "Global",
              ariaLabel: "Region: Global",
              items: [
                { id: "global-info", text: "Route 53 does not require region selection.", disabled: true },
              ],
            },
            {
              type: "menu-dropdown",
              text: user?.username ?? "Account",
              description: accountId ? `Account ID: ${accountId}` : undefined,
              iconName: "user-profile",
              items: [
                { id: "account", text: "Account" },
                { id: "settings", text: "Settings" },
                { id: "signout", text: "Sign out" },
              ],
              onItemClick: ({ detail }) => {
                if (detail.id === "signout") void signOut();
              },
            },
          ]}
          i18nStrings={{
            overflowMenuTriggerText: "More",
            overflowMenuTitleText: "All",
            searchIconAriaLabel: "Search",
            searchDismissIconAriaLabel: "Close search",
          }}
        />
      </div>
      <AppLayout
        headerSelector="#top-nav"
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        navigation={
          <SideNavigation
            header={{ text: "Route 53", href: "/route53/dashboard" }}
            activeHref={navLinkForPath(pathname)?.href ?? pathname}
            items={NAV_ITEMS}
            onFollow={follow}
          />
        }
        breadcrumbs={
          breadcrumbs.length > 0 ? (
            <BreadcrumbGroup items={breadcrumbs} onFollow={follow} ariaLabel="Breadcrumbs" />
          ) : undefined
        }
        notifications={flashItems.length > 0 ? <Flashbar items={flashItems} /> : undefined}
        splitPanel={
          splitPanelHeader !== null ? (
            <SplitPanel
              header={splitPanelHeader}
              hidePreferencesButton
              i18nStrings={{
                closeButtonAriaLabel: "Close panel",
                openButtonAriaLabel: "Open panel",
                resizeHandleAriaLabel: "Resize panel",
              }}
            >
              <div ref={setSplitPanelTarget} />
            </SplitPanel>
          ) : undefined
        }
        splitPanelOpen={splitPanelHeader !== null && splitPanelOpen}
        onSplitPanelToggle={({ detail }) => setSplitPanelOpen(detail.open)}
        splitPanelPreferences={{ position: splitPanelPosition }}
        onSplitPanelPreferencesChange={({ detail }) => setSplitPanelPosition(detail.position)}
        toolsHide
        content={children}
      />
    </>
  );
}

export default function Route53Layout({ children }: { children: ReactNode }) {
  // The whole console is client-only: Cloudscape can't compute some layout classes during SSR.
  return (
    <ClientOnly>
      <ConsoleProvider>
        <ConsoleShell>{children}</ConsoleShell>
      </ConsoleProvider>
    </ClientOnly>
  );
}
