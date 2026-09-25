"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useBreadcrumbs, useNotifications } from "@/components/ConsoleContext";
import DeleteZoneModal from "@/components/DeleteZoneModal";
import { ApiError, listHostedZones } from "@/lib/api";
import { displayZoneName } from "@/lib/format";
import type { HostedZone, Page } from "@/lib/types";

const ZONES_PATH = "/route53/hosted-zones";
const PREFS_KEY = "route53.hostedZones.preferences";
const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZES = [10, 25, 50, 100];

const TYPE_OPTIONS: SelectProps.Option[] = [
  { value: "", label: "All hosted zones" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

const COLUMN_LABELS: Record<string, string> = {
  name: "Hosted zone name",
  type: "Type",
  createdBy: "Created by",
  recordCount: "Record count",
  description: "Description",
  id: "Hosted zone ID",
};
const COLUMN_IDS = Object.keys(COLUMN_LABELS);

interface Preferences {
  pageSize: number;
  contentDisplay: CollectionPreferencesProps.ContentDisplayItem[];
}

const DEFAULT_PREFS: Preferences = {
  pageSize: 10,
  contentDisplay: COLUMN_IDS.map((id) => ({ id, visible: true })),
};

/** Stored preferences, repaired against the current column list. Browser storage may be unavailable. */
function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const stored = JSON.parse(raw) as Partial<Preferences>;
    const pageSize = PAGE_SIZES.includes(Number(stored.pageSize)) ? Number(stored.pageSize) : DEFAULT_PREFS.pageSize;
    const known = (stored.contentDisplay ?? []).filter((c) => COLUMN_IDS.includes(c.id));
    const missing = COLUMN_IDS.filter((id) => !known.some((c) => c.id === id)).map((id) => ({ id, visible: true }));
    return { pageSize, contentDisplay: [...known, ...missing] };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePreferences(prefs: Preferences): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable (private mode, blocked site data): preferences last for this visit only
  }
}

