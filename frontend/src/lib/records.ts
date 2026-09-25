// Record helpers shared by the create page, the records table and the edit panel.
// validateDraft mirrors backend/app/schemas.py so most mistakes are caught before a request.

import { ApiError } from "./api";
import { ROUTING_POLICIES, type DnsRecord, type RecordInput, type RecordType, type RoutingPolicy } from "./types";

export type DraftType = RecordType | "SOA";

export const RECORD_TYPE_INFO: Record<DraftType, { description: string; placeholder: string }> = {
  A: { description: "Routes traffic to an IPv4 address and some AWS resources", placeholder: "192.0.2.235" },
  AAAA: { description: "Routes traffic to an IPv6 address and some AWS resources", placeholder: "2001:db8:85a3::8a2e:370:7334" },
  CNAME: { description: "Routes traffic to another domain name and to some AWS resources", placeholder: "www.example.com" },
  MX: { description: "Specifies mail servers", placeholder: "10 mail.example.com" },
  TXT: { description: "Used to verify email senders and for application-specific values", placeholder: '"Sample text entries"' },
  PTR: { description: "Maps an IP address to a domain name", placeholder: "hostname.example.com" },
  SRV: { description: "Application-specific values that identify servers", placeholder: "1 10 5269 xmpp-server.example.com" },
  NS: { description: "Name servers for a hosted zone", placeholder: "ns-1.awsdns-01.org" },
  CAA: { description: "Restricts CAs that can create SSL/TLS certificates for the domain", placeholder: '0 issue "caa.example.com"' },
  SOA: { description: "Start of authority record", placeholder: "ns-2048.awsdns-64.net. hostmaster.awsdns.com. 1 1 1 1 60" },
};

export const ROUTING_POLICY_LABELS: Record<RoutingPolicy, string> = {
  simple: "Simple routing",
  weighted: "Weighted",
  latency: "Latency",
  failover: "Failover",
  geolocation: "Geolocation",
  multivalue: "Multivalue answer",
};

export const ROUTING_POLICY_DESCRIPTIONS: Record<RoutingPolicy, string> = {
  simple: "Route traffic to a single resource",
  weighted: "Route traffic to multiple resources in proportions that you specify",
  latency: "Route traffic to the Region that provides the lowest latency",
  failover: "Configure active-passive failover",
  geolocation: "Route traffic based on the location of your users",
  multivalue: "Respond to DNS queries with up to eight healthy records selected at random",
};

export const ROUTING_POLICY_OPTIONS = ROUTING_POLICIES.map((p) => ({
  value: p,
  label: ROUTING_POLICY_LABELS[p],
  description: ROUTING_POLICY_DESCRIPTIONS[p],
}));

export const MAX_TTL = 2147483647;

// ---------- names ----------

const LABEL_RE = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/;

/** Lowercased FQDN with a trailing dot, or null if the name isn't valid. */
function normalizeDomain(value: string, allowWildcard: boolean): string | null {
  let name = value.trim().toLowerCase();
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (!name || name.length > 253) return null;
  const labels = name.split(".");
  const ok = labels.every((label, i) => (label === "*" && allowWildcard && i === 0) || LABEL_RE.test(label));
  return ok ? `${name}.` : null;
}

/** The FQDN the backend will store for a record name typed next to the zone suffix. */
export function toFqdn(name: string, zoneName: string): { fqdn: string } | { error: string } {
  const n = name.trim().toLowerCase();
  const bare = zoneName.slice(0, -1);
  let candidate: string;
  if (n === "" || n === "@") return { fqdn: zoneName };
  if (n.endsWith(".")) candidate = n;
  else if (n === bare || n.endsWith(`.${bare}`)) candidate = `${n}.`;
  else candidate = `${n}.${zoneName}`;
  const fqdn = normalizeDomain(candidate, true);
  if (!fqdn) return { error: "Enter a valid record name: letters a-z, digits, hyphens and underscores, separated by periods." };
  if (fqdn !== zoneName && !fqdn.endsWith(`.${zoneName}`)) {
    return { error: `The record name must be in the ${bare} zone.` };
  }
  return { fqdn };
}

const fqdnOf = (name: string, zoneName: string): string | null => {
  const r = toFqdn(name, zoneName);
  return "fqdn" in r ? r.fqdn : null;
};

/** "www.example.com." in zone "example.com." -> "www"; the apex -> "". */
export function relativeName(fqdn: string, zoneName: string): string {
  if (fqdn === zoneName) return "";
  return fqdn.endsWith(`.${zoneName}`) ? fqdn.slice(0, -(zoneName.length + 1)) : fqdn;
}

export const displayRecordName = (fqdn: string): string => (fqdn.endsWith(".") ? fqdn.slice(0, -1) : fqdn);

export function isDefaultRecord(rec: DnsRecord, zoneName: string): boolean {
  return rec.name === zoneName && (rec.type === "NS" || rec.type === "SOA") && rec.set_identifier === "";
}

