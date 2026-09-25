# AWS Route 53 Clone

A functional clone of the AWS Route 53 console for managing hosted zones and DNS records, with a Next.js frontend, a FastAPI backend and SQLite persistence. It recreates the Route 53 look, feel and core workflows; it does not serve real DNS.

**Live demo:** https://route53-clone-pink.vercel.app

**Demo login:** username `demo`, password `demo` (any other username and password creates a new, empty account)

> The backend runs on a small hosted instance, so the very first request can take a few seconds.

## Features

**Authentication (mocked)**
- Login, logout and persistent sessions using an httpOnly cookie
- Each user sees only their own hosted zones and records

**Hosted zones**
- List with server-side search (name, description or ID), type filter, pagination and table preferences (page size, visible columns), saved per browser
- Create public or private zones (private zones require a VPC ID and region)
- Edit the description (the only editable field, as in Route 53)
- Delete with a "type delete to confirm" modal; non-empty zones are refused with Route 53's `HostedZoneNotEmpty` error
- Every new zone automatically gets its NS record (four `awsdns` name servers) and SOA record

**DNS records**
- Supported types: A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA
- Records table with server-side search (names and values), type filter, pagination and preferences
- Create several records at once, with per-type validation in the browser and the backend
- View and edit a record in a side split panel (name and type are read-only, as in Route 53)
- Multi-select bulk delete with a confirmation modal
- The default NS and SOA records cannot be deleted

**Route 53 experience**
- Built with Cloudscape, AWS's open-source design system used by the AWS console
- Top navigation, side navigation matching the Route 53 sections, breadcrumbs, full-page forms, modals, split panel and flash notifications
- Dashboard, Health checks, Traffic policies, Resolver, Profiles and other unimplemented sections show a "Coming soon" page

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Cloudscape Design System |
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2, dnspython |
| Database | SQLite |
| Hosting | Vercel (frontend), Railway with a persistent volume (backend) |

## Architecture

```
Browser ──► Next.js frontend (Vercel)
               │  rewrites /api/* to the backend
               ▼
            FastAPI backend (Railway)
               │  SQLAlchemy
               ▼
            SQLite file (Railway volume at /data)
```

- The browser only talks to the Next.js app. `next.config.ts` rewrites every `/api/*` request to the FastAPI backend (`BACKEND_URL`). Because the session cookie is set on the frontend's own domain, no CORS or cross-site cookie configuration is needed.
- `middleware.ts` redirects signed-out users to `/login`. If the backend reports an expired or invalid session (401), the client clears the cookie and returns to the login page, which prevents redirect loops.
- The console layout is rendered client-side only. Cloudscape measures the browser (for example, scrollbar size) in ways the server cannot, which caused hydration mismatches on Windows browsers with classic scrollbars.
- All frontend API calls go through one typed client (`src/lib/api.ts`), and the TypeScript types in `src/lib/types.ts` mirror the backend schemas.

## Project structure

```
backend/
  app/
    main.py          FastAPI app, routers, table creation, demo seed on startup
    database.py      SQLite engine (path from DATABASE_PATH), foreign keys enabled
    models.py        users, sessions, hosted_zones, records
    schemas.py       request/response models and per-type record validation
    zone_utils.py    shared Route 53 rules (name normalization, default records, conflicts)
    errors.py        consistent {"code", "message"} error responses
    auth.py          password hashing and current-user dependency
    seed.py          demo user and sample zones when the database is empty
    routers/         auth.py, zones.py, records.py
  requirements.txt
frontend/
  src/app/login/                          sign-in page
  src/app/route53/layout.tsx              console shell (top nav, side nav, flash bar, split panel)
  src/app/route53/hosted-zones/           list, create, [id] (zone + records), [id]/edit, [id]/create-record
  src/app/route53/...                     Coming soon pages
  src/components/                         RecordsTable, RecordForm, RecordDetailsPanel, DeleteZoneModal, ...
  src/lib/                                api.ts, types.ts, records.ts (validation), usePreferences.ts, ...
  src/middleware.ts                       auth redirects
  next.config.ts                          /api proxy to the backend
```

## Database schema

```
users
  id              INTEGER PRIMARY KEY
  username        TEXT UNIQUE
  password_hash   TEXT            (PBKDF2)
  account_id      TEXT            (mocked 12-digit AWS account ID)
  created_at      DATETIME

sessions
  token           TEXT PRIMARY KEY (random)
  user_id         INTEGER → users.id  ON DELETE CASCADE
  created_at      DATETIME
  expires_at      DATETIME        (7 days)

hosted_zones
  id              TEXT PRIMARY KEY ("Z" + 20 uppercase alphanumerics, like Route 53)
  user_id         INTEGER → users.id
  name            TEXT            (FQDN with trailing dot, e.g. "example.com.")
  is_private      BOOLEAN
  comment         TEXT            (shown as "Description")
  vpc_id          TEXT            (private zones only)
  vpc_region      TEXT            (private zones only)
  created_at      DATETIME
  updated_at      DATETIME
  UNIQUE (user_id, name, is_private)

records
  id              INTEGER PRIMARY KEY
  zone_id         TEXT → hosted_zones.id  ON DELETE CASCADE
  name            TEXT            (FQDN with trailing dot)
  type            TEXT            (A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA, SOA)
  ttl             INTEGER
  values          TEXT            (JSON array of values)
  routing_policy  TEXT            (default "simple")
  set_identifier  TEXT            (default "")
  alias_target    TEXT            (JSON, nullable)
  created_at      DATETIME
  updated_at      DATETIME
  UNIQUE (zone_id, name, type, set_identifier)
```

