"""Route53 business rules shared by the routers and the seed script."""

import random
import secrets
import string
from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .errors import APIError, bad_change
from .models import HostedZone, Record, User, utcnow
from .schemas import ALIAS_TYPES, RecordIn, RecordUpdate, normalize_domain, to_fqdn, validate_values

_NS_TLDS = ["com", "net", "org", "co.uk"]


def new_zone_id() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "Z" + "".join(secrets.choice(alphabet) for _ in range(20))


def default_records(zone_name: str) -> list[Record]:
    servers = [f"ns-{random.randint(0, 2047)}.awsdns-{random.randint(0, 63):02d}.{tld}." for tld in _NS_TLDS]
    soa = f"{servers[0]} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"
    return [
        Record(name=zone_name, type="NS", ttl=172800, values=servers),
        Record(name=zone_name, type="SOA", ttl=900, values=[soa]),
    ]


def is_default_record(rec: Record, zone: HostedZone) -> bool:
    return rec.name == zone.name and rec.type in ("NS", "SOA") and rec.set_identifier == ""


def count_records(db: Session, zone_id: str) -> int:
    return db.scalar(select(func.count(Record.id)).where(Record.zone_id == zone_id)) or 0


def create_zone(
    db: Session,
    user: User,
    name: str,
    comment: str = "",
    is_private: bool = False,
    vpc_id: str | None = None,
    vpc_region: str | None = None,
) -> HostedZone:
    try:
        fqdn = normalize_domain(name, allow_wildcard=False)
    except ValueError:
        raise APIError(400, "InvalidDomainName", f"'{name}' is not a valid domain name.") from None
    if fqdn.count(".") < 2:
        raise APIError(400, "InvalidDomainName", f"'{name}' is a top-level domain and cannot be used as a hosted zone name.")
    if is_private and not (vpc_id and vpc_id.strip() and vpc_region and vpc_region.strip()):
        raise APIError(400, "InvalidVPCId", "A private hosted zone must be associated with a VPC. Specify a VPC ID and Region.")

    duplicate = db.scalar(
        select(HostedZone).where(
            HostedZone.user_id == user.id, HostedZone.name == fqdn, HostedZone.is_private == is_private
        )
    )
    if duplicate:
        kind = "private" if is_private else "public"
        raise APIError(409, "HostedZoneAlreadyExists", f"A {kind} hosted zone named {fqdn} already exists ({duplicate.id}).")

    now = utcnow()
    zone = HostedZone(
        id=new_zone_id(),
        user_id=user.id,
        name=fqdn,
        is_private=is_private,
        comment=comment.strip(),
        vpc_id=vpc_id.strip() if is_private and vpc_id else None,
        vpc_region=vpc_region.strip() if is_private and vpc_region else None,
        created_at=now,
        updated_at=now,
    )
    zone.records = default_records(fqdn)
    db.add(zone)
    return zone


def _check_routing(policy: str, set_id: str) -> None:
    if policy == "simple" and set_id:
        raise bad_change("Record ID (set identifier) is only allowed for routing policies other than simple.")
    if policy != "simple" and not set_id:
        raise bad_change(f"Record ID (set identifier) is required for {policy} routing.")


def _prepare(zone: HostedZone, item: RecordIn) -> dict[str, Any]:
    """Validate one record against the zone and return normalized column values."""
    try:
        name = to_fqdn(item.name, zone.name)
        set_id = item.set_identifier.strip()
        _check_routing(item.routing_policy, set_id)
        if item.type == "CNAME" and name == zone.name:
            raise bad_change(f"RRSet of type CNAME with DNS name {name} is not permitted at apex in zone {zone.name}")
        alias: dict[str, Any] | None = None
        values: list[str] = []
        if item.alias_target is not None:
            if item.type not in ALIAS_TYPES:
                raise bad_change(f"Alias records are not supported for type {item.type}.")
            alias = item.alias_target.model_dump()
            alias["dns_name"] = normalize_domain(alias["dns_name"], allow_wildcard=False)
        else:
            values = validate_values(item.type, item.values)
    except ValueError as e:
        raise bad_change(str(e)) from None
    return {
        "name": name,
        "type": item.type,
        "ttl": item.ttl,
        "values": values,
        "routing_policy": item.routing_policy,
        "set_identifier": set_id,
        "alias_target": alias,
    }


def _check_conflicts(zone: HostedZone, fields: dict[str, Any], others: Iterable[Record]) -> None:
    name, rtype = fields["name"], fields["type"]
    for r in others:
        if r.name != name:
            continue
        if (rtype == "CNAME") != (r.type == "CNAME"):
            raise bad_change(
                f"RRSet of type CNAME with DNS name {name} is not permitted as it conflicts with other records "
                f"with the same DNS name in zone {zone.name}"
            )
        if r.type != rtype:
            continue
        if r.set_identifier == fields["set_identifier"]:
            raise APIError(
                409,
                "RecordAlreadyExists",
                f"Tried to create resource record set [name='{name}', type='{rtype}'] but it already exists",
            )
        if r.routing_policy != fields["routing_policy"] or r.routing_policy == "simple":
            raise bad_change(
                f"A record set [name='{name}', type='{rtype}'] with a different routing policy already exists."
            )


def create_records(db: Session, zone: HostedZone, items: list[RecordIn]) -> list[Record]:
    """Validate and add a batch of records. Raises before adding anything if any item is invalid."""
    if not items:
        raise bad_change("At least one record is required.")
    existing = list(db.scalars(select(Record).where(Record.zone_id == zone.id)))
    pending: list[Record] = []
    now = utcnow()
    for item in items:
        fields = _prepare(zone, item)
        _check_conflicts(zone, fields, [*existing, *pending])
        pending.append(Record(zone_id=zone.id, created_at=now, updated_at=now, **fields))
    db.add_all(pending)
    zone.updated_at = now
    return pending


def update_record(db: Session, zone: HostedZone, rec: Record, patch: RecordUpdate) -> Record:
    data = patch.model_dump(exclude_unset=True)
    now = utcnow()
    if is_default_record(rec, zone):
        if any(k in data for k in ("routing_policy", "set_identifier", "alias_target")):
            raise bad_change(f"Only the TTL and value of the default {rec.type} record can be changed.")
        if "values" in data and data["values"] is not None:
            try:
                rec.values = validate_values(rec.type, data["values"])
            except ValueError as e:
                raise bad_change(str(e)) from None
        if data.get("ttl") is not None:
            rec.ttl = data["ttl"]
    else:
        merged = RecordIn(
            name=rec.name,
            type=rec.type,  # type: ignore[arg-type]
            ttl=data["ttl"] if data.get("ttl") is not None else rec.ttl,
            values=data["values"] if data.get("values") is not None else rec.values,
            routing_policy=data.get("routing_policy") or rec.routing_policy,  # type: ignore[arg-type]
            set_identifier=data["set_identifier"] if data.get("set_identifier") is not None else rec.set_identifier,
            alias_target=data["alias_target"] if "alias_target" in data else rec.alias_target,  # type: ignore[arg-type]
        )
        fields = _prepare(zone, merged)
        others = db.scalars(select(Record).where(Record.zone_id == zone.id, Record.id != rec.id))
        _check_conflicts(zone, fields, others)
        for key, value in fields.items():
            setattr(rec, key, value)
    rec.updated_at = now
    zone.updated_at = now
    return rec