// ---------- drafts ----------

export interface RecordDraft {
  key: string;
  name: string;
  type: DraftType;
  ttl: string;
  values: string;
  routingPolicy: RoutingPolicy;
  setIdentifier: string;
}

export type DraftField = "name" | "type" | "values" | "ttl" | "routingPolicy" | "setIdentifier";
export type DraftErrors = Partial<Record<DraftField, string>>;

let draftCounter = 0;

export function newDraft(): RecordDraft {
  draftCounter += 1;
  return { key: `draft-${draftCounter}`, name: "", type: "A", ttl: "300", values: "", routingPolicy: "simple", setIdentifier: "" };
}

export function recordToDraft(rec: DnsRecord, zoneName: string): RecordDraft {
  return {
    key: `record-${rec.id}`,
    name: relativeName(rec.name, zoneName),
    type: rec.type,
    ttl: String(rec.ttl),
    values: rec.values.join("\n"),
    routingPolicy: rec.routing_policy,
    setIdentifier: rec.set_identifier,
  };
}

export const splitValues = (text: string): string[] =>
  text
    .split("\n")
    .map((v) => v.trim())
    .filter((v) => v !== "");

export function draftToInput(d: RecordDraft): RecordInput {
  return {
    name: d.name.trim(),
    type: d.type as RecordType,
    ttl: Number(d.ttl),
    values: splitValues(d.values),
    routing_policy: d.routingPolicy,
    set_identifier: d.routingPolicy === "simple" ? "" : d.setIdentifier.trim(),
  };
}

// ---------- validation ----------

const IPV4_OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_RE = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);

function isIPv6(v: string): boolean {
  if (!v.includes(":") || /[\s/[\]%]/.test(v)) return false;
  try {
    new URL(`http://[${v}]/`);
    return true;
  } catch {
    return false;
  }
}

const inRange = (s: string, lo: number, hi: number) => /^\d+$/.test(s) && Number(s) >= lo && Number(s) <= hi;
const isHost = (s: string) => normalizeDomain(s, false) !== null;

/** Error message for one value, or null when it's valid. */
function valueError(type: DraftType, v: string): string | null {
  const parts = v.split(/\s+/);
  switch (type) {
    case "A":
      return IPV4_RE.test(v) ? null : `'${v}' is not a valid IPv4 address. Example: 192.0.2.235`;
    case "AAAA":
      return isIPv6(v) ? null : `'${v}' is not a valid IPv6 address. Example: 2001:db8::1`;
    case "CNAME":
    case "NS":
    case "PTR":
      return isHost(v) ? null : `'${v}' is not a valid domain name.`;
    case "MX":
      return parts.length === 2 && inRange(parts[0], 0, 65535) && isHost(parts[1])
        ? null
        : `'${v}' is not a valid MX value. Use the format 'priority mail-server', e.g. 10 mail.example.com`;
    case "SRV":
      return parts.length === 4 && parts.slice(0, 3).every((p) => inRange(p, 0, 65535)) && isHost(parts[3])
        ? null
        : `'${v}' is not a valid SRV value. Use the format 'priority weight port target', e.g. 1 10 5269 xmpp.example.com`;
    case "CAA": {
      const m = /^(\d{1,3})\s+(issue|issuewild|iodef)\s+(".*")$/i.exec(v);
      return m && Number(m[1]) <= 255
        ? null
        : `'${v}' is not a valid CAA value. Use the format 'flags tag "value"', e.g. 0 issue "amazon.com"`;
    }
    case "TXT":
      return v.length >= 2 && v.startsWith('"') && v.endsWith('"')
        ? null
        : `Enclose each TXT value in quotation marks, e.g. "v=spf1 -all". Invalid value: ${v}`;
    case "SOA":
      return parts.length === 7 && isHost(parts[0]) && isHost(parts[1]) && parts.slice(2).every((p) => inRange(p, 0, 4294967295))
        ? null
        : "An SOA value has 7 fields: mname rname serial refresh retry expire minimum.";
  }
}

export function validateDraft(d: RecordDraft, zoneName: string, opts: { checkName: boolean; isAlias?: boolean }): DraftErrors {
  const errors: DraftErrors = {};
  if (opts.checkName) {
    const r = toFqdn(d.name, zoneName);
    if ("error" in r) errors.name = r.error;
    else if (d.type === "CNAME" && r.fqdn === zoneName) {
      errors.name = "You can't create a CNAME record for the root domain (the zone apex). Enter a subdomain.";
    }
  }
  if (!opts.isAlias) {
    const values = splitValues(d.values);
    if (values.length === 0) errors.values = "Enter at least one value.";
    else if ((d.type === "CNAME" || d.type === "SOA") && values.length > 1) {
      errors.values = `A ${d.type} record can have only one value.`;
    } else {
      const firstBad = values.map((v) => valueError(d.type, v)).find((e) => e !== null);
      if (firstBad) errors.values = firstBad;
      else if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) errors.values = "Remove duplicate values.";
    }
  }
  if (!/^\d+$/.test(d.ttl.trim()) || Number(d.ttl) > MAX_TTL) {
    errors.ttl = `Enter a TTL from 0 to ${MAX_TTL} seconds.`;
  }
  if (d.routingPolicy !== "simple" && !d.setIdentifier.trim()) {
    errors.setIdentifier = `Enter a record ID. It's required for ${ROUTING_POLICY_LABELS[d.routingPolicy].toLowerCase()} routing.`;
  }
  return errors;
}

