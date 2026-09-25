"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useEffect, useState } from "react";

import { useNotifications } from "@/components/ConsoleContext";
import { ApiError, bulkDeleteRecords } from "@/lib/api";
import { displayRecordName } from "@/lib/records";
import type { DnsRecord } from "@/lib/types";

interface Props {
  zoneId: string;
  records: DnsRecord[];
  visible: boolean;
  onDismiss: () => void;
  onDeleted: () => void;
}

export default function DeleteRecordsModal({ zoneId, records, visible, onDismiss, onDeleted }: Props) {
  const { notify } = useNotifications();
  const [deleting, setDeleting] = useState(false);
  const n = records.length;
  const noun = n === 1 ? "record" : "records";

  useEffect(() => {
    if (visible) setDeleting(false);
  }, [visible]);

  const confirm = async () => {
    setDeleting(true);
    try {
      const res = await bulkDeleteRecords(
        zoneId,
        records.map((r) => r.id),
      );
      notify({ type: "success", content: `Deleted ${res.deleted} ${res.deleted === 1 ? "record" : "records"}.` });
      onDeleted();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        notify({
          type: "error",
          header: `Failed to delete ${noun}`,
          content: err instanceof ApiError ? err.message : "Unexpected error.",
        });
      }
    } finally {
      setDeleting(false);
      onDismiss();
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={`Delete ${noun}`}
      closeAriaLabel="Close modal"
      size="large"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void confirm()} loading={deleting} disabled={n === 0}>
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box variant="span">{`Delete ${n} ${noun} from this hosted zone?`}</Box>
        <Alert type="warning" statusIconAriaLabel="Warning">
          Deleting records can&apos;t be undone. DNS queries for these records will stop being answered.
        </Alert>
        <Table
          variant="embedded"
          items={records}
          trackBy="id"
          ariaLabels={{ tableLabel: `Records to delete` }}
          columnDefinitions={[
            { id: "name", header: "Record name", cell: (r) => displayRecordName(r.name) },
            { id: "type", header: "Type", cell: (r) => r.type },
            {
              id: "value",
              header: "Value/Route traffic to",
              cell: (r) => (r.alias_target ? displayRecordName(r.alias_target.dns_name) : r.values.join(", ")),
            },
          ]}
        />
      </SpaceBetween>
    </Modal>
  );
}
