"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useNotifications, useSplitPanel } from "@/components/ConsoleContext";
import DeleteRecordsModal from "@/components/DeleteRecordsModal";
import RecordDetailsPanel from "@/components/RecordDetailsPanel";
import { ApiError, listRecords } from "@/lib/api";
import { ROUTING_POLICY_LABELS, displayRecordName, isDefaultRecord } from "@/lib/records";
import { RECORD_TYPES, type DnsRecord, type HostedZone, type Page } from "@/lib/types";
import { useTablePreferences, type TablePreferences } from "@/lib/usePreferences";

const PREFS_KEY = "route53.records.preferences";
const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZES = [10, 25, 50, 100];

const TYPE_OPTIONS: SelectProps.Option[] = [
  { value: "", label: "All record types" },
  ...[...RECORD_TYPES, "SOA"].map((t) => ({ value: t, label: t })),
];

const COLUMN_LABELS: Record<string, string> = {
  name: "Record name",
  type: "Type",
  routing: "Routing policy",
  differentiator: "Differentiator",
  alias: "Alias",
  value: "Value/Route traffic to",
  ttl: "TTL (seconds)",
  healthCheck: "Health check ID",
};
const COLUMN_IDS = Object.keys(COLUMN_LABELS);

const COLUMNS: TableProps.ColumnDefinition<DnsRecord>[] = [
  { id: "name", header: COLUMN_LABELS.name, isRowHeader: true, cell: (r) => displayRecordName(r.name) },
  { id: "type", header: COLUMN_LABELS.type, cell: (r) => r.type },
  { id: "routing", header: COLUMN_LABELS.routing, cell: (r) => ROUTING_POLICY_LABELS[r.routing_policy] },
  { id: "differentiator", header: COLUMN_LABELS.differentiator, cell: (r) => r.set_identifier || "-" },
  { id: "alias", header: COLUMN_LABELS.alias, cell: (r) => (r.alias_target ? "Yes" : "No") },
  {
    id: "value",
    header: COLUMN_LABELS.value,
    cell: (r) =>
      r.alias_target ? (
        displayRecordName(r.alias_target.dns_name)
      ) : (
        <div>
          {r.values.map((v, i) => (
            <div key={i}>{v}</div>
          ))}
        </div>
      ),
  },
  { id: "ttl", header: COLUMN_LABELS.ttl, cell: (r) => (r.alias_target ? "-" : r.ttl) },
  { id: "healthCheck", header: COLUMN_LABELS.healthCheck, cell: () => "-" },
];

interface Props {
  zone: HostedZone;
  /** Called after records are created, edited or deleted (to refresh the zone details). */
  onChanged: () => void;
}

