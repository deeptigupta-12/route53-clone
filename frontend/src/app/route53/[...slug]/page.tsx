import ComingSoon from "@/components/ComingSoon";
import { titleForPath } from "@/lib/nav";

// Any other Route 53 section in the side navigation (domains, DNS firewall, resolver sub-pages, ...).
export default async function ComingSoonPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <ComingSoon title={titleForPath(`/route53/${slug.join("/")}`)} />;
}
