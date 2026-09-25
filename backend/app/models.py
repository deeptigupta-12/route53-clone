import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite does not store time zones)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    account_id: Mapped[str] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    zones: Mapped[list["HostedZone"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)

    user: Mapped[User] = relationship()


class HostedZone(Base):
    __tablename__ = "hosted_zones"
    __table_args__ = (UniqueConstraint("user_id", "name", "is_private", name="uq_zone_user_name_private"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    comment: Mapped[str] = mapped_column(String(256), default="")
    vpc_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vpc_region: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="zones")
    records: Mapped[list["Record"]] = relationship(
        back_populates="zone", cascade="all, delete-orphan", passive_deletes=True
    )


class Record(Base):
    __tablename__ = "records"
    __table_args__ = (
        UniqueConstraint("zone_id", "name", "type", "set_identifier", name="uq_record_zone_name_type_setid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(ForeignKey("hosted_zones.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(10))
    ttl: Mapped[int] = mapped_column(Integer, default=300)
    values_json: Mapped[str] = mapped_column("values", Text, default="[]")
    routing_policy: Mapped[str] = mapped_column(String(32), default="simple")
    # Empty string (not NULL) so the unique constraint applies to simple records too.
    set_identifier: Mapped[str] = mapped_column(String(128), default="")
    alias_json: Mapped[str | None] = mapped_column("alias_target", Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    zone: Mapped[HostedZone] = relationship(back_populates="records")

    @property
    def values(self) -> list[str]:
        return json.loads(self.values_json or "[]")

    @values.setter
    def values(self, value: list[str]) -> None:
        self.values_json = json.dumps(value)

    @property
    def alias_target(self) -> dict[str, Any] | None:
        return json.loads(self.alias_json) if self.alias_json else None

    @alias_target.setter
    def alias_target(self, value: dict[str, Any] | None) -> None:
        self.alias_json = json.dumps(value) if value else None
