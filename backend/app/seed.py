from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import hash_password
from .models import User
from .schemas import RecordIn
from .zone_utils import create_records, create_zone

SEED_ZONES: list[dict[str, object]] = [
    {
        "name": "example.com",
        "comment": "Primary public website",
        "records": [
            RecordIn(name="", type="A", values=["192.0.2.10"]),
            RecordIn(name="", type="MX", values=["10 mail.example.com", "20 mail2.example.com"]),
            RecordIn(name="", type="TXT", values=['"v=spf1 include:amazonses.com -all"']),
            RecordIn(name="", type="CAA", values=['0 issue "amazon.com"']),
            RecordIn(name="www", type="A", values=["192.0.2.10", "192.0.2.11"]),
            RecordIn(name="www", type="AAAA", values=["2001:db8::10"]),
            RecordIn(name="api", type="A", ttl=60, values=["198.51.100.20"]),
            RecordIn(name="mail", type="A", values=["198.51.100.25"]),
            RecordIn(name="mail2", type="A", values=["198.51.100.26"]),
            RecordIn(name="blog", type="CNAME", ttl=3600, values=["example.github.io"]),
            RecordIn(name="_sip._tcp", type="SRV", values=["1 10 5060 sip.example.com"]),
            RecordIn(
                name="app",
                type="A",
                routing_policy="weighted",
                set_identifier="app-us-east-1",
                values=["203.0.113.10"],
            ),
            RecordIn(
                name="app",
                type="A",
                routing_policy="weighted",
                set_identifier="app-eu-west-1",
                values=["203.0.113.20"],
            ),
            RecordIn(
                name="cdn",
                type="A",
                alias_target={"dns_name": "d111111abcdef8.cloudfront.net", "hosted_zone_id": "Z2FDTNDATAQYW2"},
            ),
        ],
    },
    {
        "name": "mycompany.io",
        "comment": "Marketing site",
        "records": [
            RecordIn(name="", type="A", values=["203.0.113.50"]),
            RecordIn(name="www", type="CNAME", values=["mycompany.io"]),
            RecordIn(name="_dmarc", type="TXT", values=['"v=DMARC1; p=none; rua=mailto:dmarc@mycompany.io"']),
        ],
    },
    {
        "name": "internal.corp",
        "comment": "Internal services",
        "is_private": True,
        "vpc_id": "vpc-0abc1234def567890",
        "vpc_region": "us-east-1",
        "records": [
            RecordIn(name="db", type="A", values=["10.0.1.15"]),
            RecordIn(name="cache", type="A", values=["10.0.1.30"]),
            RecordIn(name="15.1.0.10.in-addr", type="PTR", values=["db.internal.corp"]),
        ],
    },
    {"name": "dev.example.org", "comment": "", "records": []},
]


def seed(db: Session) -> None:
    if (db.scalar(select(func.count(User.id))) or 0) > 0:
        return
    user = User(username="demo", password_hash=hash_password("demo"), account_id="123456789012")
    db.add(user)
    db.flush()
    for spec in SEED_ZONES:
        zone = create_zone(
            db,
            user,
            str(spec["name"]),
            str(spec.get("comment", "")),
            bool(spec.get("is_private", False)),
            spec.get("vpc_id"),  # type: ignore[arg-type]
            spec.get("vpc_region"),  # type: ignore[arg-type]
        )
        db.flush()
        records = spec["records"]
        if records:
            create_records(db, zone, records)  # type: ignore[arg-type]
    db.commit()
