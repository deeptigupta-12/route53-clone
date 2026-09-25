"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, { type KeyValuePairsProps } from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs from "@cloudscape-design/components/tabs";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useBreadcrumbs } from "@/components/ConsoleContext";
import DeleteZoneModal from "@/components/DeleteZoneModal";
import RecordsTable from "@/components/RecordsTable";
import { listRecords } from "@/lib/api";
import { displayZoneName, formatDateTime } from "@/lib/format";
import { regionLabel } from "@/lib/regions";
import { useZone } from "@/lib/useZone";

const ZONES_PATH = "/route53/hosted-zones";

function ComingSoonTab({ title }: { title: string }) {
  return (
    <Container>
      <Box textAlign="center" color="inherit" padding={{ vertical: "xl" }}>
        <SpaceBetween size="s">
          <Box variant="h3">Coming soon</Box>
          <Box color="text-body-secondary">{`${title} isn't available in this Route 53 clone yet.`}</Box>
        </SpaceBetween>
      </Box>
    </Container>
  );
}

export default function HostedZoneDetailsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { zone, error, loading, reload } = useZone(id);
  const [nameServers, setNameServers] = useState<string[] | null>(null);
  const [nsKey, setNsKey] = useState(0);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("records");
  const name = zone ? displayZoneName(zone.name) : id;

  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: "Hosted zones", href: ZONES_PATH },
    { text: name, href: `${ZONES_PATH}/${id}` },
  ]);

  // Name servers come from the zone's apex NS record.
  const zoneName = zone?.name ?? null;
  useEffect(() => {
    if (!zoneName) return;
    let cancelled = false;
    listRecords(id, { type: "NS", page_size: 300 })
      .then((res) => {
        if (cancelled) return;
        const apex = res.items.find((r) => r.name === zoneName && r.set_identifier === "");
        setNameServers(apex ? apex.values : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, zoneName, nsKey]);

  const onRecordsChanged = useCallback(() => {
    reload();
    setNsKey((k) => k + 1);
  }, [reload]);

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

  const details: KeyValuePairsProps.Item[] = [
    { label: "Hosted zone name", value: name },
    { label: "Hosted zone ID", value: zone.id },
    { label: "Type", value: zone.is_private ? "Private hosted zone" : "Public hosted zone" },
    { label: "Record count", value: zone.record_count },
    { label: "Description", value: zone.comment || "-" },
    { label: "Created by", value: "Route 53" },
    {
      label: "Name servers",
      value:
        nameServers === null ? (
          <Spinner />
        ) : nameServers.length > 0 ? (
          <div>
            {nameServers.map((ns) => (
              <div key={ns}>{ns}</div>
            ))}
          </div>
        ) : (
          "-"
        ),
    },
    { label: "Created", value: formatDateTime(zone.created_at) },
    ...(zone.is_private
      ? [
          { label: "VPC ID", value: zone.vpc_id ?? "-" },
          { label: "VPC Region", value: regionLabel(zone.vpc_region) },
        ]
      : []),
  ];

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleteVisible(true)}>Delete zone</Button>
              <Button onClick={() => router.push(`${ZONES_PATH}/${zone.id}/edit?from=details`)}>Edit hosted zone</Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <ExpandableSection variant="container" headerText="Hosted zone details" defaultExpanded>
          <KeyValuePairs columns={3} items={details} />
        </ExpandableSection>
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          ariaLabel="Hosted zone tabs"
          tabs={[
            { id: "records", label: "Records", content: <RecordsTable zone={zone} onChanged={onRecordsChanged} /> },
            { id: "dnssec", label: "DNSSEC signing", content: <ComingSoonTab title="DNSSEC signing" /> },
            { id: "tags", label: "Hosted zone tags", content: <ComingSoonTab title="Hosted zone tags" /> },
          ]}
        />
      </SpaceBetween>
      <DeleteZoneModal
        zone={zone}
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        onDeleted={() => {
          setDeleteVisible(false);
          router.push(ZONES_PATH);
        }}
      />
    </ContentLayout>
  );
}
