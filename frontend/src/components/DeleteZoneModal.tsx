"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { useNotifications } from "@/components/ConsoleContext";
import { ApiError, deleteHostedZone } from "@/lib/api";
import { displayZoneName } from "@/lib/format";
import type { HostedZone } from "@/lib/types";

const CONFIRM_WORD = "delete";

interface Props {
  zone: HostedZone | null;
  visible: boolean;
  onDismiss: () => void;
  onDeleted: (zone: HostedZone) => void;
}

export default function DeleteZoneModal({ zone, visible, onDismiss, onDeleted }: Props) {
  const router = useRouter();
  const { notify, dismiss } = useNotifications();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (visible) {
      setConfirmText("");
      setDeleting(false);
    }
  }, [visible]);

  const name = zone ? displayZoneName(zone.name) : "";
  const canDelete = confirmText === CONFIRM_WORD && !deleting;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!zone || !canDelete) return;
    setDeleting(true);
    try {
      await deleteHostedZone(zone.id);
      notify({ type: "success", content: `Hosted zone ${name} was deleted.` });
      onDeleted(zone);
    } catch (err) {
      if (err instanceof ApiError && err.code === "HostedZoneNotEmpty") {
        const id = notify({
          type: "error",
          header: `Cannot delete hosted zone ${name}`,
          content: `${err.message} Delete all records except the default NS and SOA records, then try again.`,
          action: (
            <Button
              onClick={() => {
                dismiss(id);
                router.push(`/route53/hosted-zones/${zone.id}`);
              }}
            >
              View records
            </Button>
          ),
        });
      } else if (!(err instanceof ApiError && err.status === 401)) {
        notify({
          type: "error",
          header: `Failed to delete hosted zone ${name}`,
          content: err instanceof ApiError ? err.message : "Unexpected error.",
        });
      }
    } finally {
      setDeleting(false);
    }
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Delete hosted zone"
      closeAriaLabel="Close modal"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!canDelete} loading={deleting}>
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <form onSubmit={(e) => void submit(e)}>
        <SpaceBetween size="m">
          <Box variant="span">
            Delete hosted zone{" "}
            <Box variant="span" fontWeight="bold">
              {name}
            </Box>
            ?
          </Box>
          <Alert type="warning" statusIconAriaLabel="Warning">
            Deleting a hosted zone can&apos;t be undone. If the domain is still in use, DNS queries for it will stop
            being answered by Route 53.
          </Alert>
          <FormField
            label={
              <span>
                To confirm deletion, type <i>{CONFIRM_WORD}</i> in the field.
              </span>
            }
          >
            <Input
              value={confirmText}
              onChange={({ detail }) => setConfirmText(detail.value)}
              placeholder={CONFIRM_WORD}
              ariaLabel="Type delete to confirm"
              disabled={deleting}
              autoFocus
            />
          </FormField>
        </SpaceBetween>
      </form>
    </Modal>
  );
}
