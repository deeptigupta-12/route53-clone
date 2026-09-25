// Types mirroring backend/app/schemas.py.

export const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const ROUTING_POLICIES = ["simple", "weighted", "latency", "failover", "geolocation", "multivalue"] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export interface Page<T> {
  items: T[];
  total: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface User {
  id: number;
  username: string;
  account_id: string;
  created_at: string;
}

export interface HostedZone {
  id: string;
  name: string;
  is_private: boolean;
  comment: string;
  vpc_id: string | null;
  vpc_region: string | null;
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface HostedZoneCreate {
  name: string;
  comment?: string;
  is_private?: boolean;
  vpc_id?: string | null;
  vpc_region?: string | null;
}

export interface HostedZoneUpdate {
  comment: string;
}

export interface AliasTarget {
  dns_name: string;
  hosted_zone_id?: string;
  evaluate_target_health?: boolean;
}

export interface DnsRecord {
  id: number;
  zone_id: string;
  name: string;
  /** Includes "SOA", which only the system creates. */
  type: RecordType | "SOA";
  ttl: number;
  values: string[];
  routing_policy: RoutingPolicy;
  set_identifier: string;
  alias_target: AliasTarget | null;
  created_at: string;
  updated_at: string;
}

export interface RecordInput {
  /** Relative name ("www"), "" for the apex, or an FQDN inside the zone. */
  name: string;
  type: RecordType;
  ttl?: number;
  values?: string[];
  routing_policy?: RoutingPolicy;
  set_identifier?: string;
  alias_target?: AliasTarget | null;
}

export interface RecordUpdate {
  ttl?: number;
  values?: string[];
  routing_policy?: RoutingPolicy;
  set_identifier?: string;
  alias_target?: AliasTarget | null;
}

export interface ListParams {
  search?: string;
  type?: string;
  page?: number;
  page_size?: number;
}
