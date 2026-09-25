"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";

import { displayZoneName } from "@/lib/format";
import {
  RECORD_TYPE_INFO,
  ROUTING_POLICY_OPTIONS,
  type DraftErrors,
  type DraftType,
  type RecordDraft,
} from "@/lib/records";
import { RECORD_TYPES, type AliasTarget, type RoutingPolicy } from "@/lib/types";

const TTL_PRESETS = [
  { label: "1m", seconds: 60, aria: "Set TTL to 1 minute" },
  { label: "1h", seconds: 3600, aria: "Set TTL to 1 hour" },
  { label: "1d", seconds: 86400, aria: "Set TTL to 1 day" },
];

const typeOption = (t: DraftType): SelectProps.Option => ({
  value: t,
  label: t,
  description: RECORD_TYPE_INFO[t].description,
});
const CREATE_TYPE_OPTIONS = RECORD_TYPES.map(typeOption);

interface Props {
  draft: RecordDraft;
  onChange: (patch: Partial<RecordDraft>) => void;
  errors: DraftErrors;
  zoneName: string;
  mode: "create" | "edit";
  /** The zone's default NS/SOA record: only TTL and value can change. */
  isDefault?: boolean;
  aliasTarget?: AliasTarget | null;
  disabled?: boolean;
}

/** Record fields used by the Create record page and the edit split panel. */
export default function RecordFormFields({
  draft,
  onChange,
  errors,
  zoneName,
  mode,
  isDefault = false,
  aliasTarget = null,
  disabled = false,
}: Props) {
  const editing = mode === "edit";
  const info = RECORD_TYPE_INFO[draft.type];
  const typeOptions = editing ? [typeOption(draft.type)] : CREATE_TYPE_OPTIONS;
  const selectedRouting = ROUTING_POLICY_OPTIONS.find((o) => o.value === draft.routingPolicy) ?? ROUTING_POLICY_OPTIONS[0];

  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={editing ? 1 : 2}>
        <FormField
          label="Record name"
          description={editing ? "The record name can't be changed." : "Keep blank to create a record for the root domain."}
          errorText={errors.name}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <Input
                value={draft.name}
                onChange={({ detail }) => onChange({ name: detail.value })}
                placeholder={editing ? "" : "subdomain"}
                disabled={editing || disabled}
                ariaLabel="Record name"
              />
            </div>
            <Box variant="span" color="text-body-secondary">
              {draft.name.trim() === "" && editing ? displayZoneName(zoneName) : `.${displayZoneName(zoneName)}`}
            </Box>
          </div>
        </FormField>
        <FormField
          label="Record type"
          description={editing ? "The record type can't be changed." : undefined}
          errorText={errors.type}
        >
          <Select
            selectedOption={typeOption(draft.type)}
            onChange={({ detail }) => onChange({ type: (detail.selectedOption.value ?? "A") as DraftType })}
            options={typeOptions}
            triggerVariant="option"
            disabled={editing || disabled}
            ariaLabel="Record type"
          />
        </FormField>
      </ColumnLayout>

      {aliasTarget ? (
        <FormField label="Route traffic to" description="Alias records can't be edited in this console.">
          <Input value={aliasTarget.dns_name} disabled ariaLabel="Alias target" />
        </FormField>
      ) : (
        <FormField
          label="Value"
          description="Enter multiple values on separate lines."
          constraintText={`Example: ${info.placeholder}`}
          errorText={errors.values}
        >
          <Textarea
            value={draft.values}
            onChange={({ detail }) => onChange({ values: detail.value })}
            placeholder={info.placeholder}
            rows={3}
            disabled={disabled}
            ariaLabel="Value"
          />
        </FormField>
      )}

      <ColumnLayout columns={editing ? 1 : 2}>
        <FormField
          label="TTL (seconds)"
          constraintText="Recommended values: 60 to 172800 (two days)"
          errorText={errors.ttl}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px", minWidth: 100 }}>
              <Input
                type="number"
                inputMode="numeric"
                value={draft.ttl}
                onChange={({ detail }) => onChange({ ttl: detail.value })}
                disabled={disabled}
                ariaLabel="TTL (seconds)"
              />
            </div>
            <SpaceBetween direction="horizontal" size="xxs">
              {TTL_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  formAction="none"
                  onClick={() => onChange({ ttl: String(p.seconds) })}
                  ariaLabel={p.aria}
                  disabled={disabled}
                >
                  {p.label}
                </Button>
              ))}
            </SpaceBetween>
          </div>
        </FormField>
        <FormField
          label="Routing policy"
          description={isDefault ? "The routing policy of a default record can't be changed." : undefined}
          errorText={errors.routingPolicy}
        >
          <Select
            selectedOption={selectedRouting}
            onChange={({ detail }) => onChange({ routingPolicy: (detail.selectedOption.value ?? "simple") as RoutingPolicy })}
            options={ROUTING_POLICY_OPTIONS}
            disabled={isDefault || disabled}
            ariaLabel="Routing policy"
          />
        </FormField>
      </ColumnLayout>

      {draft.routingPolicy !== "simple" ? (
        <FormField
          label="Record ID"
          description="Enter a value that uniquely identifies this record among records with the same name and type."
          errorText={errors.setIdentifier}
        >
          <Input
            value={draft.setIdentifier}
            onChange={({ detail }) => onChange({ setIdentifier: detail.value })}
            placeholder="US East"
            disabled={isDefault || disabled}
            ariaLabel="Record ID"
          />
        </FormField>
      ) : null}
    </SpaceBetween>
  );
}
