## Inicio rápido

### Qué funciona hoy

Verificado ejecutando cada comando en este repositorio, no por intención:

| Comando                             | Estado                    | Notas                                                                                                                                            |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`                      | ✅ funciona               | Se resuelven los enlaces del workspace.                                                                                                          |
| `pnpm typecheck`                    | ✅ funciona               | 3/3 paquetes sin errores mediante Turborepo.                                                                                                     |
| `pnpm build`                        | ✅ funciona               | La compilación de producción de Next.js se realiza correctamente — **sin `.env` presente**, lo cual es una propiedad deliberada (ver más abajo). |
| `pnpm format` / `pnpm format:check` | ✅ funciona               | Prettier limpia todo el repositorio.                                                                                                             |
| `pnpm lint`                         | ⚠️ sin efecto             | **No hay linter configurado.** Se eliminó un script `eslint` huérfano en `packages/ui` porque solo podía fallar.                                 |
| `docker compose ... up -d`          | ✅ funciona               | PostgreSQL, Mailpit y Redis en localhost.                                                                                                        |
| Ejecutar la aplicación (`pnpm dev`) | ⚠️ necesita base de datos | Requiere `.env` **y** que se apliquen las migraciones. No se ha realizado ninguna de las dos acciones — consulte más abajo.                      |
| Registrarse / iniciar sesión        | ❌ sin verificar          | Está escrito y pasado por typecheck, pero nunca se ha ejecutado contra una base de datos real. Consulte la advertencia más abajo.                |
| Analizar un objetivo                | ❌ aún no                 | Sprint 2+. No hay worker, no hay cola, no hay hallazgos.                                                                                         |

#### Que `pnpm build` funcione sin `.env` es intencional

`next build` se completa en una máquina **sin archivo de entorno ni base de datos**. Esto es un requisito de diseño, no una casualidad: `getEnv()`, `getDb()` y `getAuth()` son todos perezosos y con memoización, y `getServerSession()` llama a `headers()` _antes_ de acceder a la configuración. Una compilación que requiriera secretos significaría que la aplicación no podría compilarse ni verificarse en CI sin aprovisionar primero una base de datos.

Dos reglas de orden lo hacen posible, ambas aprendidas al romperlas — consulte
[ADR 0002](docs/adr/0002-authentication.md):

- `headers()` debe llamarse antes que `getAuth()`. Una llamada escrita como
  `getAuth().api.getSession({ headers: await headers() })` evalúa el receptor primero, por lo que la validación de entorno se ejecuta durante el prerender y la compilación falla con el error engañoso "falta `DATABASE_URL`".
- `features/auth/actions.ts` debe comenzar con `'use server'`. Sin ello, un componente cliente que importe la acción arrastra `next/headers` al bundle del cliente.
  `tsc` no informa nada; solo la compilación falla.

#### Lo que NO se ha verificado, y por qué es importante

**Nunca se ha ejecutado código contra una base de datos.** Según la restricción del Sprint 1, no se inició ningún contenedor y **no se ejecutó ninguna migración**. Por ello, lo siguiente está escrito y pasado por typecheck, pero no se ha probado en tiempo de ejecución:

- El SQL generado en `packages/db/drizzle/`, incluyendo la extensión `citext` y el trigger de solo adición;
- El mapeo entre Drizzle y el esquema de Better Auth en ambas direcciones;
- El hash con argon2id al coste configurado;
- Todos los caminos de registro, inicio de sesión y cierre de sesión, incluyendo el comportamiento de enumeración y bloqueo de cuentas.

Considere el flujo de autenticación como **no probado hasta que se ejecute al menos una vez contra PostgreSQL**. El razonamiento en el código es deliberado y, cuando se ha podido comprobar, se verificó contra el código fuente de Better Auth instalado — pero leer el código fuente de una biblioteca no es ejecutarlo.

### Requisitos previos

- **Node.js 22** o superior — consulte [`.nvmrc`](.nvmrc). La versión está fijada por una razón.
- **pnpm 10.25.0** — la versión está fijada en `package.json` mediante `packageManager`.
  Con Corepack habilitado: `corepack enable && corepack prepare pnpm@10.25.0 --activate`
- **Docker** con Compose v2+.
- Un cliente de `git`. **No hay commits en este repositorio aún**.

### Configuración

```powershell
# 1. Instalar dependencias (funciona cuando existen los paquetes del workspace)
pnpm install

# 2. Crear el archivo de entorno local y completar AUTH_SECRET
Copy-Item .env.example .env
# Generar un secreto con:  openssl rand -base64 32

# 3. Iniciar la infraestructura local (funciona hoy)
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps

