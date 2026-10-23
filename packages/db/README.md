## Selección del proveedor

Todo pasa por `DATABASE_URL`. No existe una URL de administración, ni ruta de socket, ni nombre de host de servicio en este paquete.

```dotenv
# PostgreSQL local en Docker (infra/docker-compose.dev.yml)
DATABASE_URL=postgresql://vuldetected:vuldetected@localhost:5432/vuldetected?schema=public

# Supabase — mismo código, cadena distinta
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

Cambiar de proveedor es solo cambiar una variable de entorno. Tres reglas lo hacen posible, y las tres son verificables con `grep`:

1. **Sin nombres de host codificados de forma fija.** `postgres`, `db`, `localhost` y `127.0.0.1` no deben aparecer aquí. Pertenecen al archivo compose y a `DATABASE_URL`.
2. **Sin rutas de socket de Unix.** Son específicas de la máquina y carecen de sentido para un proveedor gestionado.
3. **Sin extensiones más allá de `citext`.** Además de `gen_random_uuid()`, que es parte del núcleo de PostgreSQL desde la versión 13 y no requiere nada adicional.

### Por qué el pool es pequeño y `prepare: false`

`createDb()` usa por defecto `max: 5` y establece `prepare: false` de forma deliberada:

- **Pool pequeño** — cada conexión es un backend real de PostgreSQL; los proveedores gestionados limitan y cobran por las conexiones. El coste de que sea demasiado pequeño es la latencia. El coste de que sea demasiado grande es una interrupción del servicio. La latencia es el error más barato.
- **`prepare: false`** — necesario para un pooler en modo transacción (PgBouncer, que Supabase utiliza por defecto). Con sentencias preparadas habilitadas, una sentencia queda ligada a un backend concreto y la siguiente conexión del pool falla con _"prepared statement does not exist"_. Esto supone un re-análisis por consulta, a cambio de la neutralidad del proveedor, que tiene mayor valor.

Se puede sobrescribir con `createDb(url, { max: n })` si el límite del proveedor es distinto.

---

## Uso

```ts
import { getDb, users, eq } from '@vuldetected/db';

// Perezoso: DATABASE_URL se lee en la primera consulta, no en el momento de importación.
// Esto es lo que permite que `next build` funcione sin una base de datos en ejecución.
const db = getDb();

const user = await db.query.users.findFirst({
  where: eq(users.email, 'someone@example.com'),
});
```

`createDb(url)` está disponible cuando se desea un manejador explícito — para pruebas, scripts o herramientas puntuales. El código de la aplicación utiliza `getDb()`.

El barrel re-exporta los operadores de consulta (`eq`, `and`, `inArray`, `desc`, …), de modo que los puntos de llamada no necesitan una dependencia directa de `drizzle-orm` solo para anotar una consulta.