export default function RecordsTable({ zone, onChanged }: Props) {
  const router = useRouter();
  const { notify } = useNotifications();
  const { prefs, ready: prefsReady, save: savePrefs } = useTablePreferences(PREFS_KEY, COLUMN_IDS, PAGE_SIZES, 50);

  const [filteringText, setFilteringText] = useState("");
  const [search, setSearch] = useState("");
  const [typeOption, setTypeOption] = useState<SelectProps.Option>(TYPE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Page<DnsRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DnsRecord[]>([]);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const requestId = useRef(0);
  const searchRef = useRef("");

  const typeFilter = typeOption.value ?? "";
  const isFiltered = search !== "" || typeFilter !== "";
  const single = selected.length === 1 ? selected[0] : null;
  const hasDefault = selected.some((r) => isDefaultRecord(r, zone.name));

  const panel = useSplitPanel(single ? `${displayRecordName(single.name)} ${single.type}` : "Record details");
  const { setOpen: setPanelOpen } = panel;

  // Selecting exactly one record opens the split panel.
  const singleId = single?.id ?? null;
  useEffect(() => {
    if (singleId !== null) setPanelOpen(true);
  }, [singleId, setPanelOpen]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = filteringText.trim();
      if (next !== searchRef.current) {
        searchRef.current = next;
        setSearch(next);
        setPage(1);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filteringText]);

  useEffect(() => {
    if (!prefsReady) return;
    const id = ++requestId.current;
    setLoading(true);
    listRecords(zone.id, { search, type: typeFilter, page, page_size: prefs.pageSize })
      .then((res) => {
        if (id !== requestId.current) return;
        const lastPage = Math.max(1, Math.ceil(res.total / prefs.pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        setSelected((sel) => res.items.filter((r) => sel.some((s) => s.id === r.id)));
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        if (err instanceof ApiError && err.status === 401) return;
        notify({
          type: "error",
          header: "Failed to load records",
          content: err instanceof ApiError ? err.message : "Unexpected error.",
        });
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [zone.id, prefsReady, search, typeFilter, page, prefs.pageSize, reloadKey, notify]);

  const reload = () => setReloadKey((k) => k + 1);

  const clearFilters = () => {
    setFilteringText("");
    searchRef.current = "";
    setSearch("");
    setTypeOption(TYPE_OPTIONS[0]);
    setPage(1);
  };

  const total = data?.total ?? 0;
  const pagesCount = Math.max(1, Math.ceil(total / prefs.pageSize));
  const createPath = `/route53/hosted-zones/${zone.id}/create-record`;

  const panelBody = single ? (
    <RecordDetailsPanel
      record={single}
      zoneName={zone.name}
      onUpdated={(updated) => {
        setSelected([updated]);
        setData((d) => (d ? { ...d, items: d.items.map((r) => (r.id === updated.id ? updated : r)) } : d));
        reload();
        onChanged();
      }}
    />
  ) : (
    <Box color="text-body-secondary">
      {selected.length > 1
        ? `${selected.length} records selected. Select a single record to view its details.`
        : "Select a single record to view its details."}
    </Box>
  );

  return (
    <>
      <Table<DnsRecord>
        variant="container"
        stickyHeader
        trackBy="id"
        items={data?.items ?? []}
        columnDefinitions={COLUMNS}
        columnDisplay={prefs.contentDisplay}
        loading={loading}
        loadingText="Loading records"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        onRowClick={({ detail }) => setSelected([detail.item])}
        ariaLabels={{
          selectionGroupLabel: "Record selection",
          itemSelectionLabel: (_s, r) => `${displayRecordName(r.name)} ${r.type}`,
          allItemsSelectionLabel: () => "Select all records on this page",
        }}
        header={
          <Header
            counter={data ? (selected.length > 0 ? `(${selected.length}/${total})` : `(${total})`) : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh records" disabled={loading} onClick={reload} />
                <Button
                  disabled={selected.length === 0 || hasDefault}
                  disabledReason={hasDefault ? "The default NS and SOA records can't be deleted." : undefined}
                  onClick={() => setDeleteVisible(true)}
                >
                  Delete record
                </Button>
                <Button variant="primary" onClick={() => router.push(createPath)}>
                  Create record
                </Button>
              </SpaceBetween>
            }
          >
            Records
          </Header>
        }
        filter={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 280px", maxWidth: 520 }}>
              <TextFilter
                filteringText={filteringText}
                onChange={({ detail }) => setFilteringText(detail.filteringText)}
                filteringPlaceholder="Filter records by name or value"
                filteringAriaLabel="Filter records"
                countText={search !== "" && data ? `${total} ${total === 1 ? "match" : "matches"}` : undefined}
              />
            </div>
            <div style={{ flex: "0 1 200px" }}>
              <Select
                selectedOption={typeOption}
                onChange={({ detail }) => {
                  setTypeOption(detail.selectedOption);
                  setPage(1);
                }}
                options={TYPE_OPTIONS}
                ariaLabel="Filter by record type"
              />
            </div>
          </div>
        }
        pagination={
          <Pagination
            currentPageIndex={page}
            pagesCount={pagesCount}
            onChange={({ detail }) => setPage(detail.currentPageIndex)}
            ariaLabels={{
              nextPageLabel: "Next page",
              previousPageLabel: "Previous page",
              pageLabel: (n) => `Page ${n} of all pages`,
            }}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={{ pageSize: prefs.pageSize, contentDisplay: prefs.contentDisplay }}
            onConfirm={({ detail }) => {
              const next: TablePreferences = {
                pageSize: detail.pageSize ?? prefs.pageSize,
                contentDisplay: detail.contentDisplay ? [...detail.contentDisplay] : prefs.contentDisplay,
              };
              savePrefs(next);
              setPage(1);
            }}
            pageSizePreference={{
              title: "Page size",
              options: PAGE_SIZES.map((v) => ({ value: v, label: `${v} records` })),
            }}
            contentDisplayPreference={{
              title: "Column preferences",
              description: "Customize the columns visibility and order.",
              options: COLUMN_IDS.map((id) => ({ id, label: COLUMN_LABELS[id], alwaysVisible: id === "name" })),
            }}
          />
        }
        empty={
          isFiltered ? (
            <Box textAlign="center" color="inherit" padding={{ vertical: "l" }}>
              <SpaceBetween size="m">
                <Box variant="strong" color="inherit">
                  No matches
                </Box>
                <Box variant="p" color="inherit">
                  No records match the filter.
                </Box>
                <Button onClick={clearFilters}>Clear filter</Button>
              </SpaceBetween>
            </Box>
          ) : (
            <Box textAlign="center" color="inherit" padding={{ vertical: "l" }}>
              <SpaceBetween size="m">
                <Box variant="strong" color="inherit">
                  No records
                </Box>
                <Button onClick={() => router.push(createPath)}>Create record</Button>
              </SpaceBetween>
            </Box>
          )
        }
      />
      {panel.target ? createPortal(panelBody, panel.target) : null}
      <DeleteRecordsModal
        zoneId={zone.id}
        records={selected}
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        onDeleted={() => {
          setSelected([]);
          reload();
          onChanged();
        }}
      />
    </>
  );
}
