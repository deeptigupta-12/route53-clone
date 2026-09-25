"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useBreadcrumbs, useNotifications } from "@/components/ConsoleContext";
import RecordFormFields from "@/components/RecordForm";
import { ApiError, createRecords } from "@/lib/api";
import { displayZoneName } from "@/lib/format";
import {
  draftToInput,
  mapRecordError,
  newDraft,
  validateBatch,
  validateDraft,
  type DraftErrors,
  type RecordDraft,
} from "@/lib/records";
import { useZone } from "@/lib/useZone";

const ZONES_PATH = "/route53/hosted-zones";

export default function CreateRecordPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { notify } = useNotifications();
  const { zone, error, loading } = useZone(id);

  const [drafts, setDrafts] = useState<RecordDraft[]>(() => [newDraft()]);
  const [errors, setErrors] = useState<Record<string, DraftErrors>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const zoneLabel = zone ? displayZoneName(zone.name) : id;
  const zonePath = `${ZONES_PATH}/${id}`;
  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: "Hosted zones", href: ZONES_PATH },
    { text: zoneLabel, href: zonePath },
    { text: "Create record", href: `${zonePath}/create-record` },
  ]);

  const updateDraft = (key: string, patch: Partial<RecordDraft>) => {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    // Editing a field clears that field's error.
    setErrors((all) => {
      const current = all[key];
      if (!current) return all;
      const next = { ...current };
      for (const field of Object.keys(patch) as (keyof DraftErrors)[]) delete next[field];
      if (patch.routingPolicy !== undefined) delete next.setIdentifier;
      return { ...all, [key]: next };
    });
  };

  const addDraft = () => setDrafts((list) => [...list, newDraft()]);
  const removeDraft = (key: string) => {
    setDrafts((list) => list.filter((d) => d.key !== key));
    setErrors((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
  };

  const scrollToFirstError = () => {
    requestAnimationFrame(() => {
      document.querySelector('[id$="-error"], [class*="awsui_error"]')?.scrollIntoView({ block: "center" });
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!zone || submitting) return;
    setFormError("");

    const batchErrors = validateBatch(drafts, zone.name);
    const found: Record<string, DraftErrors> = {};
    drafts.forEach((d, i) => {
      const e = { ...batchErrors[i], ...validateDraft(d, zone.name, { checkName: true }) };
      if (Object.keys(e).length > 0) found[d.key] = e;
    });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      scrollToFirstError();
      return;
    }

    setSubmitting(true);
    try {
      const created = await createRecords(zone.id, drafts.map(draftToInput));
      const n = created.length;
      notify({
        type: "success",
        content: `Successfully created ${n} ${n === 1 ? "record" : "records"} in ${displayZoneName(zone.name)}.`,
      });
      router.push(zonePath);
    } catch (err) {
      setSubmitting(false);
      if (!(err instanceof ApiError)) {
        setFormError("Unexpected error. No records were created.");
        return;
      }
      if (err.status === 401) return; // api.ts redirects to /login
      const mapped = mapRecordError(err, drafts, zone.name);
      if (mapped) {
        const key = drafts[mapped.index].key;
        setErrors({ [key]: { [mapped.field]: mapped.message } });
        setFormError(
          drafts.length > 1 ? `No records were created. Fix the error in record ${mapped.index + 1} and try again.` : "",
        );
        scrollToFirstError();
      } else {
        setFormError(`No records were created: ${err.message}`);
      }
    }
  };

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
        <Header variant="h1">Create record</Header>
        <Alert type="error" header="Hosted zone not found">
          {error?.message ?? "The hosted zone could not be loaded."}
        </Alert>
        <Button onClick={() => router.push(ZONES_PATH)}>Back to hosted zones</Button>
      </SpaceBetween>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Form
        header={
          <Header
            variant="h1"
            description={`Records define how you want to route traffic for ${zoneLabel} and its subdomains. All records are created together: if one is invalid, none are created.`}
          >
            Create record
          </Header>
        }
        errorText={formError || undefined}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => router.push(zonePath)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={submitting}>
              {drafts.length > 1 ? "Create records" : "Create record"}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {drafts.map((d, i) => (
            <Container
              key={d.key}
              header={
                <Header
                  variant="h2"
                  actions={
                    drafts.length > 1 ? (
                      <Button formAction="none" onClick={() => removeDraft(d.key)} disabled={submitting}>
                        Remove
                      </Button>
                    ) : undefined
                  }
                >
                  {`Record ${i + 1}`}
                </Header>
              }
            >
              <RecordFormFields
                draft={d}
                onChange={(patch) => updateDraft(d.key, patch)}
                errors={errors[d.key] ?? {}}
                zoneName={zone.name}
                mode="create"
                disabled={submitting}
              />
            </Container>
          ))}
          <Button formAction="none" iconName="add-plus" onClick={addDraft} disabled={submitting}>
            Add another record
          </Button>
        </SpaceBetween>
      </Form>
    </form>
  );
}
