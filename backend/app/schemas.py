import ipaddress
import re
from datetime import datetime, timezone
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# ---------- shared types ----------

UtcDatetime = Annotated[
    datetime,
    PlainSerializer(lambda d: d.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"), return_type=str),
]

RecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"]
RoutingPolicy = Literal["simple", "weighted", "latency", "failover", "geolocation", "multivalue"]
ALIAS_TYPES = {"A", "AAAA", "CNAME"}
MAX_TTL = 2147483647

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class UserOut(ORMModel):
    id: int
    username: str
    account_id: str
    created_at: UtcDatetime


# ---------- hosted zones ----------


class ZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    comment: str = Field(default="", max_length=256)
    is_private: bool = False
    vpc_id: str | None = Field(default=None, max_length=64)
    vpc_region: str | None = Field(default=None, max_length=32)


class ZoneUpdate(BaseModel):
    comment: str = Field(max_length=256)


class ZoneOut(ORMModel):
    id: str
    name: str
    is_private: bool
    comment: str
    vpc_id: str | None
    vpc_region: str | None
    record_count: int = 0
    created_at: UtcDatetime
    updated_at: UtcDatetime


# ---------- records ----------


class AliasTarget(BaseModel):
    dns_name: str = Field(min_length=1, max_length=255)
    hosted_zone_id: str = Field(default="", max_length=32)
    evaluate_target_health: bool = False


class RecordIn(BaseModel):
    name: str = Field(default="", max_length=255)
    type: RecordType
    ttl: int = Field(default=300, ge=0, le=MAX_TTL)
    values: list[str] = Field(default_factory=list)
    routing_policy: RoutingPolicy = "simple"
    set_identifier: str = Field(default="", max_length=128)
    alias_target: AliasTarget | None = None


class RecordUpdate(BaseModel):
    ttl: int | None = Field(default=None, ge=0, le=MAX_TTL)
    values: list[str] | None = None
    routing_policy: RoutingPolicy | None = None
    set_identifier: str | None = Field(default=None, max_length=128)
    alias_target: AliasTarget | None = None


class RecordOut(ORMModel):
    id: int
    zone_id: str
    name: str
    type: str
    ttl: int
    values: list[str]
    routing_policy: str
    set_identifier: str
    alias_target: dict[str, Any] | None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class BulkDeleteIn(BaseModel):
    ids: list[int] = Field(min_length=1)


class ImportIn(BaseModel):
    zone_file: str = Field(min_length=1, max_length=1_000_000)


# ---------- validation helpers (raise ValueError with a user-facing message) ----------

_LABEL_RE = re.compile(r"^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$")


def normalize_domain(value: str, allow_wildcard: bool = True) -> str:
    """Lowercase, validate labels and return the name with a trailing dot."""
    name = value.strip().lower()
    if name.endswith("."):
        name = name[:-1]
    if not name or len(name) > 253:
        raise ValueError(f"Invalid domain name: '{value}'.")
    labels = name.split(".")
    for i, label in enumerate(labels):
        if label == "*" and allow_wildcard and i == 0:
            continue
        if not _LABEL_RE.match(label):
            raise ValueError(f"Invalid domain name: '{value}'.")
    return name + "."


def to_fqdn(name: str, zone_name: str) -> str:
    """Turn a record name as typed in the console (relative or FQDN) into an FQDN inside the zone."""
    n = name.strip().lower()
    bare_zone = zone_name[:-1]
    if n in ("", "@"):
        return zone_name
    if n.endswith("."):
        fqdn = n
    elif n == bare_zone or n.endswith("." + bare_zone):
        fqdn = n + "."
    else:
        fqdn = f"{n}.{zone_name}"
    fqdn = normalize_domain(fqdn)
    if fqdn != zone_name and not fqdn.endswith("." + zone_name):
        raise ValueError(f"RRSet with DNS name {fqdn} is not permitted in zone {zone_name}")
    return fqdn


def _int(value: str, lo: int, hi: int, field: str, rtype: str) -> int:
    if not value.isdigit() or not lo <= int(value) <= hi:
        raise ValueError(f"Invalid {rtype} value: {field} must be an integer between {lo} and {hi}.")
    return int(value)


def _host(value: str, rtype: str) -> str:
    try:
        return normalize_domain(value, allow_wildcard=False)
    except ValueError:
        raise ValueError(f"Invalid {rtype} value: '{value}' is not a valid domain name.") from None


_CAA_RE = re.compile(r'^(\d{1,3})\s+(issue|issuewild|iodef)\s+(".*")$', re.IGNORECASE)


def _validate_one(rtype: str, v: str) -> str:
    parts = v.split()
    if rtype == "A":
        try:
            return str(ipaddress.IPv4Address(v))
        except ValueError:
            raise ValueError(f"ARRDATAIllegalIPv4Address (Value is not a valid IPv4 address) encountered with '{v}'") from None
    if rtype == "AAAA":
        try:
            return str(ipaddress.IPv6Address(v))
        except ValueError:
            raise ValueError(f"AAAARRDATAIllegalIPv6Address (Value is not a valid IPv6 address) encountered with '{v}'") from None
    if rtype in ("CNAME", "NS", "PTR"):
        return _host(v, rtype)
    if rtype == "MX":
        if len(parts) != 2:
            raise ValueError(f"Invalid MX value '{v}': expected format 'priority mail-server', e.g. '10 mail.example.com'.")
        return f"{_int(parts[0], 0, 65535, 'priority', 'MX')} {_host(parts[1], 'MX')}"
    if rtype == "SRV":
        if len(parts) != 4:
            raise ValueError(f"Invalid SRV value '{v}': expected format 'priority weight port target', e.g. '1 10 5269 xmpp.example.com'.")
        p = _int(parts[0], 0, 65535, "priority", "SRV")
        w = _int(parts[1], 0, 65535, "weight", "SRV")
        port = _int(parts[2], 0, 65535, "port", "SRV")
        return f"{p} {w} {port} {_host(parts[3], 'SRV')}"
    if rtype == "CAA":
        m = _CAA_RE.match(v)
        if not m:
            raise ValueError(f"Invalid CAA value '{v}': expected format 'flags tag \"value\"', e.g. '0 issue \"amazon.com\"'.")
        flags = _int(m.group(1), 0, 255, "flags", "CAA")
        return f"{flags} {m.group(2).lower()} {m.group(3)}"
    if rtype == "TXT":
        if len(v) < 2 or not (v.startswith('"') and v.endswith('"')):
            raise ValueError(f"Invalid TXT value {v}: each value must be enclosed in quotation marks, e.g. \"v=spf1 -all\".")
        return v
    if rtype == "SOA":
        if len(parts) != 7:
            raise ValueError("Invalid SOA value: expected 'mname rname serial refresh retry expire minimum'.")
        nums = [_int(x, 0, 4294967295, "SOA field", "SOA") for x in parts[2:]]
        return " ".join([_host(parts[0], "SOA"), _host(parts[1], "SOA"), *map(str, nums)])
    raise ValueError(f"Unsupported record type: {rtype}")


def validate_values(rtype: str, values: list[str]) -> list[str]:
    cleaned = [v.strip() for v in values if v.strip()]
    if not cleaned:
        raise ValueError(f"A value is required for {rtype} records.")
    if rtype in ("CNAME", "SOA") and len(cleaned) > 1:
        raise ValueError(f"{rtype} records can have only one value.")
    result = [_validate_one(rtype, v) for v in cleaned]
    if len(set(result)) != len(result):
        raise ValueError(f"Duplicate Resource Record in {rtype} values.")
    return result
