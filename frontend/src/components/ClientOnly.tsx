"use client";

import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Render children only in the browser, after mount.
 *
 * Several Cloudscape components compute classes from the live DOM (e.g. the table's sticky
 * scrollbar checks the browser's scrollbar size). The server can't know those values, so a
 * server-rendered tree doesn't match the client and React reports a hydration error. The server
 * and the first client render both show just this spinner, which always match.
 */
export default function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Box textAlign="center" padding={{ vertical: "xxxl" }}>
        <Spinner size="large" />
      </Box>
    );
  }
  return <>{children}</>;
}
