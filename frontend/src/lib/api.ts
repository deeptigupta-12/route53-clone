import type {
  ApiErrorBody,
  DnsRecord,
  HostedZone,
  HostedZoneCreate,
  HostedZoneUpdate,
  ListParams,
  Page,
  RecordInput,
  RecordUpdate,
  User,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let redirectingToLogin = false;

async function handleUnauthorized(): Promise<void> {
  if (typeof window === "undefined" || redirectingToLogin) return;
  redirectingToLogin = true;
  // The cookie is httpOnly, so ask the backend to clear a stale one; otherwise middleware
  // would still see a cookie and bounce /login straight back here.
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NetworkError", "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && !path.startsWith("/auth/")) {
    await handleUnauthorized();
  }
  if (!res.ok) {
    let body: Partial<ApiErrorBody> = {};
    try {
      body = (await res.json()) as Partial<ApiErrorBody>;
    } catch {
      // non-JSON error (e.g. proxy failure)
    }
    throw new ApiError(res.status, body.code ?? "Error", body.message ?? `Request failed (${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(params: ListParams = {}): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const json = (body: unknown): string => JSON.stringify(body);
const zonePath = (zoneId: string) => `/hosted-zones/${encodeURIComponent(zoneId)}`;

// ---------- auth ----------

export const login = (username: string, password: string) =>
  request<User>("/auth/login", { method: "POST", body: json({ username, password }) });

export const logout = () => request<void>("/auth/logout", { method: "POST" });

export const getMe = () => request<User>("/auth/me");

// ---------- hosted zones ----------

export const listHostedZones = (params?: ListParams) => request<Page<HostedZone>>(`/hosted-zones${query(params)}`);

export const getHostedZone = (zoneId: string) => request<HostedZone>(zonePath(zoneId));

export const createHostedZone = (body: HostedZoneCreate) =>
  request<HostedZone>("/hosted-zones", { method: "POST", body: json(body) });

export const updateHostedZone = (zoneId: string, body: HostedZoneUpdate) =>
  request<HostedZone>(zonePath(zoneId), { method: "PATCH", body: json(body) });

export const deleteHostedZone = (zoneId: string) => request<void>(zonePath(zoneId), { method: "DELETE" });

// ---------- records ----------

export const listRecords = (zoneId: string, params?: ListParams) =>
  request<Page<DnsRecord>>(`${zonePath(zoneId)}/records${query(params)}`);

export const createRecords = (zoneId: string, records: RecordInput[]) =>
  request<DnsRecord[]>(`${zonePath(zoneId)}/records`, { method: "POST", body: json(records) });

export const updateRecord = (zoneId: string, recordId: number, body: RecordUpdate) =>
  request<DnsRecord>(`${zonePath(zoneId)}/records/${recordId}`, { method: "PATCH", body: json(body) });

export const deleteRecord = (zoneId: string, recordId: number) =>
  request<void>(`${zonePath(zoneId)}/records/${recordId}`, { method: "DELETE" });

export const bulkDeleteRecords = (zoneId: string, ids: number[]) =>
  request<{ deleted: number }>(`${zonePath(zoneId)}/records/bulk-delete`, { method: "POST", body: json({ ids }) });

// ---------- import / export ----------

export const importZoneFile = (zoneId: string, zoneFile: string) =>
  request<{ created: number; skipped: number }>(`${zonePath(zoneId)}/import`, {
    method: "POST",
    body: json({ zone_file: zoneFile }),
  });

/** URL for a plain download link (the browser sends the session cookie itself). */
export const exportZoneUrl = (zoneId: string, format: "json" | "bind" = "bind") =>
  `/api${zonePath(zoneId)}/export?format=${format}`;
