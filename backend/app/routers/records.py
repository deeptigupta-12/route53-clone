from fastapi import APIRouter, Query, Response
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from ..auth import DB, CurrentUser
from ..errors import APIError, bad_change
from ..models import HostedZone, Record, utcnow
from ..schemas import BulkDeleteIn, Page, RecordIn, RecordOut, RecordType, RecordUpdate
from ..zone_utils import create_records, is_default_record, update_record
from .zones import get_zone_or_404

router = APIRouter(prefix="/api/hosted-zones/{zone_id}/records", tags=["records"])


def _get_record_or_404(db: Session, zone: HostedZone, record_id: int) -> Record:
    rec = db.get(Record, record_id)
    if rec is None or rec.zone_id != zone.id:
        raise APIError(404, "NoSuchRecord", f"No record found with ID {record_id} in hosted zone {zone.id}")
    return rec


def _ensure_deletable(rec: Record, zone: HostedZone) -> None:
    if is_default_record(rec, zone):
        raise bad_change(
            f"A HostedZone must contain at least one {rec.type} record for the zone itself. "
            f"The default {rec.type} record for {zone.name} cannot be deleted."
        )


@router.get("", response_model=Page[RecordOut])
def list_records(
    zone_id: str,
    user: CurrentUser,
    db: DB,
    search: str = "",
    type: RecordType | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=300),
) -> dict[str, object]:
    zone = get_zone_or_404(db, user, zone_id)
    conds = [Record.zone_id == zone.id]
    if search.strip():
        pattern = f"%{search.strip()}%"
        conds.append(or_(Record.name.ilike(pattern), Record.values_json.ilike(pattern)))
    if type:
        conds.append(Record.type == type)

    total = db.scalar(select(func.count(Record.id)).where(*conds)) or 0
    default_first = case(
        (and_(Record.name == zone.name, Record.type == "NS"), 0),
        (and_(Record.name == zone.name, Record.type == "SOA"), 1),
        else_=2,
    )
    items = db.scalars(
        select(Record)
        .where(*conds)
        .order_by(default_first, Record.name, Record.type, Record.set_identifier)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total}


@router.post("", response_model=list[RecordOut], status_code=201)
def create_record_batch(zone_id: str, body: list[RecordIn], user: CurrentUser, db: DB) -> list[Record]:
    zone = get_zone_or_404(db, user, zone_id)
    created = create_records(db, zone, body)
    db.commit()
    return created


@router.post("/bulk-delete")
def bulk_delete_records(zone_id: str, body: BulkDeleteIn, user: CurrentUser, db: DB) -> dict[str, int]:
    zone = get_zone_or_404(db, user, zone_id)
    ids = set(body.ids)
    records = db.scalars(select(Record).where(Record.zone_id == zone.id, Record.id.in_(ids))).all()
    missing = ids - {r.id for r in records}
    if missing:
        raise APIError(404, "NoSuchRecord", f"Records not found in this hosted zone: {sorted(missing)}")
    for rec in records:
        _ensure_deletable(rec, zone)
    for rec in records:
        db.delete(rec)
    zone.updated_at = utcnow()
    db.commit()
    return {"deleted": len(records)}


@router.patch("/{record_id}", response_model=RecordOut)
def patch_record(zone_id: str, record_id: int, body: RecordUpdate, user: CurrentUser, db: DB) -> Record:
    zone = get_zone_or_404(db, user, zone_id)
    rec = _get_record_or_404(db, zone, record_id)
    update_record(db, zone, rec, body)
    db.commit()
    return rec


@router.delete("/{record_id}", status_code=204)
def delete_record(zone_id: str, record_id: int, user: CurrentUser, db: DB) -> Response:
    zone = get_zone_or_404(db, user, zone_id)
    rec = _get_record_or_404(db, zone, record_id)
    _ensure_deletable(rec, zone)
    db.delete(rec)
    zone.updated_at = utcnow()
    db.commit()
    return Response(status_code=204)
