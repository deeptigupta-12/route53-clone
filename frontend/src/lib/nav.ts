import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";

// Mirrors the side navigation of the real Route 53 console.
export const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: "/route53/dashboard" },
  { type: "link", text: "Hosted zones", href: "/route53/hosted-zones" },
  { type: "link", text: "Health checks", href: "/route53/health-checks" },
  { type: "link", text: "Profiles", href: "/route53/profiles" },
  { type: "divider" },
  {
    type: "section",
    text: "Traffic flow",
    items: [
      { type: "link", text: "Traffic policies", href: "/route53/traffic-policies" },
      { type: "link", text: "Policy records", href: "/route53/policy-records" },
    ],
  },
  {
    type: "section",
    text: "Domains",
    items: [
      { type: "link", text: "Registered domains", href: "/route53/domains/registered" },
      { type: "link", text: "Requests", href: "/route53/domains/requests" },
    ],
  },
  {
    type: "section",
    text: "IP-based routing",
    items: [{ type: "link", text: "CIDR collections", href: "/route53/cidr-collections" }],
  },
  {
    type: "section",
    text: "Resolver",
    items: [
      { type: "link", text: "VPCs", href: "/route53/resolver" },
      { type: "link", text: "Inbound endpoints", href: "/route53/resolver/inbound-endpoints" },
      { type: "link", text: "Outbound endpoints", href: "/route53/resolver/outbound-endpoints" },
      { type: "link", text: "Rules", href: "/route53/resolver/rules" },
      { type: "link", text: "Query logging", href: "/route53/resolver/query-logging" },
    ],
  },
  {
    type: "section",
    text: "DNS Firewall",
    items: [
      { type: "link", text: "Rule groups", href: "/route53/dns-firewall/rule-groups" },
      { type: "link", text: "Domain lists", href: "/route53/dns-firewall/domain-lists" },
    ],
  },
];

interface NavLink {
  text: string;
  href: string;
}

function flattenLinks(items: readonly SideNavigationProps.Item[]): NavLink[] {
  return items.flatMap((item): NavLink[] => {
    if (item.type === "link") return [{ text: item.text, href: item.href }];
    if (item.type === "section" || item.type === "expandable-link-group" || item.type === "section-group") {
      return flattenLinks(item.items);
    }
    return [];
  });
}

const NAV_LINKS = flattenLinks(NAV_ITEMS);

/** The nav link that owns this path (longest matching prefix), e.g. /route53/hosted-zones/Z123 -> Hosted zones. */
export function navLinkForPath(pathname: string): NavLink | undefined {
  return NAV_LINKS.filter((l) => pathname === l.href || pathname.startsWith(l.href + "/")).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

export function titleForPath(pathname: string): string {
  const exact = NAV_LINKS.find((l) => l.href === pathname);
  if (exact) return exact.text;
  const last = pathname.split("/").filter(Boolean).pop() ?? "Route 53";
  const words = last.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
