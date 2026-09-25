import json
from typing import Literal

import dns.exception
import dns.rdatatype
import dns.zone
from fastapi import APIRouter, Query, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..auth import DB, CurrentUser
from ..errors import APIError
from ..models import HostedZone, Record, User, utcnow
from ..schemas import ImportIn, Page, RecordIn, RecordOut, ZoneCreate, ZoneOut, ZoneUpdate
from ..zone_utils import count_records, create_records, create_zone, is_default_record

router = APIRouter(prefix="/api/hosted-zones", tags=["hosted-zones"])

SUPPORTED_TYPES = {"A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"}


def get_zone_or_404(db: Session, user: User, zone_id: str) -> HostedZone:
    zone = db.get(HostedZone, zone_id)
    if zone is None or zone.user_id != user.id:
        raise APIError(404, "NoSuchHostedZone", f"No hosted zone found with ID: {zone_id}")
    return zone


def _zone_out(zone: HostedZone, record_count: int) -> ZoneOut:
    out = ZoneOut.model_validate(zone)
    out.record_count = record_count
    return out


@router.get("", response_model=Page[ZoneOut])
def list_zones(
    user: CurrentUser,
    db: DB,
    search: str = "",
    type: Literal["", "public", "private"] = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
) -> Page[ZoneOut]:
    conds = [HostedZone.user_id == user.id]
    if search.strip():
        pattern = f"%{search.strip()}%"
        conds.append(or_(HostedZone.name.ilike(pattern), HostedZone.comment.ilike(pattern), HostedZone.id.ilike(pattern)))
    if type:
        conds.append(HostedZone.is_private == (type == "private"))

    total = db.scalar(select(func.count(HostedZone.id)).where(*conds)) or 0
    counts = select(Record.zone_id, func.count(Record.id).label("cnt")).group_by(Record.zone_id).subquery()
    rows = db.execute(
        select(HostedZone, func.coalesce(counts.c.cnt, 0))
        .outerjoin(counts, counts.c.zone_id == HostedZone.id)
        .where(*conds)
        .order_by(HostedZone.name, HostedZone.is_private)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page[ZoneOut](items=[_zone_out(z, c) for z, c in rows], total=total)


@router.post("", response_model=ZoneOut, status_code=201)
def create_hosted_zone(body: ZoneCreate, user: CurrentUser, db: DB) -> ZoneOut:
    zone = create_zone(db, user, body.name, body.comment, body.is_private, body.vpc_id, body.vpc_region)
    db.commit()
    return _zone_out(zone, count_records(db, zone.id))


@router.get("/{zone_id}", response_model=ZoneOut)
def get_hosted_zone(zone_id: str, user: CurrentUser, db: DB) -> ZoneOut:
    zone = get_zone_or_404(db, user, zone_id)
    return _zone_out(zone, count_records(db, zone.id))


@router.patch("/{zone_id}", response_model=ZoneOut)
def update_hosted_zone(zone_id: str, body: ZoneUpdate, user: CurrentUser, db: DB) -> ZoneOut:
    zone = get_zone_or_404(db, user, zone_id)
    zone.comment = body.comment.strip()
    zone.updated_at = utcnow()
    db.commit()
    return _zone_out(zone, count_records(db, zone.id))


@router.delete("/{zone_id}", status_code=204)
def delete_hosted_zone(zone_id: str, user: CurrentUser, db: DB) -> Response:
    zone = get_zone_or_404(db, user, zone_id)
    extra = [r for r in zone.records if not is_default_record(r, zone)]
    if extra:
        raise APIError(
            409,
            "HostedZoneNotEmpty",
            f"The specified hosted zone contains {len(extra)} non-required resource record set(s) "
            "and so cannot be deleted. Delete those records first.",
        )
    db.delete(zone)
    db.commit()
    return Response(status_code=204)


# ---------- bonus: import / export ----------


@router.post("/{zone_id}/import")
def import_zone_file(zone_id: str, body: ImportIn, user: CurrentUser, db: DB) -> dict[str, int]:
    zone = get_zone_or_404(db, user, zone_id)
    text = body.zone_file
    if "$TTL" not in text.upper():
        text = "$TTL 300\n" + text
    try:
        parsed = dns.zone.from_text(text, origin=zone.name, relativize=False, check_origin=False)
    except (dns.exception.DNSException, ValueError) as e:
        raise APIError(400, "InvalidZoneFile", f"Could not parse the zone file: {e}") from None

    items: list[RecordIn] = []
    skipped = 0
    for name, rdataset in parsed.iterate_rdatasets():
        fqdn = name.to_text().lower()
        rtype = dns.rdatatype.to_text(rdataset.rdtype)
        if rtype == "SOA" or (rtype == "NS" and fqdn == zone.name) or rtype not in SUPPORTED_TYPES:
            skipped += 1
            continue
        items.append(
            RecordIn(name=fqdn, type=rtype, ttl=rdataset.ttl, values=[rd.to_text() for rd in rdataset])  # type: ignore[arg-type]
        )
    if not items:
        raise APIError(400, "InvalidZoneFile", "The zone file does not contain any records that can be imported.")
    created = create_records(db, zone, items)
    db.commit()
    return {"created": len(created), "skipped": skipped}


@router.get("/{zone_id}/export")
def export_zone(
    zone_id: str, user: CurrentUser, db: DB, format: Literal["json", "bind"] = "json"
) -> Response:
    zone = get_zone_or_404(db, user, zone_id)
    records = db.scalars(select(Record).where(Record.zone_id == zone.id).order_by(Record.name, Record.type)).all()
    filename = zone.name.rstrip(".")
    if format == "json":
        payload = [RecordOut.model_validate(r).model_dump(mode="json") for r in records]
        return JSONResponse(
            content={"zone": _zone_out(zone, len(records)).model_dump(mode="json"), "records": payload},
            headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
        )

    lines = [f"; Exported from Route 53 clone: {zone.name} ({zone.id})", f"$ORIGIN {zone.name}", "$TTL 300"]
    for r in records:
        if r.alias_target:
            lines.append(f"; ALIAS {r.name} {r.type} -> {json.dumps(r.alias_target)}")
            continue
        for v in r.values:
            lines.append(f"{r.name}\t{r.ttl}\tIN\t{r.type}\t{v}")
    return PlainTextResponse(
        "\n".join(lines) + "\n", headers={"Content-Disposition": f'attachment; filename="{filename}.zone"'}
    )
