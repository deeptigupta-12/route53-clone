"use client";

// Placeholder: the full zone details page (records table, tabs) is built in the next phase.
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useParams, useRouter } from "next/navigation";

import { useBreadcrumbs } from "@/components/ConsoleContext";
import { displayZoneName } from "@/lib/format";
import { useZone } from "@/lib/useZone";

const ZONES_PATH = "/route53/hosted-zones";

export default function HostedZoneDetailsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { zone, error, loading } = useZone(id);
  const name = zone ? displayZoneName(zone.name) : id;

  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: "Hosted zones", href: ZONES_PATH },
    { text: name, href: `${ZONES_PATH}/${id}` },
  ]);

  if (loading && !zone) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }

  if (error || !zone) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">Hosted zone</Header>
        <Alert type="error" header="Hosted zone not found">
          {error?.message ?? "The hosted zone could not be loaded."}
        </Alert>
        <Button onClick={() => router.push(ZONES_PATH)}>Back to hosted zones</Button>
      </SpaceBetween>
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={<Button onClick={() => router.push(`${ZONES_PATH}/${zone.id}/edit?from=details`)}>Edit hosted zone</Button>}
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Hosted zone details</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Hosted zone name", value: name },
              { label: "Hosted zone ID", value: zone.id },
              { label: "Type", value: zone.is_private ? "Private hosted zone" : "Public hosted zone" },
              { label: "Record count", value: zone.record_count },
              { label: "Description", value: zone.comment || "-" },
              { label: "Created by", value: "Route 53" },
            ]}
          />
        </Container>
        <Container>
          <Box color="text-body-secondary">The records table for this hosted zone is coming in the next phase.</Box>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
