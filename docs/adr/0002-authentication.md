# ADR 0002: Autenticación

- **Estado:** Aceptada
- **Fecha:** Sprint 1

## Contexto

El Sprint 1 debe entregar una autenticación funcional con correo + contraseña.
Las propiedades innegociables:

- **Las contraseñas nunca se almacenan en forma recuperable.** Una filtración de
  la base de datos no debe producir credenciales utilizables.
- **Los tokens de sesión tampoco se almacenan de forma recuperable.** La base de
  datos es un objetivo de mayor valor que el tarro de cookies de sesión, de modo
  que una columna de token en texto plano convierte una inyección SQL de solo
  lectura en secuestro completo de sesión.
- **La configuración funciona en una estación de trabajo Windows sin
  compilador.** Un desarrollador no debería necesitar Visual Studio Build Tools
  ni WSL para registrar una cuenta.
- **Las sesiones son autoritativas en el servidor.** Cada solicitud protegida
  valida contra Postgres. Una cookie firmada pero no validada no es una sesión.

Dos restricciones acotaron el campo significativamente: estamos en Node 22 con
Postgres, y ya decidimos Drizzle como capa de datos (ver
[ADR 0001](./0001-monorepo-and-runtime-split.md) y
[ADR 0004](./0004-database-provider-neutrality.md)).

## Decisión

### Better Auth con el adaptador de Drizzle, solo correo + contraseña

- **Better Auth** provee el esquema, el ciclo de vida de sesiones y el adaptador
  de Drizzle, de modo que los registros de sesión y de cuenta siguen el
  contrato de una librería en lugar de algo armado a mano.
