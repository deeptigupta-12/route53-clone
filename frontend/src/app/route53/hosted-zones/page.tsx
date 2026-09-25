"use client";

// Placeholder: replaced by the full hosted zones table in the next step.
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import { useEffect, useState } from "react";

import { useBreadcrumbs, useNotifications } from "@/components/ConsoleContext";
import { ApiError, listHostedZones } from "@/lib/api";
import type { HostedZone, Page } from "@/lib/types";

export default function HostedZonesPage() {
  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: "Hosted zones", href: "/route53/hosted-zones" },
  ]);
  const { notify } = useNotifications();
  const [data, setData] = useState<Page<HostedZone> | null>(null);

  useEffect(() => {
    listHostedZones({ page_size: 100 })
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status !== 401) {
          notify({ type: "error", header: "Could not load hosted zones", content: err.message });
        }
      });
  }, [notify]);

  return (
    <ContentLayout
      header={
        <Header variant="h1" counter={data ? `(${data.total})` : undefined}>
          Hosted zones
        </Header>
      }
    >
      <Container>
        {data === null ? (
          <Spinner size="large" />
        ) : data.items.length === 0 ? (
          <Box color="text-body-secondary">No hosted zones</Box>
        ) : (
          <ul>
            {data.items.map((z) => (
              <li key={z.id}>
                <Link href={`/route53/hosted-zones/${z.id}`}>{z.name}</Link> — {z.is_private ? "Private" : "Public"},{" "}
                {z.record_count} records
              </li>
            ))}
          </ul>
        )}
      </Container>
    </ContentLayout>
  );
}
