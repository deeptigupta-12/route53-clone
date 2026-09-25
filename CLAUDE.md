# Project: AWS Route53 Clone

A functional clone of the AWS Route53 console. Focus: recreate the Route53 UI/UX and core workflows
(no real DNS). The UI must look and feel like the real AWS console, not a generic CRUD app.

## Tech stack (fixed by the assignment, do not change)
- Frontend: Next.js (App Router) + TypeScript, in `frontend/`
- UI library: Cloudscape Design System (`@cloudscape-design/components`, `@cloudscape-design/global-styles`)
- Backend: FastAPI + SQLAlchemy + Pydantic, in `backend/`
- Database: SQLite (file path from env var `DATABASE_PATH`, default `./route53.db`)
- Hosting: frontend on Vercel, backend on Railway (SQLite file on a Railway volume mounted at `/data`)

## Architecture
- Browser only talks to Next.js. `next.config.ts` rewrites `/api/:path*` to `${BACKEND_URL}/api/:path*`
  (default `http://localhost:8000`). This keeps cookies same-origin; no CORS setup needed in production.
- All frontend API calls live in `frontend/src/lib/api.ts`; shared types in `frontend/src/lib/types.ts`.
- Cloudscape components are client components: pages using them start with `"use client"`.
- Add `transpilePackages: ["@cloudscape-design/components", "@cloudscape-design/component-toolkit"]` to next.config.
- Import `@cloudscape-design/global-styles/index.css` once in the root layout.

## Folder structure
```
backend/
  app/
    main.py        # FastAPI app, include routers, create tables, run seed on startup
    database.py    # engine, SessionLocal, Base, get_db dependency
    models.py      # User, Session, HostedZone, Record
    schemas.py     # Pydantic models + per-record-type validation
    auth.py        # get_current_user dependency (reads session cookie)
    seed.py        # demo user + sample zones/records when DB is empty
    routers/auth.py, routers/zones.py, routers/records.py
  requirements.txt
frontend/
  src/app/login/page.tsx
  src/app/route53/layout.tsx                         # AppLayout + TopNavigation + SideNavigation
  src/app/route53/hosted-zones/page.tsx
  src/app/route53/hosted-zones/create/page.tsx
  src/app/route53/hosted-zones/[id]/page.tsx
  src/app/route53/hosted-zones/[id]/create-record/page.tsx
  src/app/route53/{dashboard,health-checks,traffic-policies,resolver,profiles}/page.tsx  # Coming soon
  src/components/  (ComingSoon, NotificationsProvider using Flashbar, RecordForm)
  src/lib/api.ts, src/lib/types.ts
  src/middleware.ts   # redirect to /login when session cookie missing
```

## Database (4 tables)
- users: id, username (unique), password_hash, account_id (mocked 12 digits), created_at
- sessions: token (PK, random), user_id FK, created_at, expires_at (7 days)
- hosted_zones: id (PK, "Z" + 20 uppercase alphanumerics), user_id FK, name (FQDN with trailing dot),
  is_private (bool), comment, vpc_id, vpc_region, created_at, updated_at. Unique (user_id, name, is_private).
- records: id, zone_id FK (ON DELETE CASCADE), name (FQDN with trailing dot), type, ttl,
  values (JSON array stored as TEXT), routing_policy (default "simple"), set_identifier,
  alias_target (nullable), created_at, updated_at. Unique (zone_id, name, type, set_identifier).
- Record types: A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA (+ SOA, system-created only).

## Route53 behaviors to mimic
- Creating a zone auto-creates an NS record (4 fake servers like ns-123.awsdns-45.com.) and an SOA record.
  These default NS/SOA records at the apex cannot be deleted.
- Deleting a zone with any non-default records returns 409 with code "HostedZoneNotEmpty".
- Only the zone description (comment) is editable after creation.
- CNAME cannot exist at the zone apex, and cannot coexist with another record of the same name.
- Validate values per type (IPv4 for A, IPv6 for AAAA, "priority host" for MX, "priority weight port target"
  for SRV, "flags tag value" for CAA, TXT wrapped in quotes). TTL 0–2147483647, default 300.
- Record name input shows the zone name as a suffix; backend stores FQDN.

## API (all under /api, JSON; errors are {"code": "...", "message": "..."})
- POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me  (httpOnly cookie "session")
- Mocked auth: seed user demo / demo. Any other username+password should also work (auto-create user).
- GET /api/hosted-zones?search=&type=&page=1&page_size=10  -> {items, total}
- POST /api/hosted-zones, GET/PATCH/DELETE /api/hosted-zones/{id}
- GET /api/hosted-zones/{id}/records?search=&type=&page=&page_size=  -> {items, total}
- POST /api/hosted-zones/{id}/records (accepts a list), PATCH/DELETE /api/hosted-zones/{id}/records/{rid}
- POST /api/hosted-zones/{id}/records/bulk-delete  {ids: [...]}
- Bonus: POST /api/hosted-zones/{id}/import (BIND text, dnspython), GET /api/hosted-zones/{id}/export?format=json|bind
- Every zone/record endpoint requires a valid session and only touches the current user's data.

## UI requirements (match the real Route53 console)
- Dark TopNavigation: AWS logo/"Route 53" identity, search input, "Global" region, account menu with Sign out.
- SideNavigation sections: Dashboard, Hosted zones, Health checks, Profiles, Traffic flow (Traffic policies,
  Policy records), Domains, IP-based routing, Resolver, DNS Firewall. Non-implemented ones -> Coming soon page.
- BreadcrumbGroup on every page ("Route 53 > Hosted zones > example.com").
- Hosted zones table columns: Hosted zone name (link), Type, Created by ("Route 53"), Record count,
  Description, Hosted zone ID. TextFilter, Pagination, CollectionPreferences (page size, visible columns),
  single selection, header actions: View details, Edit, Delete, Create hosted zone. Counter in header.
- Create hosted zone: full-page Form with Domain name, Description, Type tiles (Public/Private), VPC fields if private.
- Zone detail: "Hosted zone details" container + Tabs (Records, DNSSEC signing = coming soon, Hosted zone tags).
- Records table columns: Record name, Type, Routing policy, Differentiator, Alias, Value/Route traffic to,
  TTL (seconds), Health check ID. Search + type Select filter, multi-select, Delete record, Create record buttons.
- Create record page: record name (with zone suffix), type Select with descriptions, value Textarea
  ("one value per line"), TTL with 1m/1h/1d quick buttons, routing policy, "Add another record".
- Edit record: SplitPanel on the right when a record is selected.
- Delete confirmation Modal (user types "delete" for zones). Success/error via Flashbar at the top.
- Loading states on tables, empty states, and disabled buttons when nothing is selected.

## Conventions
- Keep it simple and readable; small files; no extra frameworks (no Redux, no ORM migrations tool).
- Backend: type hints everywhere; business rules in routers are fine for this size.
- Frontend: strict TypeScript, no `any` where avoidable.
- After each change, run the app and verify it works before reporting done.
- Local run: backend `uvicorn app.main:app --reload --port 8000`; frontend `npm run dev` (port 3000).