Design notes:
- SQLite ignores foreign keys by default, so `PRAGMA foreign_keys=ON` is set on every connection; deleting a zone deletes its records.
- `set_identifier` defaults to an empty string rather than NULL, because SQLite treats NULLs as distinct and the unique constraint would otherwise allow duplicate records.
- Names are stored as fully qualified domain names so that record lookups and conflict checks are unambiguous.

## API overview

All endpoints are under `/api` and use JSON. Errors always have the shape `{"code": "...", "message": "..."}`. Interactive documentation is available at `/docs` on the backend.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Sign in (creates the user if new) and set the session cookie |
| POST | `/api/auth/logout` | End the session |
| GET | `/api/auth/me` | Current user |
| GET | `/api/hosted-zones?search=&type=&page=&page_size=` | List zones → `{items, total}` |
| POST | `/api/hosted-zones` | Create a zone (adds NS and SOA records) |
| GET | `/api/hosted-zones/{id}` | Zone details |
| PATCH | `/api/hosted-zones/{id}` | Update the description |
| DELETE | `/api/hosted-zones/{id}` | Delete an empty zone |
| GET | `/api/hosted-zones/{id}/records?search=&type=&page=&page_size=` | List records → `{items, total}` |
| POST | `/api/hosted-zones/{id}/records` | Create one or more records (all or nothing) |
| PATCH | `/api/hosted-zones/{id}/records/{record_id}` | Update TTL, values or routing |
| DELETE | `/api/hosted-zones/{id}/records/{record_id}` | Delete a record |
| POST | `/api/hosted-zones/{id}/records/bulk-delete` | Delete several records atomically |
| POST | `/api/hosted-zones/{id}/import` | Import a BIND zone file (API only, no UI) |
| GET | `/api/hosted-zones/{id}/export?format=json\|bind` | Export records (API only, no UI) |
| GET | `/api/health` | Health check |

Status codes: `400` invalid input (`InvalidInput`, `InvalidChangeBatch`, `InvalidDomainName`), `401` not signed in, `404` zone not found or owned by another user (`NoSuchHostedZone`), `409` conflicts (`HostedZoneAlreadyExists`, `RecordAlreadyExists`, `HostedZoneNotEmpty`).

### Route 53 rules implemented
- New zones get an apex NS record and an SOA record, which cannot be deleted.
- A zone with records other than the default NS and SOA cannot be deleted.
- CNAME records are not allowed at the zone apex or alongside other records with the same name.
- Values are validated per type: IPv4 for A, IPv6 for AAAA, `priority host` for MX, `priority weight port target` for SRV, `flags tag "value"` for CAA, quoted strings for TXT. TTL must be between 0 and 2147483647.

## Local setup

**Requirements:** Python 3.12 and Node.js 20 or later.

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The database file `route53.db` is created and seeded with the demo account on first start. API docs: http://localhost:8000/docs

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and sign in with `demo` / `demo`. The frontend proxies `/api` to `http://localhost:8000` by default.

### Environment variables

| Where | Variable | Default | Purpose |
|---|---|---|---|
| Backend | `DATABASE_PATH` | `./route53.db` | SQLite file location |
| Backend | `COOKIE_SECURE` | `false` | Set to `true` in production (HTTPS) |
| Frontend | `BACKEND_URL` | `http://localhost:8000` | Where `/api` requests are proxied |

## Deployment

- **Backend (Railway):** root directory `/backend`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, a volume mounted at `/data`, and variables `DATABASE_PATH=/data/route53.db` and `COOKIE_SECURE=true`.
- **Frontend (Vercel):** root directory `frontend`, framework Next.js, and `BACKEND_URL` set to the Railway URL.

## Limitations and possible improvements

- Authentication is mocked; a real system would add rate limiting, account management and stronger session controls.
- SQLite suits a single instance; PostgreSQL would be the choice for concurrent writes and horizontal scaling.
- Advanced routing policies store a set identifier only (no weights, regions or health checks), and alias records cannot be created from the UI.
- Import/export of BIND zone files exists in the API but has no UI.
- Automated tests were run during development with curl scripts and Playwright; adding them to the repository with CI would be the next step.