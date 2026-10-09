# Registro de cambios

Todos los cambios notables de VulDetected se registran aquí. Este es el registro
continuo de lo que cambió — la hoja de ruta dice lo que _va a_ ocurrir; este
archivo dice lo que _ocurrió_.

El formato sigue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) y este
proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
a partir de `0.1.0`.

## [Sin publicar]

Base del Sprint 1 — **completa y verificada de extremo a extremo** contra el
servidor local de PostgreSQL 18.3. El primer commit llega con este hito.

La aplicación está conectada a una base de datos real y toda la superficie de
autenticación fue ejercitada: la prueba de humo de 15 pasos de
[`local-postgres-setup.md`](./local-postgres-setup.md) pasa 17/17 contra un
servidor en ejecución, y los comportamientos de oráculo de enumeración y de
bloqueo progresivo se confirmaron además a mano. El runbook registra esto como
ejecutado hasta §5.

### Cambiado

- **Migraciones de la base de datos ejecutadas por primera vez.** Los tres
  archivos se aplicaron en orden contra la base de datos local `vuldetected`:
  `0000` (citext), `0001` (cinco tablas, claves foráneas, doce índices), `0002`
  (trigger solo-append sobre `audit_logs`). Verificado consultando
  `information_schema` para las tablas y `udt_name` sobre `users.email`,
  `pg_trigger` para `audit_logs_append_only`, y mediante un intento de `UPDATE`
  sobre `audit_logs` confirmando que fue rechazado. El runbook registra esto
  como ejecutado hasta §5.
- **Correcciones de documentación encontradas al verificar el esquema.** Los
  valores de enum esperados en `docs/database.md`, `docs/changelog.md` y el
  runbook discrepaban del SQL generado: `account_status` es
  `pending`/`active`/`suspended`/`deleted` (no `pending_verification`), y
  `token_purpose` es `verify_email`/`reset_password`/`domain_ownership` (no
  `email_verification`/`password_reset`). Una lista de verificación que nombra
  valores que la base de datos no contiene envía al lector a buscar un fallo que
  no existe, así que volvió a ganar el SQL.
- **`docs/database.md` incorporó la sección `accounts` que faltaba.** La tabla
  que guarda el hash argon2id era la única del esquema sin documentación
  columna por columna — precisamente la más probable de malinterpretarse como si
  perteneciera a `users`.

- **Decisión de alojamiento de la base de datos revertida: PostgreSQL 18 local
  mediante pgAdmin 4, no Supabase.** El Sprint 1 se verifica contra el servidor
  PostgreSQL 18.3 que ya corre en la máquina de desarrollo (puerto 5432, servicio
  `postgresql-x64-18`). Nada del código cambia — el ADR 0004 mantiene todo el
  acceso a la base de datos detrás de `DATABASE_URL`, de modo que esto es una
  cadena de conexión, no una migración. Supabase queda documentado como el
  camino alternativo para cuando se quiera un proveedor gestionado. El análisis
  del pooler (`Session` 5432 frente a `transaction` 6543) sigue aplicándose si
  Supabase se adopta más adelante; un servidor local no tiene pooler en absoluto.
  Ver [`docs/local-postgres-setup.md`](./local-postgres-setup.md).
- `docs/decisions-pending.md` corrigió dos referencias de esquema obsoletas:
  `users.email_verified_at` es en realidad el booleano `users.email_verified`, y
  `account_status` tiene por defecto `active`, no `pending` (la verificación de
  correo está desactivada en el Sprint 1, de modo que aún no existe ninguna ruta
  de transición).

### Cambiado (continuación)

- **Sprint 1 verificado de extremo a extremo contra PostgreSQL 18.3.** El
  esquema de cinco tablas en una base de datos real, tablas propiedad del rol
  `vuldetected` de mínimo privilegio en pgAdmin (la propiedad se movió fuera del
  superusuario `postgres`, runbook §4b), y el flujo de autenticación probado
  sobre HTTP: registro, cookie de sesión (`HttpOnly`, `SameSite=Lax`,
  `Path=/`), inicio de sesión, `Invalid email or password` idéntico para correo
  desconocido y contraseña incorrecta, control de sesión en la página del panel
  y cierre de sesión — prueba de humo 17/17.