# 4. Ejecutar la aplicación en modo desarrollo
pnpm dev
```

Interfaz web: <http://localhost:3000> · Bandeja de Mailpit: <http://localhost:8025>

### Detención

```powershell
docker compose -f infra/docker-compose.dev.yml down      # detener contenedores, conservar datos
docker compose -f infra/docker-compose.dev.yml down -v   # detener y eliminar volúmenes
```

### Migraciones

**No se ha ejecutado ninguna migración.** El esquema está documentado en
[docs/database.md](docs/database.md), y cualquier migración que afecte a las tablas que allí se enumeran requiere **la aprobación del propietario antes de escribirse**. Las migraciones se aplican con drizzle-kit contra `DATABASE_URL`.

---

## Documentación

| Documento                                              | Qué proporciona                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [docs/roadmap.md](docs/roadmap.md)                     | Hoja de ruta autoritativa: sprints, entregables, criterios de salida y lo diferido.                               |
| [docs/architecture.md](docs/architecture.md)           | Los tres desplegables, flujos de solicitud y análisis, fronteras de confianza y diagrama.                         |
| [docs/database.md](docs/database.md)                   | Todas las tablas y columnas, decisiones del DDL y puntos de contacto con la base de datos que requieren decisión. |
| [docs/security.md](docs/security.md)                   | Modelo de amenazas. Seis elementos innegociables, cada uno con su estado.                                         |
| [docs/decisions-pending.md](docs/decisions-pending.md) | Preguntas abiertas pendientes de resolución.                                                                      |
| [docs/changelog.md](docs/changelog.md)                 | Registro continuo de lo que ha cambiado.                                                                          |
| [docs/adr/](docs/adr/)                                 | Architecture Decision Records — por qué el sistema tiene esta forma.                                              |
| [infra/README.md](infra/README.md)                     | La pila local de Docker.                                                                                          |

Dos reglas evitan que la documentación se desactualice: el **alcance** vive en
[docs/roadmap.md](docs/roadmap.md), y la **arquitectura** vive en
[docs/adr/](docs/adr/). Si otro documento entra en contradicción con alguno de ellos, prevalecen esos dos.

---

## Decisiones abiertas

Cuatro preguntas están pendientes del propietario y se enumeran en detalle en
[docs/decisions-pending.md](docs/decisions-pending.md):

1. **Texto de la interfaz en español o en inglés** — el código y la documentación son en inglés por contrato;
   el idioma de la interfaz de usuario aún no se ha decidido.
2. **Verificación de correo antes del primer inicio de sesión** — ¿debe ser obligatoria o permitirse con límites?
3. **Cuota de análisis para el tier gratuito en el MVP** — depende del coste real de los análisis a partir del Sprint 2.
4. **Periodo de retención de los resultados de análisis** — es más barato diseñarlo en las tablas del Sprint 2 que corregirlo posteriormente.

La pregunta sobre el alojamiento de la base de datos **está resuelta**: PostgreSQL 18 local mediante pgAdmin 4,
documentado en
[docs/local-postgres-setup.md](docs/local-postgres-setup.md).

La multi-tenencia y la facturación se difieren deliberadamente a partir del Sprint 4+ — consulte
[ADR 0005](docs/adr/0005-deferred-multi-tenancy.md).

---

## Contribución

- **Commits convencionales.** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`, `build:`, `ci:`. Tipos `refactor:`, `perf:` o `feat!:` para cambios que rompen compatibilidad.
- **Inglés para todo lo técnico.** Código, identificadores, comentarios, documentación,
  mensajes de commit y texto de la interfaz se escriben en inglés. Los artefactos del repositorio son artefactos técnicos; no se escriben en el idioma de la conversación.
- **Sin atribución de IA en los commits.** Sin trailers `Co-Authored-By`, sin líneas generadas por IA en los mensajes de commit y sin pies de página con nombres de herramientas.
- **Formatear antes de hacer commit.** `pnpm check` ejecuta lint, typecheck y
  `format:check`. El formato se aplica con Prettier; no se debe ajustar manualmente el espaciado.
- **Un cambio de decisión por commit.** Un commit que cambie comportamiento y refactorice código no relacionado no es revisable.
- **Los cambios en el esquema necesitan aprobación del propietario.** Lea
  [docs/database.md](docs/database.md#puntos-de-contacto-en-la-db--se-requiere-decisión-del-propietario)
  primero y obtenga la aprobación antes de escribir la migración.
- **Las nuevas decisiones arquitectónicas requieren un ADR.** Copie el formato de seis secciones de
  [docs/adr/README.md](docs/adr/README.md).
- **Nunca incluir secretos en el repositorio.** Añada la variable a `.env.example`,
  genere el valor localmente y deje `.env` sin rastrear.

---

## Licencia

Aún no se ha especificado. Todos los derechos reservados hasta que el propietario elija una licencia.
