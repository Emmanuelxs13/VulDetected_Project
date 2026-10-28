# Seguridad

Modelo de amenazas de VulDetected. Sembrado en el Sprint 1 para la ejecución en
el Sprint 2.

Este documento es una lista de **condiciones innegociables** con un estado de
mitigación explícito para cada ítem. Un ítem sin estado es un error de este
documento.

## Valores de estado

| Estado                    | Significado                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `Done`                    | Implementado y verificado en el código base.                                               |
| `Open (planned Sprint N)` | No implementado. Nombrado, acotado y programado — deliberadamente no se omite en silencio. |
| `Open (Sprint 1)`         | En curso en el sprint actual.                                                              |

---

## 1. Verificación de propiedad del dominio — precondición legal

**Estado:** `Done (Sprint 2)` — el mecanismo de propiedad está implementado y
probado en `apps/web/src/features/scans/`: emisión de challenge, verificación por
DNS `TXT` y por `/.well-known/`, y el guard estructural `requireVerifiedDomain`
(DO-2, DO-3, DO-4 y DO-5 con pruebas Vitest). `submitScanAction` invoca el guard
**antes** de insertar la fila y de encolar, aplica el límite de 5 escaneos por
hora y usuario, y audita `scan.enqueued` / `scan.failed`. La auditoría de
`domain.ownership.*` cubre la emisión del challenge y la verificación exitosa.

**Amenaza.** VulDetected escanea aplicaciones web a solicitud. Si un usuario
puede enviar cualquier hostname, el producto es un servicio de escaneo de
sistemas de terceros — lo cual es ilegal en la mayoría de las jurisdicciones
independientemente de la intención, y es el camino más rápido hacia una queja
por abuso, una entrada en una lista de bloqueo o una orden judicial.

Esto es un **requisito legal, no una función de seguridad.** Ninguna cantidad de
limitación de tasa ni de puntuación de abuso lo sustituye.

**Mitigación.** La propiedad debe demostrarse _antes de encolar cualquier
trabajo_:

- **Token `TXT` de DNS** — el usuario coloca un token generado en
  `_vuldetected.<domain>`. Nosotros lo consultamos y lo comparamos.
- **Archivo `/.well-known/`** — el usuario publica un archivo generado en una
  ruta bien conocida y nosotros lo recuperamos.

Cualquiera de los dos métodos basta; soportar ambos cuesta poco y cubre dominios
en los que el otro no es práctico. La prueba se persiste con su método, el
registro que la verificó y una marca de tiempo.

**La salvaguarda es código, con pruebas — no una convención.** La ruta de
encolado debe ser estructuralmente incapaz de ejecutarse sin una fila `domains`
verificada. Una prueba afirma que todo intento de encolar sin una prueba falla.

## 2. Endurecimiento SSRF

**Estado:** `Done (Sprint 2)` — la tabla de reglas está implementada y probada en
los dos lados (`apps/web/src/lib/ssrf.ts` con Vitest;
`services/scanner/scanner/ssrf.py` con pytest) y el cliente de salida del worker
(`services/scanner/scanner/egress.py`) aplica timeouts, redirects manuales y el
modo `strict`. Queda un matiz de implementación en el pin de la conexión, anotado
al final de esta sección.

**Amenaza.** El objetivo del escaneo lo aporta el usuario. Sin controles, es una
primitiva clásica de falsificación de solicitudes del lado del servidor apuntada
contra la infraestructura que el worker puede alcanzar: endpoints de metadatos de
la nube (`169.254.169.254`) que filtran credenciales, servicios en `127.0.0.1`,
paneles de administración internos y hosts RFC1918.

El worker tiene una salida _deliberadamente amplia_ — debe alcanzar objetivos
arbitrarios —, de modo que la salvaguarda no puede ser "no exponemos nada
interesante". No puede serlo.

**Mitigación.**

- **Resolver el DNS y luego validar la dirección resuelta.** Validar la cadena
  del hostname no sirve de nada; la cadena la controla el atacante, la dirección
  no.
