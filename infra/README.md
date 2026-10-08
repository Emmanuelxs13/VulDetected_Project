# Local development infrastructure

Docker Compose stack for local development. Dev-only — nothing here is a
production deployment path.

## Why Postgres runs in Docker

This workstation has **no `psql` client installed**. Rather than adding a
native database toolchain that every contributor would have to reproduce, the
database runs in a container. That keeps the setup identical across machines and
makes the dev stack disposable: `down -v` wipes it completely.

If you do have `psql` locally, it works against the same container:

```powershell
psql "postgresql://vuldetected:vuldetected@localhost:5432/vuldetected"
```

The host is usually `localhost`, but on Docker Desktop for Windows it can be
resolved through the container name (`vuldetected-postgres`) if the port
mapping misbehaves.

## Run it

From the repository root:

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps
```

Verify the file parses before you start it:

```powershell
docker compose -f infra/docker-compose.dev.yml config
```

Tear down (add `-v` to also delete the data volumes):

```powershell
docker compose -f infra/docker-compose.dev.yml down
docker compose -f infra/docker-compose.dev.yml down -v
```

## Services and ports

| Service    | Image                    | Ports                                          | Purpose                                                  |
| ---------- | ------------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`     | `localhost:5432`                               | Application database                                     |
| `mailpit`  | `axllent/mailpit:latest` | `localhost:1025` (SMTP), `localhost:8025` (UI) | Dev email capture — read mail at <http://localhost:8025> |
| `redis`    | `redis:7-alpine`         | `localhost:6379`                               | Celery broker for the scanner worker (Sprint 2)          |

No service is published beyond localhost.

## Waiting for Postgres

The `postgres` service has a `pg_isready` healthcheck. Container-based tooling
should gate on it rather than sleeping a fixed number of seconds. Migrations are
applied through drizzle-kit against `DATABASE_URL` and **no migration has been
run yet** — see [../docs/database.md](../docs/database.md).

## Switching to Supabase

`localhost:5432` maps one-to-one onto Supabase's connection string. To move to
Supabase, change `DATABASE_URL` in `.env` and nothing else — no code change, no
compose change:

```dotenv
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

The data layer deliberately contains no hardcoded hostnames, socket paths, or
Postgres extensions beyond `citext` and `gen_random_uuid()`. See
[ADR 0004](../docs/adr/0004-database-provider-neutrality.md).

## Coming in Sprint 2

The `scanner` service (Python + Celery worker that orchestrates Nuclei and ZAP)
is intentionally **not** defined yet. Its isolation constraints are pre-recorded
as a comment block in `docker-compose.dev.yml` and detailed in
[../docs/security.md](../docs/security.md).
