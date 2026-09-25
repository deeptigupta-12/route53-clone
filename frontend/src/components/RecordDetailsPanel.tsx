"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useEffect, useState, type FormEvent } from "react";

import { useNotifications } from "@/components/ConsoleContext";
import RecordFormFields from "@/components/RecordForm";
import { ApiError, updateRecord } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  ROUTING_POLICY_LABELS,
  displayRecordName,
  isDefaultRecord,
  mapRecordError,
  recordToDraft,
  splitValues,
  validateDraft,
  type DraftErrors,
  type RecordDraft,
} from "@/lib/records";
import type { DnsRecord, RecordUpdate } from "@/lib/types";

interface Props {
  record: DnsRecord;
  zoneName: string;
  onUpdated: (rec: DnsRecord) => void;
}

const lines = (values: string[]) => (
  <div>
    {values.map((v, i) => (
      <div key={i}>{v}</div>
    ))}
  </div>
);

/** Split panel body: record details, with in-place editing of TTL, values and routing. */
export default function RecordDetailsPanel({ record, zoneName, onUpdated }: Props) {
  const { notify } = useNotifications();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecordDraft>(() => recordToDraft(record, zoneName));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDefault = isDefaultRecord(record, zoneName);
  const isAlias = record.alias_target !== null;
  const label = `${displayRecordName(record.name)} ${record.type}`;

  // A different (or refreshed) record resets the panel to view mode.
  useEffect(() => {
    setEditing(false);
    setDraft(recordToDraft(record, zoneName));
    setErrors({});
    setFormError("");
  }, [record, zoneName]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const found = validateDraft(draft, zoneName, { checkName: false, isAlias });
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length > 0) return;

    const body: RecordUpdate = {};
    const ttl = Number(draft.ttl);
    if (ttl !== record.ttl) body.ttl = ttl;
    const values = splitValues(draft.values);
    if (!isAlias && values.join("\n") !== record.values.join("\n")) body.values = values;
    if (!isDefault && draft.routingPolicy !== record.routing_policy) body.routing_policy = draft.routingPolicy;
    const setId = draft.routingPolicy === "simple" ? "" : draft.setIdentifier.trim();
    if (!isDefault && setId !== record.set_identifier) body.set_identifier = setId;
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateRecord(record.zone_id, record.id, body);
      notify({ type: "success", content: `Record ${label} was updated.` });
      onUpdated(updated);
    } catch (err) {
      if (!(err instanceof ApiError)) setFormError("Unexpected error. The record wasn't updated.");
      else if (err.status !== 401) {
        const mapped = mapRecordError(err, [draft], zoneName);
        if (mapped) setErrors({ [mapped.field]: mapped.message });
        else setFormError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={(e) => void save(e)} noValidate>
        <SpaceBetween size="l">
          {formError ? (
            <Alert type="error" header="The record wasn't updated">
              {formError}
            </Alert>
          ) : null}
          <RecordFormFields
            draft={draft}
            onChange={(patch) => {
              setDraft((d) => ({ ...d, ...patch }));
              setErrors((all) => {
                const next = { ...all };
                for (const k of Object.keys(patch) as (keyof DraftErrors)[]) delete next[k];
                return next;
              });
            }}
            errors={errors}
            zoneName={zoneName}
            mode="edit"
            isDefault={isDefault}
            aliasTarget={record.alias_target}
            disabled={saving}
          />
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button formAction="none" variant="link" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" formAction="submit" loading={saving}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </form>
    );
  }

  return (
    <SpaceBetween size="l">
      <Box float="right">
        <Button onClick={() => setEditing(true)}>Edit</Button>
      </Box>
      <KeyValuePairs
        columns={1}
        items={[
          { label: "Record name", value: displayRecordName(record.name) },
          { label: "Record type", value: record.type },
          { label: "Routing policy", value: ROUTING_POLICY_LABELS[record.routing_policy] },
          { label: "Differentiator", value: record.set_identifier || "-" },
          { label: "Alias", value: isAlias ? "Yes" : "No" },
          {
            label: "Value/Route traffic to",
            value: record.alias_target ? displayRecordName(record.alias_target.dns_name) : lines(record.values),
          },
          { label: "TTL (seconds)", value: isAlias ? "-" : record.ttl },
          { label: "Created", value: formatDateTime(record.created_at) },
          { label: "Last updated", value: formatDateTime(record.updated_at) },
        ]}
      />
    </SpaceBetween>
  );
}
