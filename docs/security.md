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

**Estado:** `Open (planned Sprint 2)`

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

**Estado:** `Open (planned Sprint 2)`

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
- **Puertos restringidos.** Una lista de permitidos explícita (80, 443 y lo que
  una plantilla concreta de escaneo necesite legítimamente). Sin puertos
  arbitrarios.
- **Rebinding de DNS.** Resolver una vez, fijar la dirección validada para la
  conexión y no volver a resolver a mitad de la solicitud hacia una respuesta
  distinta.
- **Tiempos de espera y límites de concurrencia** por objetivo, de modo que un
  objetivo lento no pueda ocupar una ranura del worker.

**Verificado por pruebas, no por inspección.** El conjunto de pruebas debe
incluir intentos de elusión mediante redirección y mediante IPv6; una prueba que
pasa es la evidencia de que el control funciona.

## 3. Aislamiento de red y de sistema de archivos del worker

**Estado:** `Open (planned Sprint 2)`

**Amenaza.** El worker ejecuta herramientas de escaneo de terceros contra
objetivos elegidos por el atacante. Una comprometimiento ahí está a un paso del
resto de la plataforma.

**Mitigación.**

- **Red separada con salida filtrada.** El worker alcanza internet (debe
  hacerlo), pero no la base de datos, ni las credenciales del broker Redis en un
  archivo legible, ni la red privada del host.
- **Sin credenciales de la base de datos en el worker.** Consume trabajos y
  publica resultados por un canal estrecho. Un worker que puede escribir en
  `users` o `sessions` tiene el radio de impacto de todo el producto.
- **Sistema de archivos raíz de solo lectura**, `tmpfs` en `/tmp`. Un escáner
  que escribe en su propia imagen es un mecanismo de persistencia.
- **Capacidades retiradas**, `no-new-privileges`.
- **Sin montajes del sistema de archivos ni de sockets del host.** Acceder al
  socket de Docker dentro del worker equivale a ser root en el host.
- **Límites de recursos** — CPU, memoria y un tiempo de espera duro por escaneo.
- **Sin acceso a shell desde la ruta de solicitud.** La entrada del usuario
  nunca debe llegar a una cadena de shell; los argumentos se pasan como un
  arreglo argv.

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
| Sin limitación de tasa por IP en las acciones de autenticación ni en el registro                                                                | Media     | Abierta, planificada en el Sprint 2. El bloqueo por cuenta está implementado y no cubre estas rutas                                                                                                            |

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

**Estado:** `Partially done` — el bloqueo por cuenta está implementado en el
Sprint 1; la limitación global por IP sigue `Open (planned Sprint 2)`

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

### Aún abierto (Sprint 2)

- **La limitación por IP no está implementada.** El limitador integrado de Better
  Auth usa como clave solo el endpoint de inicio de sesión; la ruta de Server
  Action y el endpoint de registro no están cubiertos por él.
- **El envío de escaneos tiene limitación de tasa** — por usuario y por IP. Un
  escaneo es un control de costos tanto como un control de abuso: un escaneo es
  caro y el atacante puede no ser el cliente.
- **Fallo cerrado ante indisponibilidad del limitador.** Si el limitador no está
  disponible, el endpoint queda cerrado en lugar de abierto.
- **Interacción señalada:** argon2id es lento a propósito, lo que hace de la
  limitación de tasa una mitigación real de denegación de servicio y no una
  higiene opcional. La verificación con señuelo de trabajo constante en las
  direcciones desconocidas hereda este costo a propósito, y se memoriza por
  proceso para que no pueda convertirse en un vector de amplificación.

---

## Controles adicionales registrados aquí

| Control                                                      | Estado                    | Notas                                                                                                                            |
| ------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Rastro de auditoría para eventos de seguridad (OWASP A09)    | `Done` (esquema)          | `audit_logs` es solo-append; se puebla durante los flujos de autenticación del Sprint 1.                                         |
| Autorización impuesta en la capa de datos                    | `Open (planned Sprint 1)` | No solo middleware.                                                                                                              |
| La severidad nunca se comunica solo con color (WCAG 1.4.1)   | `Done` (diseño)           | Color + icono + texto en cada insignia de severidad; ver [ADR 0003](./adr/0003-design-tokens-and-color-budget.md).               |
| Prueba automatizada de contraste para la paleta de severidad | `Open (planned Sprint 1)` | Define lo que significa "contraste garantizado"; una violación hace fallar la compilación.                                       |
| La tabla de hallazgos no contiene credenciales               | `Open (planned Sprint 2)` | La salida de la herramienta puede incluir cabeceras de autenticación o tokens del objetivo; debe depurarse antes de almacenarla. |
| XSS almacenado en el contenido de remediación                | `Open (planned Sprint 3)` | La remediación incluye ejemplos de código renderizados; la ruta de renderizado no debe inyectar HTML.                            |
| Comprobaciones de secuestro de dominio                       | `Open (planned Sprint 3)` | Advertencia: los registros DNS colgantes en dominios verificados se convierten en un vector de escaneo e informe.                |

## Deliberadamente fuera del alcance del MVP

Se registra para que su ausencia sea una decisión y no un descuido:

- WAF / limitación de tasa en el borde (delegado a la plataforma de despliegue).
- Protección DDoS (preocupación de la plataforma).
- Controles de aislamiento multitenancy (aplazados hasta el Sprint 4+ — ver
  [ADR 0005](./adr/0005-deferred-multi-tenancy.md)).
- Prueba de penetración formal de terceros (post-MVP, antes del lanzamiento
  público).