- **Rechazar** loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`,
  `fe80::/10` — incluidos los metadatos de la nube), rangos privados (`10/8`,
  `172.16/12`, `192.168/16`) y sus equivalentes IPv6. Rechazar el loopback IPv6
  importa tanto como IPv4: una verificación solo IPv4 la elude `::1`.
- **Revalidar después de cada redirección.** Una URL permitida que redirige a
  `169.254.169.254` elude por completo cualquier verificación única. Cada salto
  se resuelve y se vuelve a comprobar; las cadenas de redirección están acotadas.
- **Puertos restringidos.** Lista cerrada `80/443` (`ALLOWED_PORTS`), chequeada
  antes de consultar el DNS; ampliarla exige cambiar la tabla de reglas y sus
  dos suites de pruebas.
- **Rebinding de DNS.** Resolver una vez, fijar la dirección validada para la
  conexión y no volver a resolver a mitad de la solicitud hacia una respuesta
  distinta. El guard Node lo hace así (`safeFetch` conecta a la IP fijada y
  conserva `Host`/SNI). En el worker Python la validación se repite en cada salto,
  pero `httpx` abre la conexión por URL; el pin de socket no está aplicado (ver el
  hallazgo al final de esta sección).
- **Tiempos de espera y límites de concurrencia** por objetivo, de modo que un
  objetivo lento no pueda ocupar una ranura del worker. El cliente usa connect
  5 s / read 15 s / write 5 s / pool 5 s; el worker corre con `--concurrency=2` y
  `worker_prefetch_multiplier=1`, de modo que un objetivo lento ocupa como mucho
  una de las dos ranuras.

### Tabla de reglas (contrato único, D6)

Una sola tabla, dos implementaciones: `apps/web/src/lib/ssrf.ts` (Vitest) y
`services/scanner/scanner/ssrf.py` (pytest). Ambas suites afirman caso por caso
esta tabla; si una regla cambia, cambia aquí primero y después en los dos lados.

| #   | Regla                                | Detalle                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Validar la dirección, no el hostname | La cadena la controla el atacante; la dirección es lo que se marca.                                                                                                                                                                                                                             |
| 2   | Bloquear tras resolver               | IPv4: `0.0.0.0/8`, `10/8`, `127/8` (loopback), `169.254/16` (link-local y metadatos cloud), `172.16/12`, `192.168/16`, `224/4` (multicast). IPv6: `::/128`, `::1/128`, `fe80::/10`, `fc00::/7`, `ff00::/8` (multicast). Una dirección no parseable se rechaza: falla cerrada, nunca se permite. |
| 3   | IPv4-mapped cae a IPv4               | `::ffff:127.0.0.1` y su forma hex `::ffff:7f00:1` se normalizan a `127.0.0.1` y vuelven a pasar por la tabla IPv4.                                                                                                                                                                              |
| 4   | Solo literales canónicos             | Si el host es un literal IP: IPv4 dotted-decimal canónico (se rechazan decimal `2130706433`, octal `0177.0.0.1`, hex `0x7f000001`, corto `127.1`, cola con punto) o IPv6 canónico en minúsculas y comprimido RFC 5952 (se rechazan `0:0:0:0:0:0:0:1`, grupos rellenos y zone ids).              |
| 5   | Conjunto completo, pin único         | Se resuelve una sola vez, se valida TODA la respuesta A/AAAA — una sola dirección bloqueada rechaza el host, que es exactamente el patrón rebinding — y se fija la primera pública. La conexión va a esa IP con `Host`/SNI = hostname original; no se re-resuelve a mitad de petición.          |
| 6   | Redirects manuales                   | `follow_redirects=false` y bucle propio, máximo **5 saltos**; cada salto re-resuelve, re-valida y re-fija con esta misma tabla antes de abrir conexión.                                                                                                                                         |
| 7   | Solo puertos `80` y `443`            | Lista cerrada `ALLOWED_PORTS`, chequeada antes de ningún DNS.                                                                                                                                                                                                                                   |
| 8   | Solo `http`/`https`                  | Otros esquemas → rechazo `unsupported_scheme`; URL inválida → `invalid_url`.                                                                                                                                                                                                                    |
| 9   | Timeouts del transporte              | connect 5 s / read 15 s en el guard Node; el cliente de salida del worker replica ambos en el task 4.4.                                                                                                                                                                                         |

**Verificado por pruebas, no por inspección.** Las suites `apps/web` (Vitest:
`src/lib/ssrf.test.ts`) y `services/scanner` (pytest: `tests/test_ssrf.py`)
cubren intentos de elusión por redirección, por IPv6, por respuesta DNS
rebinding y por puertos fuera de la lista; una prueba que pasa es la evidencia
de que el control funciona.

**Hallazgo abierto (Sprint 2).** El guard Node fija la IP validada, pero el
cliente de salida del worker resuelve y valida cada URL y cada redirect y luego
deja que `httpx` resuelva de nuevo al conectar. Entre la validación y la conexión
existe una ventana de rebinding de DNS; cerrarla exige conectar a la IP fijada
(transporte con `lookup` o `socket` fijado) y preservar `Host`/SNI. Hasta
entonces, la defensa del worker es la revalidación por salto, no el pin. El
worker corre aislado y sin credenciales de base de datos (§3), lo que acota el
impacto de una conexión equivocada.

## 3. Aislamiento de red y de sistema de archivos del worker

**Estado:** `Done (Sprint 2)` — el servicio `scanner` de
`infra/docker-compose.dev.yml` aplica las condiciones de esta sección.

**Amenaza.** El worker ejecuta herramientas de escaneo de terceros contra
objetivos elegidos por el atacante. Un compromiso ahí está a un paso del resto de
la plataforma.

**Mitigación.**

- **Red separada.** El worker vive en la red `vuldetected-scanner`, compartida
  solo con Redis, y no tiene puerto publicado: no alcanza PostgreSQL ni Mailpit.
  La red no puede ser `internal: true` porque el worker debe salir a internet.
  En desarrollo se añade `host.docker.internal` para llegar a la web que corre
  con `pnpm dev`; es una concesión del entorno local, no del despliegue.
- **Sin credenciales de la base de datos en el worker.** Consume trabajos y
  publica resultados por un canal estrecho. Un worker que puede escribir en
  `users` o `sessions` tiene el radio de impacto de todo el producto.
- **Sistema de archivos raíz de solo lectura**, `tmpfs` en `/tmp`, con el proceso
  como UID 1000 (`user: '1000:1000'`). Un escáner que escribe en su propia imagen
  es un mecanismo de persistencia.
- **Capacidades retiradas** (`cap_drop: ALL`) y `no-new-privileges:true`.
- **Sin montajes del sistema de archivos ni de sockets del host.** El servicio no
  declara `volumes`; montar el socket de Docker dentro del worker equivaldría a
  ser root en el host.
- **Límites de recursos** — 2 CPU y 1 GB de memoria en el compose, más un
  `timelimit` duro de 300 s por tarea en el mensaje Celery.
- **Sin acceso a shell desde la ruta de solicitud.** Los checks del Sprint 2 son
  Python puro: no hay `subprocess` ni argumentos de shell. Cuando lleguen Nuclei
  y ZAP, sus argumentos deberán pasarse como argv, nunca como una cadena.

## 4. Seguridad de la sesión

**Estado:** `Partially done` — implementado en el Sprint 1, con un riesgo
residual aceptado registrado en [Hallazgos abiertos](#hallazgos-abiertos-sprint-1)

**Amenaza.** Secuestro de sesión mediante exposición de la base de datos, robo de
cookies mediante XSS, CSRF y fijación de sesión.

### Lo que realmente está implementado

- **Contraseñas hasheadas con argon2id** mediante `@node-rs/argon2` —
  memory-hard, binarios precompilados, sin `node-gyp` en Windows. 19 MiB /
  2 iteraciones / paralelismo 1 (los mínimos de OWASP), y una entrada limitada a
  128 caracteres para que el hash memory-hard no pueda usarse como vector de
  amplificación.
- **`HttpOnly`** — JavaScript no puede leer la cookie de sesión, la mitigación
  única más fuerte contra el robo de tokens por XSS.
- **`SameSite=Lax`** — bloquea la falsificación de solicitudes entre sitios en
  las subpeticiones mientras sigue permitiendo la navegación de nivel superior,
  que los enlaces de verificación por correo exigen.
- **`Secure`** derivado del esquema de `AUTH_URL`. No es `true` fijo en el
  código, porque una cookie `Secure` fija en el código se descarta en silencio
  en `http://localhost`, lo que se ve exactamente como un inicio de sesión roto
  y solo en desarrollo.