- **`features/auth` se dividió en cuatro módulos cohesivos.** `actions.ts` (616
  líneas, seis responsabilidades) es ahora `actions.ts` (solo las tres server
  actions), `lockout.ts` (máquina de estados de la escalera de bloqueo
  progresivo), `request.ts` (cabeceras/IP), y `sign-in.ts` (envoltorio de
  credenciales + señuelo de sincronización). Movimiento puro, verificado byte a
  byte contra una copia de seguridad por un verificador independiente — no
  cambió ninguna lógica.
- **El lint era un no-op; ahora es real.** El repositorio no tenía ESLint en
  ninguna parte, de modo que `pnpm lint` ejecutaba cero tareas y `pnpm check`
  no validaba nada en esa pata. Se añadió la configuración plana de ESLint 9
  mediante `FlatCompat` que puentea `eslint-config-next`
  (`next/core-web-vitals` + `next/typescript`; la línea 15.x no tiene entrada
  plana). Los 30 archivos lintables ya estaban limpios; `lint` es
  `eslint . --max-warnings=0` en `apps/web`.
- **Muro servidor/cliente impuesto con `server-only`.** `lib/env.ts`,
  `lib/db.ts`, `lib/audit.ts`, `lib/password.ts`, `lib/auth.ts` y los tres
  módulos auxiliares de autenticación empiezan ahora con
  `import 'server-only';` de modo que un bundle de cliente ya no puede importar
  por accidente credenciales ni acceso a la base de datos. Verificado con
  `next build`.

### Añadido

- `docs/local-postgres-setup.md` — **runbook de verificación del Sprint 1 (en
  uso).** Inventario del entorno de lo que realmente está instalado en la
  máquina (versión del servidor, puertos en escucha, confianza de `citext`,
  `psql` ausente en el PATH, que es como una comprobación anterior concluyó
  erróneamente que faltaba Postgres), creación del rol de acceso y de la base de
  datos mediante pgAdmin 4 con una alternativa en SQL, los tres archivos de
  migración ejecutados en orden con el razonamiento de ese orden, consultas de
  verificación del esquema, una prueba de solo-append para `audit_logs`, el
  `.env.local` de la aplicación, la prueba de humo de 15 pasos — con las pruebas
  de oráculo de enumeración y de bloqueo señaladas como criterios de aceptación —
  desmontaje, solución de problemas y una lista explícita de lo que **no**
  demuestra.
- `docs/supabase-setup.md` — runbook de verificación del Sprint 1 (camino
  alternativo): creación del proyecto, selección de la cadena de conexión con la
  tabla comparativa de poolers, codificación en URL de la contraseña,
  migraciones, consultas de verificación del esquema, una prueba de solo-append
  para `audit_logs`, una prueba de humo manual de 15 pasos que cubre las dos
  pruebas de oráculo de enumeración que importan, desmontaje, una tabla de
  solución de problemas y una lista explícita de lo que el runbook **no**
  demuestra. Marcado como reemplazado.
- `docs/codebase-map.md` — estructura del repositorio, las reglas de
  importación (quién puede importar a quién), el muro `server-only`, la tabla de
  decisión de "qué va dónde" y los puntos de extensión donde aterrizan los
  Sprints 2–3. Indexado desde `docs/README.md` y enlazado desde
  `docs/architecture.md`.

**Esqueleto del monorepo**

- `package.json` de la raíz (privado, `vuldetected`) con los scripts `dev`,
  `build`, `lint`, `typecheck`, `format`, `format:check` y `check`, fijados a
  `pnpm@10.25.0` y Node `>=22`.
- `pnpm-workspace.yaml` que cubre `apps/*` y `packages/*`. El servicio Python en
  `services/scanner` queda deliberadamente excluido — se construye y se ejecuta
  solo mediante Docker.
- `turbo.json` con las tareas `build`, `dev`, `lint` y `typecheck`. `build` y
  `typecheck` dependen de `^build`; las salidas son `dist/**` y `.next/**`
  excluyendo `.next/cache/**`.
- `.editorconfig` (UTF-8, LF, 2 espacios, nueva línea final, espacios finales
  recortados), `.prettierrc.json` (semi, comillas simples, ancho 100, comas
  finales, lista de plugins vacía), `.prettierignore` y `.nvmrc` fijado a Node 22.
- `.gitignore`. Señala dos excepciones deliberadas: `.atl/` **no** está
  ignorado (configuración del proyecto versionada), y
  `packages/db/drizzle/meta/_journal.json` **sí** está versionado (Drizzle Kit
  lo necesita para reproducir las migraciones). Los archivos `.env` se ignoran
  mientras `!.env.example` está versionado.

