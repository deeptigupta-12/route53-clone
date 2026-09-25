"use client";

import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Tiles from "@cloudscape-design/components/tiles";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useBreadcrumbs, useNotifications } from "@/components/ConsoleContext";
import { ApiError, createHostedZone } from "@/lib/api";
import { displayZoneName } from "@/lib/format";
import { AWS_REGIONS } from "@/lib/regions";

const ZONES_PATH = "/route53/hosted-zones";
const MAX_COMMENT = 256;

type Field = "name" | "comment" | "region" | "vpc";
type FieldErrors = Partial<Record<Field, string>>;

const REGION_OPTIONS: SelectProps.Option[] = AWS_REGIONS.map((r) => ({
  value: r.value,
  label: r.label,
  description: r.value,
}));

const INPUT_FIELDS: Record<string, Field> = { name: "name", comment: "comment", vpc_id: "vpc", vpc_region: "region" };

/** Put backend errors under the field they belong to; anything else goes on the form. */
function mapApiError(err: ApiError): { fields: FieldErrors; form: string } {
  switch (err.code) {
    case "InvalidDomainName":
    case "HostedZoneAlreadyExists":
      return { fields: { name: err.message }, form: "" };
    case "InvalidVPCId":
      return { fields: { vpc: err.message }, form: "" };
    case "InvalidInput": {
      const m = /^(\w+):\s*(.*)$/.exec(err.message);
      const field = m ? INPUT_FIELDS[m[1]] : undefined;
      return field && m ? { fields: { [field]: m[2] }, form: "" } : { fields: {}, form: err.message };
    }
    default:
      return { fields: {}, form: err.message };
  }
}

export default function CreateHostedZonePage() {
  const router = useRouter();
  const { notify } = useNotifications();
  useBreadcrumbs([
    { text: "Route 53", href: "/route53/dashboard" },
    { text: "Hosted zones", href: ZONES_PATH },
    { text: "Create hosted zone", href: `${ZONES_PATH}/create` },
  ]);

  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [zoneType, setZoneType] = useState<"public" | "private">("public");
  const [region, setRegion] = useState<SelectProps.Option | null>(null);
  const [vpcId, setVpcId] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isPrivate = zoneType === "private";
  const clearError = (field: Field) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!name.trim()) e.name = "Enter a domain name.";
    if (comment.length > MAX_COMMENT) e.comment = `The description can have up to ${MAX_COMMENT} characters.`;
    if (isPrivate && !region) e.region = "Choose a Region.";
    if (isPrivate && !vpcId.trim()) e.vpc = "Enter a VPC ID.";
    return e;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError("");
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    try {
      const zone = await createHostedZone({
        name: name.trim(),
        comment: comment.trim(),
        is_private: isPrivate,
        vpc_id: isPrivate ? vpcId.trim() : null,
        vpc_region: isPrivate ? (region?.value ?? null) : null,
      });
      notify({ type: "success", content: `Hosted zone ${displayZoneName(zone.name)} was created successfully.` });
      router.push(`${ZONES_PATH}/${zone.id}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) {
        if (err.status === 401) return; // api.ts redirects to /login
        const mapped = mapApiError(err);
        setErrors(mapped.fields);
        setFormError(mapped.form);
      } else {
        setFormError("Unexpected error. Try again.");
      }
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Form
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains."
          >
            Create hosted zone
          </Header>
        }
        errorText={formError || undefined}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => router.push(ZONES_PATH)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={submitting}>
              Create hosted zone
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
            <SpaceBetween size="l">
              <FormField
                label="Domain name"
                description="This is the name of the domain that you want to route traffic for."
                constraintText="Valid characters: a-z, 0-9, - (hyphen) and _ (underscore), with labels separated by periods."
                errorText={errors.name}
              >
                <Input
                  value={name}
                  onChange={({ detail }) => {
                    setName(detail.value);
                    clearError("name");
                  }}
                  placeholder="example.com"
                  ariaLabel="Domain name"
                  autoFocus
                />
              </FormField>
              <FormField
                label={
                  <span>
                    Description - <i>optional</i>
                  </span>
                }
                description="This value lets you distinguish hosted zones that have the same name."
                constraintText={`The description can have up to ${MAX_COMMENT} characters. ${comment.length}/${MAX_COMMENT}`}
                errorText={errors.comment}
              >
                <Textarea
                  value={comment}
                  onChange={({ detail }) => {
                    setComment(detail.value);
                    clearError("comment");
                  }}
                  placeholder="The hosted zone is used for..."
                  ariaLabel="Description"
                  rows={3}
                />
              </FormField>
              <FormField label="Type" description="The type indicates whether you want to route traffic on the internet or in an Amazon VPC.">
                <Tiles
                  value={zoneType}
                  onChange={({ detail }) => setZoneType(detail.value === "private" ? "private" : "public")}
                  ariaLabel="Hosted zone type"
                  items={[
                    {
                      value: "public",
                      label: "Public hosted zone",
                      description: "A public hosted zone determines how traffic is routed on the internet.",
                    },
                    {
                      value: "private",
                      label: "Private hosted zone",
                      description: "A private hosted zone determines how traffic is routed within an Amazon VPC.",
                    },
                  ]}
                />
              </FormField>
            </SpaceBetween>
          </Container>

          {isPrivate ? (
            <Container
              header={
                <Header
                  variant="h2"
                  description="To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs."
                >
                  VPCs to associate with the hosted zone
                </Header>
              }
            >
              <SpaceBetween size="l">
                <FormField label="Region" errorText={errors.region}>
                  <Select
                    selectedOption={region}
                    onChange={({ detail }) => {
                      setRegion(detail.selectedOption);
                      clearError("region");
                    }}
                    options={REGION_OPTIONS}
                    placeholder="Choose Region"
                    filteringType="auto"
                  />
                </FormField>
                <FormField label="VPC ID" errorText={errors.vpc}>
                  <Input
                    value={vpcId}
                    onChange={({ detail }) => {
                      setVpcId(detail.value);
                      clearError("vpc");
                    }}
                    placeholder="vpc-0123456789abcdef0"
                    ariaLabel="VPC ID"
                  />
                </FormField>
              </SpaceBetween>
            </Container>
          ) : null}
        </SpaceBetween>
      </Form>
    </form>
  );
}
