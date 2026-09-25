"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { usePathname, useRouter } from "next/navigation";

import { useBreadcrumbs } from "./ConsoleContext";

export default function ComingSoon({ title }: { title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: title, href: pathname },
  ]);

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <Box textAlign="center" color="inherit" padding={{ vertical: "xxl" }}>
          <SpaceBetween size="m">
            <Box variant="h2">Coming soon</Box>
            <Box variant="p" color="text-body-secondary">
              {title} isn&apos;t available in this Route 53 clone yet. Hosted zones and DNS records are fully supported.
            </Box>
            <Button onClick={() => router.push("/route53/hosted-zones")}>Go to Hosted zones</Button>
          </SpaceBetween>
        </Box>
      </Container>
    </ContentLayout>
  );
}