/** Conflicts between records in the same batch (the backend checks existing records). */
export function validateBatch(drafts: RecordDraft[], zoneName: string): DraftErrors[] {
  const errors: DraftErrors[] = drafts.map(() => ({}));
  const fqdns = drafts.map((d) => fqdnOf(d.name, zoneName));
  drafts.forEach((b, j) => {
    for (let i = 0; i < j; i++) {
      const a = drafts[i];
      if (!fqdns[i] || fqdns[i] !== fqdns[j]) continue;
      const setA = a.routingPolicy === "simple" ? "" : a.setIdentifier.trim();
      const setB = b.routingPolicy === "simple" ? "" : b.setIdentifier.trim();
      if ((a.type === "CNAME") !== (b.type === "CNAME")) {
        errors[j].name = `A CNAME record can't have the same name as another record (record ${i + 1}).`;
      } else if (a.type === b.type && setA === setB) {
        errors[j].name = `Record ${i + 1} already has this name and type.`;
      } else if (a.type === b.type && (a.routingPolicy !== b.routingPolicy || a.routingPolicy === "simple")) {
        errors[j].routingPolicy = `Records with the same name and type must use the same routing policy (see record ${i + 1}).`;
      }
      if (errors[j].name || errors[j].routingPolicy) break;
    }
  });
  return errors;
}

// ---------- backend errors -> record + field ----------

export interface MappedError {
  index: number;
  field: DraftField;
  message: string;
}

const INPUT_FIELDS: Record<string, DraftField> = {
  name: "name",
  type: "type",
  ttl: "ttl",
  values: "values",
  routing_policy: "routingPolicy",
  set_identifier: "setIdentifier",
};

/**
 * Find which record (and field) a backend error is about. Batch errors don't carry an index, but most
 * messages name the record (FQDN + type) or quote the offending value. Returns null when unknown.
 */
export function mapRecordError(err: ApiError, drafts: RecordDraft[], zoneName: string): MappedError | null {
  const msg = err.message;
  const fqdns = drafts.map((d) => fqdnOf(d.name, zoneName));
  const found = (index: number, field: DraftField): MappedError | null =>
    index >= 0 ? { index, field, message: msg } : null;

  // Request validation (pydantic): "0.ttl: Input should be ..." for a list, "ttl: ..." for one record.
  const loc = /^(?:(\d+)\.)?([a-z_]+)(?:\.\d+)?:\s/.exec(msg);
  if (err.code === "InvalidInput" && loc && INPUT_FIELDS[loc[2]]) {
    const index = loc[1] !== undefined ? Number(loc[1]) : 0;
    if (index < drafts.length) return { index, field: INPUT_FIELDS[loc[2]], message: msg.slice(loc[0].length) };
  }

  const named = /name='([^']+)', type='([A-Z]+)'/.exec(msg);
  if (named) {
    const [, name, type] = named;
    const field: DraftField = /routing policy/i.test(msg) ? "routingPolicy" : "name";
    return found(drafts.findIndex((d, i) => fqdns[i] === name && d.type === type), field);
  }

  const dnsName = /DNS name (\S+) is not permitted/.exec(msg);
  if (dnsName) {
    const name = dnsName[1];
    const cname = drafts.findIndex((d, i) => fqdns[i] === name && d.type === "CNAME");
    const any = drafts.findIndex((_d, i) => fqdns[i] === name);
    return found(cname >= 0 ? cname : any, "name");
  }

  const badName = /Invalid domain name: '([^']*)'/.exec(msg);
  if (badName) {
    const raw = badName[1].toLowerCase();
    return found(drafts.findIndex((d) => d.name.trim().toLowerCase() === raw), "name");
  }

  const quoted = /encountered with '([^']*)'/.exec(msg) ?? /value '([^']*)'/i.exec(msg) ?? /TXT value (.+): each value/.exec(msg);
  if (quoted) {
    const v = quoted[1];
    return found(drafts.findIndex((d) => splitValues(d.values).includes(v)), "values");
  }

  // Messages that don't identify a record: only safe to place when there's exactly one.
  if (drafts.length === 1) {
    if (/set identifier|record id/i.test(msg)) return found(0, "setIdentifier");
    if (/value|duplicate resource record/i.test(msg)) return found(0, "values");
    if (/\bttl\b/i.test(msg)) return found(0, "ttl");
  }
  return null;
}
