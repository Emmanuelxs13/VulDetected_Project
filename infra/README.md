# Infraestructura local de desarrollo

Pila de Docker Compose para desarrollo local. Solo para desarrollo — nada de lo que aquí aparece es un camino de despliegue en producción.

## Por qué PostgreSQL se ejecuta en Docker

Este equipo **no tiene el cliente `psql` instalado**. En lugar de añadir una cadena de herramientas nativa de base de datos que todos los colaboradores tendrían que reproducir, la base de datos se ejecuta en un contenedor. Esto mantiene la configuración idéntica en todas las máquinas y hace que la pila de desarrollo sea desechable: `down -v` la elimina por completo.

Si ya tiene `psql` instalado localmente, puede conectarse al mismo contenedor:

```powershell
psql "postgresql://vuldetected:vuldetected@localhost:5432/vuldetected"
```

El host suele ser `localhost`, pero en Docker Desktop para Windows puede resolverse mediante el nombre del contenedor (`vuldetected-postgres`) si la asignación de puertos presenta problemas.

## Ejecución

Desde la raíz del repositorio:

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps
```

Verifique que el archivo sea válido antes de iniciarlo:

```powershell
docker compose -f infra/docker-compose.dev.yml config
```

Detención (añada `-v` para eliminar también los volúmenes de datos):

```powershell
docker compose -f infra/docker-compose.dev.yml down
docker compose -f infra/docker-compose.dev.yml down -v
```

## Servicios y puertos

| Servicio   | Imagen                   | Puertos                                        | Propósito                                                                       |
| ---------- | ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`     | `localhost:5432`                               | Base de datos de la aplicación                                                  |
| `mailpit`  | `axllent/mailpit:latest` | `localhost:1025` (SMTP), `localhost:8025` (UI) | Captura de correo de desarrollo — consulte el correo en <http://localhost:8025> |
| `redis`    | `redis:7-alpine`         | `localhost:6379`                               | Broker de Celery para el worker de análisis (Sprint 2)                          |

Ningún servicio se expone fuera de localhost.

## Espera a PostgreSQL

El servicio `postgres` dispone de un healthcheck con `pg_isready`. Las herramientas basadas en contenedores deben esperar a que esté listo en lugar de utilizar un retardo fijo. Las migraciones se aplican mediante drizzle-kit contra `DATABASE_URL` y **aún no se ha ejecutado ninguna migración** — consulte [../docs/database.md](../docs/database.md).

## Cambio a Supabase

`localhost:5432` se corresponde directamente con la cadena de conexión de Supabase. Para migrar a Supabase, basta con cambiar `DATABASE_URL` en `.env` y no modificar nada más — ni código ni compose:

```dotenv
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

La capa de datos no contiene nombres de host, rutas de socket ni extensiones de PostgreSQL codificadas de forma fija, más allá de `citext` y `gen_random_uuid()`. Consulte
[ADR 0004](../docs/adr/0004-database-provider-neutrality.md).

## Próximamente en Sprint 2

El servicio `scanner` (worker de Python + Celery que orquesta Nuclei y ZAP) **no está definido aún de forma intencional**. Sus restricciones de aislamiento se han registrado previamente en un bloque de comentarios en `docker-compose.dev.yml` y se detallan en
[../docs/security.md](../docs/security.md).