**Contrato de entorno**

- `.env.example` como fuente única de verdad de las variables de entorno,
  agrupadas como Database / Auth / Email (dev) / Scanner (Sprint 2) / Logging,
  con una cabecera que explica que adoptar Supabase requiere reemplazar solo
  `DATABASE_URL`.

**Infraestructura local**

- `infra/docker-compose.dev.yml` — Postgres 16 (contenedor
  `vuldetected-postgres`, volumen con nombre, healthcheck `pg_isready`), Mailpit
  (SMTP 1025, interfaz web 8025) y Redis 7 (appendonly, volumen con nombre,
  reservado para el worker de Celery del Sprint 2). Todos los puertos se enlazan
  solo a localhost. El servicio `scanner` está **intencionalmente ausente**, con
  sus restricciones de aislamiento preregistradas como un bloque de comentarios
  en lugar de un esqueleto vacío.
- `infra/README.md` — cómo ejecutar la pila, por qué Postgres corre en Docker
  (no hay cliente `psql` local en esta máquina) y cómo `localhost:5432` se mapea
  a la cadena de conexión de Supabase.

**Architecture Decision Records** (`docs/adr/`)

- `0001-monorepo-and-runtime-split.md` — pnpm + Turborepo; Next.js App Router es
  el único backend del producto (no NestJS, porque un segundo backend TS duplica
  autenticación, CORS, despliegue y secretos sin beneficio para el MVP); el
  servicio Python existe únicamente para orquestar Nuclei/ZAP mediante Celery.
- `0002-authentication.md` — Better Auth con el adaptador de Drizzle y
  correo+contraseña; argon2id mediante `@node-rs/argon2` (binarios precompilados,
  sin los problemas de node-gyp en Windows); tokens de sesión guardados
  hasheados; cookies `HttpOnly` + `SameSite=Lax`. Registra por qué se rechazó el
  proveedor Credentials de Auth.js (sin tabla de usuarios, obligando a usuarios
  hechos a mano y a un almacenamiento de sesiones ad hoc).
- `0003-design-tokens-and-color-budget.md` — tokens semánticos definidos una sola
  vez en `@theme` de Tailwind v4, sin dispersión de `dark:`, el presupuesto de
  color de ≈95% de neutros / ≤3% de iris de marca, colores de severidad a partir
  de los pasos 9/10 de Radix con una prueba automatizada de contraste en lugar
  de una suposición, y nunca solo color (WCAG 1.4.1).
- `0004-database-provider-neutrality.md` — sin nombres de host de Docker fijos
  en el código, sin rutas de socket unix locales, sin extensiones además de
  `citext` y `gen_random_uuid()`; todo a través de `DATABASE_URL`; migraciones
  mediante drizzle-kit contra esa URL. Consecuencia: el cambio entre Postgres
  local ↔ Supabase es un solo cambio de variable de entorno.
- `0005-deferred-multi-tenancy.md` — sin `organization_id` en el Sprint 1, con
  la justificación (costo especulativo de esquema ahora frente a un `ALTER TABLE`
  posterior) y el disparador para la reconsideración.

**Documentación**

- `docs/roadmap.md` — el plan autoritativo. Tabla de sprints con entregables y
  criterios de salida por sprint, una sección de decisiones aplazadas (Supabase
  vs PostgreSQL local como **sin resolver pero reducido a un cambio de
  `DATABASE_URL`**, multitenancy aplazada a S4+, facturación, escaneo
  programado) y una leyenda de estados.
- `docs/database.md` — el esquema del Sprint 1 tabla por tabla (`users`,
  `sessions`, `verification_tokens`, `audit_logs`) con cada columna, tipo,
  anulabilidad, valor por defecto y la razón por la que existe cada columna
  sensible; las decisiones DDL ya tomadas (`citext`, `account_status`,
  `token_purpose`, `gen_random_uuid()`); los índices y por qué existe cada uno;
  y una prominente sección **"Puntos de contacto en la DB — se requiere decisión
  del propietario"** que lista lo que cambiarán S2, S3 y S4, indicando que se
  debe notificar al propietario _antes_ de redactar una migración y que **no se
  ha ejecutado ninguna migración**.
- `docs/architecture.md` — los tres desplegables, el flujo de solicitudes de
  registro e inicio de sesión, el flujo de escaneo previsto, las fronteras de
  confianza TB1–TB6 y un diagrama ASCII.