- **Solo correo + contraseña para el Sprint 1.** Los proveedores sociales
  (Google, GitHub) son del Sprint 4+ según el
  [roadmap](../roadmap.md#sprint-4--aplazado).
- **Hasheo de contraseñas con argon2id a través de `@node-rs/argon2`.** argon2id
  es el algoritmo de hasheo de contraseñas que OWASP recomienda actualmente:
  resistente en memoria, con salt, y resistente tanto al descifrado por GPU
  como a los ataques de comparación por canal lateral. La distribución
  `@node-rs/` incluye **binarios nativos predeterminados** para Windows, macOS y
  Linux, lo que elimina `node-gyp` y su requisito de Build Tools del camino de
  configuración.

### Los tokens de sesión se almacenan hasheados — REVISADA, esta decisión no se sostuvo

> **Esta decisión se revirtió durante la implementación del Sprint 1, y la
> inversión fue impuesta por la librería en lugar de elegida.** El texto
> original se conserva debajo de la corrección para que el registro muestre qué
> se creía y por qué, no solo qué es cierto.

**La decisión tal como se escribió originalmente, que resultó ser
inimplementable:**

- El token de sesión en crudo existe **solo** en la cookie del usuario.
- Postgres almacena `sessions.token_hash` — un digesto SHA-256 del token en
  crudo — nunca el token mismo.
- La búsqueda es por hash, de modo que un volcado de base de datos robado produce
  hashes que no pueden reproducirse como cookies.

**Por qué falló.** El supuesto era que Better Auth generaría un token en crudo,
lo entregaría a la cookie y almacenaría otra cosa. Verificado contra la versión
instalada `1.7.7`, hace exactamente el orden inverso:

1. Better Auth **genera** el token en crudo.
2. Lo **hashea** con SHA-256 para decidir qué almacenar.
3. **Inserta el digesto** y luego construye su valor de retorno a partir de la
   cláusula `RETURNING` de la base de datos — que devuelve el _digesto_, no el
   token.
4. Deriva la cookie de sesión de ese mismo valor devuelto.

Entonces el token "devuelto" por Better Auth es el hash. Un hook
`databaseHooks.session.create.after` que hasheara el valor antes del insert
almacenaría `hash(hash(token))` y le entregaría al navegador `hash(token)`. En la
siguiente solicitud el servidor buscaría `hash(token)`, no lo encontraría y
rechazaría una sesión que se había creado correctamente milisegundos antes. No
existe ningún hook en el momento del insert que pueda evitar esto, porque el
valor que la cookie debe contener no es el valor que la aplicación controla en el
momento del insert.

**La decisión tal como se implementó:**

- `sessions.token` contiene el token **en crudo**. No existe la columna
  `token_hash`, y el esquema nunca la tuvo.
- La propiedad se acota y se compensa en lugar de eliminarse: expiración
  absoluta de 7 días (sin renovación silenciosa), `HttpOnly`, `SameSite=Lax`,
  `Secure` en producción, revocación inmediata en el servidor al cerrar sesión,
  y validación del estado de la cuenta en la creación de la sesión.
- La exposición está acotada por exigir acceso previo de lectura a la base de
  datos — un volcado de la base de datos es una brecha previa, no un camino
  hacia una.

**Alternativas rechazadas:**

- **Parchear o bifurcar el adaptador.** Rechazada: una librería de
  autenticación parcheada a mano falla en silencio al actualizarse, y además
  _parecería_ que el problema estaba resuelto. Eso es peor que una brecha
  documentada, porque el siguiente ingeniero hereda falsa confianza en lugar de
  un riesgo conocido.
- **Almacenar un digesto en una segunda columna y conservar el token en crudo
  para la búsqueda.** Rechazada: reintroduce el token en crudo en la base de
  datos, de modo que el riesgo del volcado — toda la razón de la decisión
  original — no cambia, mientras el esquema se vuelve más complejo.

**Condición de revisión:** reevaluar en cada actualización menor de Better Auth y
buscar primero una opción de hasheo de primera parte. Hasta entonces, trate
`sessions.token` como un secreto — restrinja el acceso a volcados y nunca pegue
una fila suya en un issue, un log ni una captura de pantalla.

Seguimiento como hallazgo abierto en
[security.md](../security.md#4-seguridad-de-la-sesión).

### Los tokens de verificación se hashean donde la librería lo permite

La misma limitación **no** se aplica a `verification_tokens`, y la distinción
merece registrarse porque demuestra que la restricción es específica y no
global.

- `identifier` **sí** se hashea, mediante
  `verification.storeIdentifier: 'hashed'`. La librería tiene `"plain"` como
  valor por defecto, de modo que dejarlo como estaba habría almacenado cada
  dirección en claro. La ruta de búsqueda aplica la misma transformación, y eso
  es lo que hace que las filas hasheadas sigan siendo localizables.
- `value` se almacena **en crudo**. `createVerificationValue` solo hashea el
  identifier y deja pasar el resto del payload sin tocar; la opción `storeToken`
  que lo cubriría pertenece al plugin de magic link, no a la verificación de
  correo principal.

Se acepta porque la tabla está actualmente inerte: `sendOnSignUp` es `false` y el
Sprint 1 no tiene mailer, así que nada escribe una fila de verificación. Debe
resolverse antes de que se envíe el primer correo de verificación en el Sprint 2.

### Las cookies son httpOnly y SameSite=Lax

- **`HttpOnly`** — JavaScript no puede leer la cookie de sesión. Es la
  mitigación más eficaz contra el robo de tokens vía XSS.
- **`SameSite=Lax`** — la cookie no se envía en las subpeticiones cross-site, lo
  que bloquea el vector clásico de request forgery cross-site a la vez que
  permite que funcionen las navegaciones de nivel superior (un enlace de
  verificación enviado por correo).
- `Secure` en todo entorno que no sea local; se omite localmente solo porque
  `http://localhost` no es un contexto seguro.
- `AUTH_SECRET` debe tener 32 bytes o más. Se genera localmente y nunca se
  versiona.

## Consecuencias

**Beneficios aceptados**

- La configuración funciona en Windows sin toolchain nativa. No es un lujo: elimina
  la razón más común por la que una configuración de autenticación en JS se
  atasca en una máquina nueva.
- Una librería es dueña del ciclo de vida de sesiones, de modo que la rotación,
  la expiración y la revocación de cookies siguen una implementación revisada
  en lugar de código a medida.
- El adaptador de Drizzle mantiene las tablas de autenticación en el mismo
  esquema y el mismo historial de migraciones que el resto del producto — sin un
  juego de tablas paralelo administrado a mano.

**Costos aceptados**

- **Los tokens de sesión se almacenan sin hashear.** Es el costo más significativo
  de esta decisión, y es una consecuencia directa del ciclo de tokens de Better
  Auth `1.7.7`, no un atajo tomado por conveniencia. Una compromiso de la base
  de datos produce tokens de sesión vivos en lugar de digestos inertes. Se
  compensa con expiración absoluta de 7 días, revocación inmediata, cookies
  `HttpOnly`/`SameSite=Lax`/`Secure` y validación del estado de la cuenta en la
  creación de la sesión — pero no se elimina. Esto debe resolverse, o aceptarse
  formalmente con los ojos abiertos, antes de cualquier lanzamiento público.
- **`verification_tokens.value` está sin hashear** por la misma razón
  estructural, aunque la tabla queda inerte hasta que llegue el correo del
  Sprint 2.
- **Better Auth es dueño de la forma de `users`, `sessions` y
  `verification_tokens`.** El control a nivel de columna es parcial, y desviarse
  de sus expectativas es una fuente de fallos sutiles. `verification_tokens`
  existe en el Sprint 1 en gran parte porque la librería lo espera, aunque la
  exigencia de correo verificado es una pregunta abierta de producto (ver
  [decisions-pending.md](../decisions-pending.md#3-se-exige-la-verificación-de-correo-antes-del-primer-inicio-de-sesión)).
- **argon2id es lentitud intencional.** El inicio de sesión y el registro son
  deliberadamente más costosos que un hash-y-comparar. Ése es el punto, y hace
  que la limitación de tasa en los endpoints de autenticación sea obligatoria y
  no opcional — ver [`docs/security.md`](../security.md).
- **`@node-rs/argon2` es un módulo nativo**, de modo que los destinos de
  despliegue deben ser linux-x64 o linux-arm64 (o win32 para desarrollo local)
  con prebuilds coincidentes. Una plataforma sin prebuild recurre a una
  compilación desde el código fuente.
- Una dependencia más en la ruta de autenticación. Aceptado: escribir
  autenticación a mano es exactamente la categoría de código que no debe
  improvisarse.

**También requerido por Better Auth, y fácil de pasar por alto**

- **El plugin `nextCookies()`.** Sin él, llamar a `auth.api.*` desde una Server
  Action descarta `Set-Cookie` en silencio: el inicio de sesión "tiene éxito",
  no se lanza ningún error y la siguiente solicitud no tiene sesión. Ésa es la
  peor forma de bug disponible — sin excepción, sin línea de log, y un reporte
  de bug que solo dice "el login no funciona".
- **`'use server'` al principio del módulo de la Server Action.** Sin él, un
  componente de cliente que importa la action arrastra `next/headers` dentro del
  bundle de cliente. La compilación falla con un error sobre Server Components
  que apunta al archivo equivocado, y `tsc` no reporta absolutamente nada.
- **`advanced.database.generateId: 'uuid'`.** Nuestras claves primarias son
  `uuid DEFAULT gen_random_uuid()`. El generador de id por defecto de Better
  Auth produce una cadena alfanumérica de 32 caracteres, que Postgres rechaza
  para una columna `uuid` — de modo que cada registro daría error 500. Con
  `'uuid'` configurado, Better Auth omite `id` del INSERT y deja que el valor
  por defecto de la base de datos lo provea, colocando la autoridad de la
  unicidad en Postgres, donde una restricción puede hacerla cumplir.
- **`nextCookies` y `'use server'` son estructurales, no de estilo.** Los tres
  puntos anteriores se verificaron contra el paquete instalado en lugar de
  inferirse de la documentación.

## Alternativas consideradas

### Auth.js (NextAuth) con el proveedor Credentials — **rechazada**

Rechazada, y la razón es estructural y no cuestión de gusto:

- **No provee una tabla de usuarios.** El proveedor Credentials no crea ni es
  dueño de un modelo de usuario. Registrar un usuario requiere por lo tanto una
  tabla `users` armada a mano más lógica de registro armada a mano, y la
  documentación misma de Auth.js trata esto como territorio administrado por el
  usuario.
- **Fuerza un almacenamiento de sesiones ad-hoc.** Con Credentials y sesiones en
  base de datos hay que cablear usted mismo una tabla de sesiones y un
  adaptador, que es precisamente la maquinaria crítica en materia de seguridad
  que debería venir de una implementación mantenida.
- **El flujo de credentials es un pie-trampa documentado.** La guía misma de
  NextAuth trata los credentials como algo que requiere cuidado extra (hasheo,
  cookies seguras, sesiones en base de datos). Auth.js fomenta activamente los
  proveedores OAuth, que es exactamente lo contrario de lo que el Sprint 1
  necesita — y es la razón por la que el camino de credentials mantenidas en el
  núcleo es más delgado que los caminos OAuth.
- **La combinación degrada a autenticación armada a mano con una librería en el
  medio.** Ése es lo peor de ambos mundos: la superficie de ataque de una
  autenticación a medida más una capa extra de configuración que mantener en
  sincronía.

Para un MVP cuya superficie de autenticación completa es correo + contraseña,
Auth.js Credentials nos da la menor estructura con el mayor código a medida.

### Implementar nuestras propias sesiones con cookies firmadas

Rechazada. Implementar usted mismo su propia sesión es un camino bien trillado
hacia bugs sutiles de reproducción, rotación y fijación. El costo de esta
decisión es una dependencia; el costo de hacerlo mal es un bypass de
autenticación. Use la implementación revisada.

### bcrypt en lugar de argon2id

Rechazada. bcrypt no es resistente en memoria y es amigable para GPU; argon2id es
la recomendación actual de OWASP. bcrypt además está implementado en JavaScript
puro y es _más rápido_, lo cual en un contexto de contraseñas es una
desventaja.

### Almacenar tokens de sesión en crudo (el camino amigable por defecto)

**Rechazada como elección — y luego impuesta como restricción.** Fueron dos
conclusiones separadas que al principio se confundieron, y mantenerlas apartes es
lo que importa:

- **Rechazada por sus méritos.** Si la columna del token es legible, cada inyección
  SQL, cada filtración de backup o cada volcado accidental se convierte en robo
  de sesión instantáneo. En sus propios términos esta opción es correcta y
  merece un costo real para hacerse bien.
- **Impuesta por la librería.** Cada ruta del lado de la aplicación hacia ese
  resultado resultó estar bloqueada por el ciclo de tokens de Better Auth
  `1.7.7` — ver la decisión revisada arriba. Hashear en la escritura no es
  meramente inconveniente aquí; produce una sesión que el servidor no puede
  resolver después.

Entonces la declaración honesta es que ésta es una desviación conocida, acotada y
_actualmente inevitable_ de las buenas prácticas, con una condición de revisión
documentada. No es un caso de que la mitigación se haya considerado y se haya
cambiado por otra cosa.

### Firebase Auth / Supabase Auth / Clerk

- **Firebase Auth** — un sistema de identidad aparte cuyo SDK admin requiere
  credenciales de cuenta de servicio en nuestro entorno, agregando una
  dependencia operativa y una segunda fuente de verdad para los registros de
  usuario.
- **Supabase Auth** — arrastraría toda la decisión de Supabase al Sprint 1
  mientras el [ADR 0004](./0004-database-provider-neutrality.md) deliberadamente
  mantiene la capa de datos neutral respecto del proveedor.
- **Clerk** — una dependencia comercial alojada con su propio modelo de precios,
  su propio modelo de sesión y un acoplamiento duro entre nuestra tabla de
  usuarios y la suya. Demasiada superficie de producto antes de que haya un
  producto.

### JSON Web Tokens en lugar de sesiones en base de datos

Rechazada por ahora. Los JWT eliminan el problema de la revocación solo en el
papel: no puede invalidar un token sin estado antes de su expiración, de modo que
"cerrar sesión en todas partes" y "revocar una sesión comprometida" dejan de
funcionar. Las sesiones en base de datos cuestan una búsqueda indexada y dan
revocación real. Se reconsidera solo si la búsqueda se convierte en un
cuello de botella medido a escala.
