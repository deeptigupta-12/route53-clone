"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Textarea from "@cloudscape-design/components/textarea";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { useBreadcrumbs, useNotifications } from "@/components/ConsoleContext";
import { ApiError, updateHostedZone } from "@/lib/api";
import { displayZoneName } from "@/lib/format";
import { regionLabel } from "@/lib/regions";
import { useZone } from "@/lib/useZone";

const ZONES_PATH = "/route53/hosted-zones";
const MAX_COMMENT = 256;

function EditHostedZone() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const fromDetails = useSearchParams().get("from") === "details";
  const { notify } = useNotifications();
  const { zone, error, loading } = useZone(id);

  const [comment, setComment] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const name = zone ? displayZoneName(zone.name) : id;
  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: "Hosted zones", href: ZONES_PATH },
    { text: name, href: `${ZONES_PATH}/${id}` },
    { text: "Edit hosted zone", href: `${ZONES_PATH}/${id}/edit` },
  ]);

  useEffect(() => {
    if (zone) setComment(zone.comment);
  }, [zone]);

  const goBack = () => router.push(fromDetails ? `${ZONES_PATH}/${id}` : ZONES_PATH);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!zone || saving) return;
    if (comment.length > MAX_COMMENT) {
      setFieldError(`The description can have up to ${MAX_COMMENT} characters.`);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await updateHostedZone(zone.id, { comment: comment.trim() });
      notify({ type: "success", content: `Hosted zone ${name} was updated.` });
      goBack();
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.message.startsWith("comment:")) {
        setFieldError(err.message.replace(/^comment:\s*/, ""));
      } else {
        setFormError(err instanceof ApiError ? err.message : "Unexpected error. Try again.");
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
        <Header variant="h1">Edit hosted zone</Header>
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
          <Header variant="h1" description="You can change only the description of a hosted zone.">
            Edit hosted zone
          </Header>
        }
        errorText={formError || undefined}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={goBack} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={saving}>
              Save changes
            </Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
          <SpaceBetween size="l">
            <FormField label="Domain name" description="The domain name can't be changed after the hosted zone is created.">
              <Input value={name} disabled ariaLabel="Domain name" />
            </FormField>
            <FormField
              label={
                <span>
                  Description - <i>optional</i>
                </span>
              }
              description="This value lets you distinguish hosted zones that have the same name."
              constraintText={`The description can have up to ${MAX_COMMENT} characters. ${comment.length}/${MAX_COMMENT}`}
              errorText={fieldError || undefined}
            >
              <Textarea
                value={comment}
                onChange={({ detail }) => {
                  setComment(detail.value);
                  setFieldError("");
                }}
                ariaLabel="Description"
                rows={3}
                autoFocus
              />
            </FormField>
            <FormField label="Type">
              <Input value={zone.is_private ? "Private hosted zone" : "Public hosted zone"} disabled ariaLabel="Type" />
            </FormField>
            {zone.is_private ? (
              <SpaceBetween size="l">
                <FormField label="Region">
                  <Input value={regionLabel(zone.vpc_region)} disabled ariaLabel="Region" />
                </FormField>
                <FormField label="VPC ID">
                  <Input value={zone.vpc_id ?? "-"} disabled ariaLabel="VPC ID" />
                </FormField>
              </SpaceBetween>
            ) : null}
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}

export default function EditHostedZonePage() {
  return (
    <Suspense fallback={null}>
      <EditHostedZone />
    </Suspense>
  );
}