- `docs/security.md` — modelo de amenazas sembrado para el Sprint 2. Las seis
  condiciones innegociables: verificación de la propiedad del dominio como
  precondición legal, endurecimiento SSRF (resolución DNS, rechazo de rangos
  privados/link-local/loopback, revalidación después de cada redirección, puertos
  restringidos), aislamiento del worker (salida filtrada, sistema de archivos de
  solo lectura), seguridad de la sesión, secretos nunca en git y limitación de
  tasa — cada una con un estado `Open (planned Sprint N)` o `Done`.
- `docs/decisions-pending.md` — preguntas abiertas de producto y de técnica a la
  espera del propietario.
- `docs/README.md` — índice de documentación.
- `README.md` de la raíz — propuesta de valor, estado, principios de seguridad,
  tabla de stack, estructura del repositorio, inicio rápido (con una afirmación
  explícita de lo que funciona hoy), índice de documentación, decisiones
  abiertas y convenciones de contribución.

### Corregido

Defectos de seguridad encontrados por revisión durante la implementación del
Sprint 1. Los tres eran invisibles para `tsc` y se habrían publicado.

- **El bloqueo de cuenta podía eludirse con solicitudes paralelas.**
  `recordFailure` leía `failed_login_count`, lo incrementaba en JavaScript y
  escribía el total. Las solicitudes concurrentes leían todas el mismo valor y
  escribían todas el mismo valor incrementado, de modo que la escalera de bloqueo
  progresivo nunca avanzaba — un atacante que enviaba solicitudes en paralelo
  nunca recibía limitación alguna. Ahora es una única sentencia atómica
  (`failed_login_count = failed_login_count + 1`) con `RETURNING`, de modo que
  la base de datos serializa la lectura y la escritura y la decisión de la
  escalera usa el valor persistido.
- **Cada inicio de sesión fallido escapaba como un error no controlado.** La API
  de servidor de Better Auth _lanza_ `APIError` con credenciales incorrectas en
  lugar de devolver un resultado falso (verificado en el
  `dist/api/routes/sign-in.mjs` instalado). El código probaba
  `if (!result?.user?.id)` — una rama que jamás podía ejecutarse. Una contraseña
  incorrecta lanzaba por lo tanto fuera de la Server Action en lugar de
  incrementar el contador, y eso era lo que hacía alcanzable el error anterior:
  adivinación ilimitada de contraseñas, con el límite de errores global
  renderizado en lugar del mensaje genérico.
- **La página de registro era un oráculo de enumeración de cuentas.** El mismo
  lanzamiento hacía que una dirección duplicada con una contraseña incorrecta se
  comportara de forma visiblemente distinta de un registro nuevo, reinstalando
  exactamente la filtración que los comentarios circundantes describían como
  cerrada. Ambos sitios de llamada pasan ahora por un envoltorio
  `signInEmailSafe` que absorbe solo `APIError` y vuelve a lanzar todo lo demás,
  de modo que una falla real no se disfraza de contraseña incorrecta.
- **`trustedOrigins` estaba configurado en el lugar equivocado.** Anidado bajo
  `advanced`, pasaba la comprobación de tipos y se ignoraba en silencio en tiempo
  de ejecución — `getTrustedOrigins` lee `options.trustedOrigins` de nivel
  superior. Se movió, y el hueco `advanced` ahora lleva
  `trustedProxyHeaders: false`, que es la opción que realmente gobierna
  `x-forwarded-for` (y cuyo valor por defecto el código anterior dejaba al
  azar).
- **El nombre "opcional" del registro era obligatorio.** `FormData.get('name')`
  devuelve `''` para una entrada en blanco, no `null`, de modo que `?? undefined`
  no lo convertía y el esquema lo rechazaba. Ahora se convierte, incluidos los
  valores formados solo por espacios.
- **`session.freshAge` estaba desfasado en un factor de sesenta** respecto de su
  propio comentario (`60 * 30` son 1800 segundos, documentados como 30). Se fijó
  en 15 minutos con el valor y la justificación declarados juntos.
- **La hoja de estilos CSS no compilaba** porque un comentario contenía un glob
  recursivo; el `*/` dentro de `**/` cerraba el comentario antes de tiempo.
  Documentado en el lugar para que no se reintroduzca.

### Cambiado