export default function HostedZonesPage() {
  const router = useRouter();
  const { notify } = useNotifications();
  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: "Hosted zones", href: ZONES_PATH },
  ]);

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [filteringText, setFilteringText] = useState("");
  const [search, setSearch] = useState("");
  const [typeOption, setTypeOption] = useState<SelectProps.Option>(TYPE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Page<HostedZone> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HostedZone[]>([]);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const requestId = useRef(0);
  const searchRef = useRef("");

  const typeFilter = typeOption.value ?? "";
  const selectedZone = selected[0] ?? null;
  const isFiltered = search !== "" || typeFilter !== "";

  // Read preferences after mount so the server render and first client render match.
  useEffect(() => {
    setPrefs(loadPreferences());
    setPrefsReady(true);
  }, []);

  // Debounce the search box; a new search starts again from page 1.
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
    listHostedZones({ search, type: typeFilter, page, page_size: prefs.pageSize })
      .then((res) => {
        if (id !== requestId.current) return; // a newer request is in flight
        const lastPage = Math.max(1, Math.ceil(res.total / prefs.pageSize));
        if (page > lastPage) {
          setPage(lastPage); // e.g. the last zone on this page was deleted
          return;
        }
        setData(res);
        // Keep the selection only if the zone is still on this page, using the fresh copy.
        setSelected((sel) => res.items.filter((z) => sel.some((s) => s.id === z.id)));
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        if (err instanceof ApiError && err.status === 401) return; // api.ts redirects to /login
        notify({
          type: "error",
          header: "Failed to load hosted zones",
          content: err instanceof ApiError ? err.message : "Unexpected error.",
        });
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [prefsReady, search, typeFilter, page, prefs.pageSize, reloadKey, notify]);

  const openZone = (zone: HostedZone) => router.push(`${ZONES_PATH}/${zone.id}`);

  const clearFilters = () => {
    setFilteringText("");
    searchRef.current = "";
    setSearch("");
    setTypeOption(TYPE_OPTIONS[0]);
    setPage(1);
  };

  const columns = useMemo<TableProps.ColumnDefinition<HostedZone>[]>(
    () => [
      {
        id: "name",
        header: COLUMN_LABELS.name,
        isRowHeader: true,
        cell: (z) => (
          <Link
            href={`${ZONES_PATH}/${z.id}`}
            onFollow={(e) => {
              e.preventDefault();
              router.push(`${ZONES_PATH}/${z.id}`);
            }}
          >
            {displayZoneName(z.name)}
          </Link>
        ),
      },
      { id: "type", header: COLUMN_LABELS.type, cell: (z) => (z.is_private ? "Private" : "Public") },
      { id: "createdBy", header: COLUMN_LABELS.createdBy, cell: () => "Route 53" },
      { id: "recordCount", header: COLUMN_LABELS.recordCount, cell: (z) => z.record_count },
      { id: "description", header: COLUMN_LABELS.description, cell: (z) => z.comment || "-" },
      { id: "id", header: COLUMN_LABELS.id, cell: (z) => z.id },
    ],
    [router],
  );

  const total = data?.total ?? 0;
  const pagesCount = Math.max(1, Math.ceil(total / prefs.pageSize));

  return (
    <>
      <Table<HostedZone>
        variant="full-page"
        stickyHeader
        trackBy="id"
        items={data?.items ?? []}
        columnDefinitions={columns}
        columnDisplay={prefs.contentDisplay}
        loading={loading}
        loadingText="Loading hosted zones"
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        onRowClick={({ detail }) => setSelected([detail.item])}
        ariaLabels={{
          selectionGroupLabel: "Hosted zone selection",
          itemSelectionLabel: (_s, z) => displayZoneName(z.name),
          allItemsSelectionLabel: () => "Select all hosted zones",
        }}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={data ? `(${total})` : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  iconName="refresh"
                  ariaLabel="Refresh hosted zones"
                  disabled={loading}
                  onClick={() => setReloadKey((k) => k + 1)}
                />
                <Button disabled={!selectedZone} onClick={() => (selectedZone ? openZone(selectedZone) : undefined)}>
                  View details
                </Button>
                <Button
                  disabled={!selectedZone}
                  onClick={() => (selectedZone ? router.push(`${ZONES_PATH}/${selectedZone.id}/edit`) : undefined)}
                >
                  Edit
                </Button>
                <Button disabled={!selectedZone} onClick={() => setDeleteVisible(true)}>
                  Delete
                </Button>
                <Button variant="primary" onClick={() => router.push(`${ZONES_PATH}/create`)}>
                  Create hosted zone
                </Button>
              </SpaceBetween>
            }
          >
            Hosted zones
          </Header>
        }
        filter={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 280px", maxWidth: 520 }}>
              <TextFilter
                filteringText={filteringText}
                onChange={({ detail }) => setFilteringText(detail.filteringText)}
                filteringPlaceholder="Search hosted zones by name, description or ID"
                filteringAriaLabel="Filter hosted zones"
                countText={search !== "" && data ? `${total} ${total === 1 ? "match" : "matches"}` : undefined}
              />
            </div>
            <div style={{ flex: "0 1 220px" }}>
              <Select
                selectedOption={typeOption}
                onChange={({ detail }) => {
                  setTypeOption(detail.selectedOption);
                  setPage(1);
                }}
                options={TYPE_OPTIONS}
                ariaLabel="Filter by hosted zone type"
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
              const next: Preferences = {
                pageSize: detail.pageSize ?? prefs.pageSize,
                contentDisplay: detail.contentDisplay ? [...detail.contentDisplay] : prefs.contentDisplay,
              };
              setPrefs(next);
              savePreferences(next);
              setPage(1);
            }}
            pageSizePreference={{
              title: "Page size",
              options: PAGE_SIZES.map((v) => ({ value: v, label: `${v} hosted zones` })),
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
                  No hosted zones match the filter.
                </Box>
                <Button onClick={clearFilters}>Clear filter</Button>
              </SpaceBetween>
            </Box>
          ) : (
            <Box textAlign="center" color="inherit" padding={{ vertical: "l" }}>
              <SpaceBetween size="m">
                <Box variant="strong" color="inherit">
                  No hosted zones
                </Box>
                <Box variant="p" color="inherit">
                  You don&apos;t have any hosted zones yet.
                </Box>
                <Button onClick={() => router.push(`${ZONES_PATH}/create`)}>Create hosted zone</Button>
              </SpaceBetween>
            </Box>
          )
        }
      />
      <DeleteZoneModal
        zone={selectedZone}
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        onDeleted={() => {
          setSelected([]);
          setDeleteVisible(false);
          setReloadKey((k) => k + 1);
        }}
      />
    </>
  );
}