- **Caducidad absoluta de siete días**, renovada como máximo una vez al día.
  Absoluta, no deslizante: una ventana deslizante significa que una cookie robada
  que se sigue presentando nunca caduca, lo que elimina la propiedad que hace
  recuperable el robo de cookies.
- **La revocación es real**, porque las sesiones viven en la base de datos —
  cerrar la sesión elimina la fila; una sesión revocada no se puede reproducir.
- **La autorización se vuelve a comprobar en la capa de datos**, nunca se delega
  solo al middleware — ver
  [architecture.md](./architecture.md#tb2-navegador--servidor-nextjs).
- **`AUTH_SECRET` tiene 32 bytes o más**, generado localmente y nunca
  versionado.
- **El estado de la cuenta se controla en la creación de la sesión.** Un hook
  `before` de `databaseHooks.session.create` rechaza crear una sesión para una
  cuenta `suspended`/`deleted` o con un bloqueo no vencido. Se ejecuta antes de
  persistir la fila, que es el único punto en el que rechazar todavía significa
  algo.

### El token de sesión se guarda en claro y eso es una brecha real

`sessions.token` almacena el token de sesión **en crudo**. Un borrador anterior
de este documento afirmaba que guardaba un resumen SHA-256 en una columna
`token_hash`. **Eso estaba mal**, y el error fue nuestro, no el de la
biblioteca — la columna no existe en el esquema. Se corrige aquí en lugar de
dejar una frase tranquilizadora en lugar de un control que nunca se construyó.

La causa es una restricción de ida y vuelta en Better Auth `1.7.7`, verificada
contra el código instalado:

1. Better Auth **genera** el token.
2. Lo **hashea** con SHA-256 para decidir qué almacenar.
3. **Almacena el resumen** y luego **devuelve `{ token, session }` construido a
   partir de la cláusula `RETURNING`** — es decir, el resumen, no el token.
4. Deriva la cookie de ese valor devuelto.

Así que un hook de hash al escribir escribe el resumen y la cookie termina
llevando el resumen. El navegador tendría un valor que el servidor no puede
buscar, y cada inicio de sesión fallaría en la siguiente solicitud sin ningún
error en el punto en que se produjo el fallo.

**Por qué se acepta para el Sprint 1 en lugar de sortearlo:**

- La alternativa es un adaptador parcheado a mano o una dependencia bifurcada.
  Un parche local frágil sobre una biblioteca de autenticación es un resultado
  peor que un riesgo documentado: hace parecer que el problema está resuelto y
  se rompe en silencio al actualizar.
- La exposición está acotada. Un volcado de la base de datos produce tokens de
  sesión, pero la cookie es `HttpOnly` + `SameSite=Lax` + `Secure` en
  producción, así que explotar esto requiere acceso de lectura a la base de
  datos, que es una brecha previa en sí misma.
- Está acotada en el tiempo: caducidad absoluta de siete días, y la revocación
  es inmediata.

**Qué debe ocurrir antes de cualquier lanzamiento público** — registrado en
[ADR 0002](./adr/0002-authentication.md):

- Reevaluar en cada actualización menor de Better Auth y buscar una opción de
  hash de primera parte antes que nada.
- Preferir una corrección upstream a un parche local si alguna vez se ofrece.
- Hasta entonces, tratar `sessions.token` como un secreto: restringir el acceso
  a los volcados y nunca pegar una fila de esa tabla en una incidencia, un
  registro o una captura de pantalla.

### Hallazgos abiertos (Sprint 1)

| Hallazgo                                                                                                                                        | Severidad | Estado                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens de sesión guardados sin hashear (arriba)                                                                                                 | Media     | Aceptado para el Sprint 1; revisar antes del lanzamiento público                                                                                                                                               |
| `audit_logs.ip` proviene de `x-forwarded-for` y está **sin verificar** — `advanced.trustedProxyHeaders` es `false`                              | Baja      | Aceptado: las filas de auditoría son explícitamente telemetría no relacionada con seguridad. Bloquea cualquier uso forense                                                                                     |
| La IP del cliente se lee en crudo desde `x-forwarded-for` en las acciones de autenticación, de modo que la controla el atacante y puede ser una | Baja      | Aceptado para el Sprint 1; un valor malformado hace que la fila de auditoría se descarte por la conversión `inet` en lugar de provocar un error                                                                |
| Sin bloqueo de cuenta en la ruta de registro (por diseño — permitiría que cualquiera bloqueara a una víctima)                                   | Info      | Deliberado; la limitación de tasa del endpoint de registro es el control que corresponde ahí                                                                                                                   |
| Verificación de correo no exigida antes del primer inicio de sesión                                                                             | Info      | Decisión de producto abierta, `docs/decisions-pending.md`                                                                                                                                                      |
| Sin Content-Security-Policy                                                                                                                     | Media     | Abierta — aplazada deliberadamente; una CSP adivinada rompe el arranque en línea de Next o se "arregla" con `unsafe-inline`, que no es una política. Medir primero en modo solo informe. Ver `next.config.ts`. |
| Sin limitación de tasa por IP en el registro                                                                                                    | Media     | Parcialmente cerrada en el Sprint 2: el catch-all de Better Auth limita 30/15 min por IP (incluye registro). Falta el límite por IP en el envío de escaneos                                                    |

## 5. Secretos nunca en git

**Estado:** `Done`

**Amenaza.** Una credencial versionada es una credencial. Un `.env` en git es una
filtración de credenciales, y rotarla no deja de haberla filtrado — el historial
la conserva.

**Mitigación.**

- **`.gitignore` cubre `.env`, `.env.local`, `.env.*.local` y vuelve a incluir
  explícitamente `!.env.example`.** Solo el archivo de ejemplo — que no debe
  contener ningún valor real — está versionado.
- **`.env.example` es la fuente única de verdad** para los nombres de variables,
  y cada valor en él está vacío o es un valor por defecto de desarrollo local.
- **Los secretos se generan, no se redactan.** `AUTH_SECRET` se crea localmente
  con `openssl rand -base64 32`.
- **Las credenciales provienen del entorno en tiempo de ejecución**, nunca de
  constantes, fixtures ni valores por defecto de pruebas que podrían migrar a
  código de producción.
- **Ninguna credencial llega al navegador.** Las variables `NEXT_PUBLIC_*` son
  públicas por definición y se tratan como tales.
- **Los registros de auditoría nunca registran secretos** — sin contraseñas,
  tokens, cookies ni cabeceras de autorización en `audit_logs.metadata`.

## 6. Limitación de tasa

**Estado:** `Partially done` — el bloqueo por cuenta (Sprint 1) y el limitador de
ventana fija sobre Redis (Sprint 2) están implementados, con fallo cerrado. Queda
abierto el límite **por IP en el envío de escaneos**; el de autenticación ya está
aplicado.

**Amenaza.** Los endpoints sin limitación invitan al relleno de credenciales, al
spray de contraseñas, al agotamiento de recursos mediante el envío de escaneos y
a la enumeración.

### Implementado en el Sprint 1

- **Bloqueo progresivo por cuenta**, no una prohibición plana. Un bloqueo plano
  de 30 minutos tras 5 intentos es un arma de denegación de servicio: cualquiera
  que conozca el correo de una víctima puede bloquearla indefinidamente fallando
  cinco veces, para siempre.

  | Intentos fallidos | Bloqueo    |
  | ----------------- | ---------- |
  | 5                 | 1 minuto   |
  | 8                 | 15 minutos |
  | 11+               | 1 hora     |

- **El incremento es atómico.** `failed_login_count = failed_login_count + 1` lo
  evalúa Postgres con `RETURNING`, de modo que la lectura y la escritura son una
  sola sentencia. Esto no es una preferencia de estilo: en la versión anterior de
  leer y luego escribir, N solicitudes concurrentes leían el mismo valor y
  escribían todas el mismo valor incrementado, así que la escalera nunca avanzaba
  y **las solicitudes paralelas eludían el límite por completo**.
- **Un inicio de sesión exitoso reinicia el contador**, de modo que un usuario
  real que corrige un error de dedo no arrastra los fallos de ayer.
- **El estado de la cuenta se impone en la creación de la sesión**, de modo que
  un bloqueo no se puede esquivar golpeando el endpoint de sesión en lugar del
  formulario de inicio de sesión.
- **Deliberadamente NO se aplica a la ruta de registro.** Ese formulario no está
  autenticado y elude el limitador de tasa del inicio de sesión; dejar que
  incremente el contador le daría a cualquiera que pueda enviar un formulario una
  forma de bloquear a una víctima arbitraria — exactamente la denegación de
  servicio que la escalera existe para prevenir.
- **Fallo cerrado**: un bloqueo devuelve el mismo mensaje genérico que cualquier
  otro fallo de autenticación, de modo que no puede usarse para confirmar que una
  dirección está registrada.

### Implementado en el Sprint 2

- **Limitador de ventana fija sobre Redis** (`lib/rate-limit.ts`). La clave es
  explícita, de modo que cada ruta elige su dimensión: `ip:<ip>:auth` en el
  catch-all de Better Auth (30 intentos / 15 min) y `user:<id>:scan` en
  `submitScanAction` (5 escaneos / hora). Un escaneo es un control de costos
  tanto como un control de abuso.
- **Fallo cerrado.** Si Redis no responde, el limitador lanza `RateLimitError` y
  la ruta responde 429/503 en lugar de dejar pasar la solicitud.

### Aún abierto (Sprint 2)

- **El envío de escaneos no tiene límite por IP.** Solo se aplica el límite por
  usuario; un atacante con muchas cuentas gratuitas puede multiplicar el costo.
  El diseño D4 prevé 20/hora por IP; falta conectarlo en `submitScanAction`.
- **Interacción señalada:** argon2id es lento a propósito, lo que hace de la
  limitación de tasa una mitigación real de denegación de servicio y no una
  higiene opcional. La verificación con señuelo de trabajo constante en las
  direcciones desconocidas hereda este costo a propósito, y se memoriza por
  proceso para que no pueda convertirse en un vector de amplificación.

## 7. Autenticación del callback y autorización del progreso

**Estado:** `Done (Sprint 2)`

**Amenaza.** El worker reporta por HTTP a la web. Sin autenticación, cualquiera
que conozca el id de un escaneo podría inyectar eventos o hallazgos en un escaneo
ajeno. El progreso se lee por SSE: sin autorización, un id —que no es secreto—
expondría el historial de otro usuario, incluidos los hosts escaneados.

**Mitigación.**

- **Secreto compartido en el header `Authorization`.** Tanto
  `POST /api/scans/{id}/events` como `POST /api/scans/{id}/callback` exigen
  `Bearer <SCANNER_CALLBACK_SECRET>`. Ausente o incorrecto → 401; el escaneo
  desconocido → 404; el cuerpo inválido → 400.
- **Comparación en tiempo constante.** Se usa `crypto.timingSafeEqual`, con una
  comprobación previa de longitud porque la función lanza si los buffers difieren
  de tamaño. El secreto se lee del entorno de ambos procesos y **nunca viaja por
  el broker** ([TB4]); si no está configurado, la ruta responde 401 en vez de
  aceptar.
- **Idempotencia como parte del contrato.** `UNIQUE (scan_id, seq)` +
  `ON CONFLICT DO NOTHING` absorben los reintentos de progreso, y
  `UNIQUE (scan_id, finding_key)` evita duplicar hallazgos. Un callback terminal
  repetido responde `{ok, already_applied: true}` sin escribir nada.
- **Autorización de lectura.** `GET /api/scans/{id}/events` exige sesión (401) y
  comprueba que el escaneo pertenece a un dominio del usuario (403). La página
  `/scans/{id}` aplica el mismo filtro en la consulta, no solo en la UI.
- **El estado solo lo mueve la web.** El worker informa, pero no escribe
  `scans.status` ni `findings`: la transición a `running` y el cierre terminal
  ocurren dentro de las rutas autenticadas ([TB3], SP-2).

Un id de escaneo es un identificador, no una capacidad: la autorización se
comprueba contra la fila de `domains`, no contra el conocimiento del UUID.

---

## Controles adicionales registrados aquí

| Control                                                      | Estado                    | Notas                                                                                                                            |
| ------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Rastro de auditoría para eventos de seguridad (OWASP A09)    | `Done` (esquema)          | `audit_logs` es solo-append; se puebla durante los flujos de autenticación del Sprint 1.                                         |
| Autorización impuesta en la capa de datos                    | `Done (Sprint 2)`         | Cada ruta valida la sesión y el SSE filtra por dueño del dominio; no se confía en el middleware.                                 |
| La severidad nunca se comunica solo con color (WCAG 1.4.1)   | `Done` (diseño)           | Color + icono + texto en cada insignia de severidad; ver [ADR 0003](./adr/0003-design-tokens-and-color-budget.md).               |
| Prueba automatizada de contraste para la paleta de severidad | `Open (planned Sprint 1)` | Define lo que significa "contraste garantizado"; una violación hace fallar la compilación.                                       |
| La tabla de hallazgos no contiene credenciales               | `Open (planned Sprint 2)` | La salida de la herramienta puede incluir cabeceras de autenticación o tokens del objetivo; debe depurarse antes de almacenarla. |
| XSS almacenado en el contenido de remediación                | `Open (planned Sprint 3)` | La remediación incluye ejemplos de código renderizados; la ruta de renderizado no debe inyectar HTML.                            |
| Comprobaciones de secuestro de dominio                       | `Open (planned Sprint 3)` | Advertencia: los registros DNS colgantes en dominios verificados se convierten en un vector de escaneo e informe.                |

## Deliberadamente fuera del alcance del MVP

Se registra para que su ausencia sea una decisión y no un descuido:

- WAF / limitación de tasa en el borde (delegado a la plataforma de despliegue).
- Protección DDoS (pre preocupación de la plataforma).
- Controles de aislamiento multitenancy (aplazados hasta el Sprint 4+ — ver
  [ADR 0005](./adr/0005-deferred-multi-tenancy.md)).
- Prueba de penetración formal de terceros (post-MVP, antes del lanzamiento
  público).

## Trade-off CA-02 (Almacenamiento de token de sesión)

**Contexto (CA-02):** En la implementación actual con Better Auth `1.7.7`, el token de sesión se almacena **en claro** en `sessions.token` (ver §4). El hash propuesto en borradores no es aplicable directamente por el flujo de generación/almacenamiento de Better Auth.

**Trade-off aceptado (Sprint 1):**
- **Ventaja:** Evita parche frágil sobre la librería de autenticación (adaptador bifurcado) que se rompería en actualizaciones y podría dar falsa sensación de seguridad.
- **Riesgo:** Volcado de BD expone tokens de sesión. Mitigado con `HttpOnly`, `SameSite=Lax`, `Secure` en producción, caducidad absoluta 7 días, renovación limitada, revocación inmediata (eliminación de fila) y restricción de acceso a volcados.
- **Condición de salida:** Reevaluar en cada actualización menor de Better Auth y migrar a hash de primera parte si aparece soporte upstream. Hasta entonces, tratar `sessions.token` como secreto.

## Lista exacta de variables (despliegue/producción)

Las variables leídas por código/Compose. Las marcadas **REQUERIDAS** hacen fallar el arranque si faltan (`${VAR:?}`).

### Base de datos
| Variable | Requerida | Descripción |
|---|---|---|
| `POSTGRES_USER` | Sí | Usuario de Postgres (stack compose) |
| `POSTGRES_PASSWORD` | Sí | Contraseña de Postgres (**cambiar antes del primer arranque**) |
| `POSTGRES_DB` | Sí | Nombre de base de datos |
| `DATABASE_URL` | Sí | `postgresql://user:pass@host:5432/db?schema=public` |

### Autenticación
| Variable | Requerida | Descripción |
|---|---|---|
| `AUTH_SECRET` | Sí | Secreto para firmar sesiones (>= 32 bytes). `openssl rand -base64 32` |
| `AUTH_URL` | Sí | Origen público con esquema, sin barra final (OAuth/correos) |
| `NEXT_PUBLIC_APP_URL` | No | Copia pública de `AUTH_URL` para componentes cliente |

### Email / SMTP
| Variable | Requerida | Descripción |
|---|---|---|
| `SMTP_HOST` | Sí | Servidor SMTP (producción requiere real) |
| `SMTP_PORT` | No | Puerto SMTP (default 587) |
| `SMTP_USER` | No | Usuario SMTP |
| `SMTP_PASSWORD` | No | Contraseña SMTP |
| `SMTP_SECURE` | No | `true` solo para TLS implícito en 465, `false` para STARTTLS 587 |
| `EMAIL_FROM` | Sí | Remitente (debe estar verificado por proveedor) |
| `MAIL_DISPATCH_SECRET` | Sí | Bearer para `POST /api/mail/dispatch` (>= 16 chars). `openssl rand -base64 32` |

### Scanner / Worker
| Variable | Requerida | Descripción |
|---|---|---|
| `SCANNER_CALLBACK_SECRET` | Sí | Secreto compartido web ↔ worker/scheduler (Bearer). Nunca por broker. |
| `SCANNER_CALLBACK_BASE_URL` | No | URL base para callbacks (Compose usa `http://web:3000`) |
| `SCANNER_EGRESS_MODE` | No | `strict` (default) o `test` (solo fixtures). **Nunca** `test` en prod. |
| `CELERY_BROKER_URL` | No | Broker Redis (Compose usa `redis://redis:6379/0`) |

### Redis / Colas
| Variable | Requerida | Descripción |
|---|---|---|
| `REDIS_URL` | No | URL Redis para rate-limit/cancelación (Compose usa `redis://redis:6379/0`) |

### Cifrado / Credenciales escaneos
| Variable | Requerida | Descripción |
|---|---|---|
| `CREDENTIALS_ENCRYPTION_KEY` | Sí | Clave para cifrado de credenciales (32 bytes). Generar con cuidado. |

### OAuth (opcional)
| Variable | Requerida | Descripción |
|---|---|---|
| `GOOGLE_CLIENT_ID` | No | OAuth Google |
| `GOOGLE_CLIENT_SECRET` | No | OAuth Google |
| `GITHUB_CLIENT_ID` | No | OAuth GitHub |
| `GITHUB_CLIENT_SECRET` | No | OAuth GitHub |

### Scheduler / Logging
| Variable | Requerida | Descripción |
|---|---|---|
| `SCHEDULER_BASE_URL` | No | Base URL scheduler→web (`http://web:3000` en Compose) |
| `SCHEDULER_INTERVAL_MS` | No | Intervalo scheduler (default 60000) |
| `LOG_LEVEL` | No | Nivel de logs (default `info`) |

**Notas:**
- `.env.prod` debe estar git-ignorado (ver `.gitignore`). Nunca commitear secretos.
- Variables `NEXT_PUBLIC_*` son públicas por definición.
- En CI se usan valores dummy para el smoke test (ver `.github/workflows/ci.yml`).