- **Migraciones consolidadas en una base limpia de tres archivos**
  (`0000_enable_citext`, `0001_auth_and_audit_schema`,
  `0002_audit_logs_append_only`). No se había ejecutado nada, de modo que un
  `0003` correctivo habría implicado una historia que nunca ocurrió. `citext` es
  su propia migración porque `users.email` se emite como `"citext"` y el tipo
  debe existir en el momento de `CREATE TABLE`.
- `users.name` es ahora `NOT NULL` — `signUpEmail` de Better Auth requiere un
  nombre, de modo que una columna anulable contradecía el contrato de la
  biblioteca. El formulario sigue siendo opcional porque se deriva la parte local
  del correo.
- `accounts_provider_account_key` es ahora un índice **único**; era un índice
  simple, que permitía filas duplicadas para una misma identidad de proveedor.
- `audit_logs.action` es `varchar(64)`, acorde al vocabulario de acciones, y
  `audit_logs_created_at_idx` es `DESC` porque todo el patrón de acceso es "lo
  más reciente primero".
- Se reemplazaron los índices parciales `users_active_idx` /
  `users_active_email_idx` por `users_status_idx` y un parcial
  `users_locked_until_idx`.
- `verification.storeIdentifier: 'hashed'` — la columna identificador se
  almacenaba en claro, ya que el valor por defecto de la biblioteca es
  `"plain"`.
- El cierre de sesión ahora redirige, en lugar de dejar al usuario en una página
  para la que ya no está autenticado.
- Se añadieron cabeceras de seguridad base (`nosniff`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`), verificadas presentes contra un
  servidor en ejecución.
- Se eliminó un script huérfano `lint: "eslint ."` de `packages/ui`; no hay
  dependencia ni configuración de ESLint en el repositorio, de modo que el script
  solo podía fallar.

### Añadido

**Aplicación web (`apps/web`)**

- Aplicación Next.js App Router con toda la superficie de autenticación:
  registro, inicio de sesión, cierre de sesión y un panel. Sin middleware — la
  autorización se impone en la capa de datos, según la frontera de confianza
  documentada.
- Server Actions para las tres mutaciones, con `'use server'` y errores
  genéricos.
- Bloqueo progresivo por cuenta, una verificación argon2 con señuelo de trabajo
  constante para que una dirección desconocida no sea mediblemente más rápida que
  una contraseña incorrecta, y una negativa deliberada a incrementar el contador
  en la ruta de registro (sería una herramienta para eludir el bloqueo).
- La autoridad de sesión en un solo lugar, con `cache()` para la deduplicación
  por solicitud.
- `getEnv()` / `getDb()` / `getAuth()` diferidos y memorizados, de modo que
  `next build` funciona sin `.env` y sin base de datos. Verificado.
- Límites de error, de no encontrado y de carga; una página `/dev/sprint-1` que
  informa del estado construido frente a declarado en lugar de afirmar que las
  funciones existen.

**Capa de datos (`packages/db)`**

- Cinco tablas con nombres en plural, un mapeo explícito del modelo de Better Auth
  y las relaciones centralizadas en `schema/relations.ts` para mantener los
  módulos de tablas sin ciclos.
- Código de conexión neutral respecto del proveedor: solo `DATABASE_URL`, sin
  suposiciones de host, puerto ni socket.
- Una conexión agrupada por proceso, mediante `createPool` / `bindDb` /
  `createDb`.
- `audit_logs` solo-append, impuesto por un trigger a nivel de sentencia que es
  portable entre contenedores y proveedores gestionados.

**Correcciones de documentación**

- `docs/security.md`, `docs/database.md`, el ADR 0002 y el `README` de la raíz
  afirmaban que los tokens de sesión se almacenaban como resúmenes en una columna
  `token_hash`. **Jamás existió tal columna.** Los cuatro se corrigieron para
  indicar que el token se guarda en crudo, por qué Better Auth `1.7.7` lo
  obliga, las alternativas rechazadas y la condición de revisión. Un documento de
  diseño que describe un control que no se construyó es el modo de fallo
  concreto que este proyecto debe detectar.
- La sección "What works today" del `README.md` se reescribió contra comandos
  realmente ejecutados, incluida una afirmación explícita de que ningún código se
  ha ejecutado contra una base de datos y de que el flujo de autenticación está
  sin probar hasta que así sea.

## [Hoja de ruta relevante sin publicar]

El Sprint 2 continúa: entrega de correo (Mailpit), que activa
`verification_tokens` y obliga a resolver primero su columna `value` en crudo;
limitación de tasa por IP; y el flujo de verificación `domain_ownership`, que es
una precondición legal y no una función.
