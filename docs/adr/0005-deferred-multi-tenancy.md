# ADR 0005: Multitenancy aplazada

- **Estado:** Aceptada
- **Fecha:** Sprint 1

## Contexto

Todo SaaS serio necesita organizaciones eventualmente: los usuarios pertenecen a
una organización, las organizaciones son dueñas de los escaneos y los hallazgos,
y el acceso se acota en consecuencia. La pregunta para el Sprint 1 es si modelar
eso ahora.

La contra-presión estándar: construir un modelo de datos sin organizaciones es
trabajo que se tira. Si `scans` no tiene `organization_id`, cada consulta se
convierte en "todos los escaneos del sistema", lo cual es incorrecto en cuanto
hay dos clientes y costoso de retrofitar.

Esa presión es legítima pero se aplica con facilidad en exceso. El Sprint 1
entrega solo autenticación — cuatro tablas, sin datos de dominio ni de escaneo en
absoluto. Las tablas que realmente necesitarán multitenancy (`scans`, `findings`,
`domains`) todavía no existen y son trabajo del Sprint 2, con el Sprint 3
agregando contenido de remediación encima.

## Decisión

**Sin columna `organization_id` en el Sprint 1.** El Sprint 1 está acotado a
datos por usuario de un solo tenant. Las organizaciones se aplazan al Sprint 4+,
registrándose aquí con su justificación y su disparador de reconsideración.

Concretamente, en el Sprint 1:

- `users`, `sessions`, `verification_tokens`, `audit_logs` existen **sin**
  referencia a ninguna organización.
- `verification_tokens` es una tabla global de tokens; no es una declaración de
  propiedad y no necesita columna de tenancy.
- No existe `organization_id` en ningún lugar del esquema.
- `audit_logs` se mantiene solo-append (OWASP A09: registro y monitoreo de
  seguridad), de modo que su forma es mayormente estable con independencia del
  tenancy.

El **modelo** de multitenancy se diseña ahora aunque la **columna** no se
agregue: la autorización leerá a través de una única función de frontera que
resuelve "¿qué recursos puede ver este sujeto" — un punto de extensión que hoy
resuelve "todo lo que este usuario posee" y más adelante resolverá "todo lo que
está en las organizaciones de este usuario". El código de autorización pasa por
esa costura desde el Sprint 1 en lugar de incrustar `WHERE user_id = ?` en cada
lugar de llamada.

## Justificación

- **El costo es menor del que parece, porque las tablas todavía no existen.** La
  parte costosa de agregar `organization_id` es un backfill sobre las filas
  existentes en las tablas existentes. `scans`, `findings` y `domains` tienen
  cero filas en el Sprint 1. Agregar la columna en el Sprint 2 es un `CREATE
 TABLE`, no un `ALTER TABLE` más un backfill más un ejercicio de verificación
  de migraciones.
- **Las tablas caras son baratas de agregar después.** `users`, `sessions`,
  `verification_tokens` y `audit_logs` ganan más adelante un `organization_id`
  anulable, seguido de un backfill y de una restricción `NOT NULL` — una
  operación acotada y bien entendida sobre tablas pequeñas.
- **Un esquema especulativo sigue siendo esquema.** Una tabla `organizations` más
  un `organization_id` en cuatro tablas fuerza decisiones antes de que haya
  evidencia: modelo de membresía (¿invitaciones? ¿dominios? ¿límites de
  asientos?), la organización por defecto de un registro nuevo, la pregunta de
  personal-o-equipo y la vinculación de facturación. Adivinar eso ahora
  significa o bien construir un modelo que reescribiremos, o bien no construir
  nada útil.
- **Un solo tenant es un MVP legítimo.** Cada usuario escanea sus propios
  dominios y ve sus propios hallazgos. Ése es un producto coherente y
  entregable.
- **Hacer el retrofit es una migración normal, no una reescritura de emergencia.**
  Drizzle lo hace explícito y revisable — siempre que se haga como tarea
  deliberada del Sprint 4 en lugar de descubrirse bajo presión.

## Consecuencias

**Beneficios aceptados**

- El Sprint 1 se mantiene pequeño y honesto sobre lo que no sabe.
- El primer esquema es simple de leer, revisar y razonar.
- La multitenancy queda diseñada en el **punto de extensión de autorización**,
  donde es barata, en lugar de en el esquema, donde es costosa y prematura.

**Costos aceptados**

- **`WHERE user_id = ?` aparecerá en las consultas durante los Sprints 2 y 3** y
  requerirá revisión. Aceptar este costo es toda la razón de la decisión, y está
  acotado: la reescritura está en los predicados de las consultas, no en la
  lógica de negocio, siempre que la autorización pase por la costura descrita
  arriba.
- **Sin roles a nivel de organización** (owner / admin / member) hasta el
  Sprint 4+.
- **Sin escaneo compartido**, sin visibilidad entre usuarios, sin gestión de
  asientos.
- **La migración S4 es trabajo real**, en una base de datos en producción, durante
  un sprint que además llevará OAuth y facturación. Debe programarse, no
  absorberse.

## Disparador de reconsideración

Reabra esta decisión en cuanto **cualquiera** de los siguientes se vuelva cierto.
Estos son disparadores, no sugerencias:

1. **Un usuario pide compartir el acceso** con un colega, un cliente de agencia o
   una organización cliente.
2. **Un segundo usuario debe ver los escaneos del mismo usuario** — una sola
   cuenta usada por un equipo es el precursor clásico del tenancy.
3. **Un cliente solicita una pista de auditoría o una exportación acotada a su
   organización** y no a sí mismo.
4. **La facturación introduce asientos o cuotas por organización** — los conceptos
   de cliente, suscripción y asiento de Stripe son conceptos de organización.
5. **Aparece un modelo de agencia o de servicio gestionado**, donde un operador
   administra muchos dominios de clientes no relacionados entre sí.
6. **Se confirma el sprint S4**, que es el punto planificado más temprano para
   `organizations`.

**Al reconsiderar, la secuencia es:** crear `organizations`, agregar un
`organization_id` anulable a las tablas que soportan tenancy, hacer el backfill,
verificar con una comprobación de integridad de datos y luego agregar `NOT NULL` —
nunca todo a la vez. Se debe notificar al propietario antes de redactar esa
migración, según
[`docs/database.md`](../database.md#puntos-de-contacto-en-la-db--se-requiere-decisión-del-propietario).

## Alternativas consideradas

### Agregar `organization_id` a todo ahora

Rechazada. Vuelve especulativas las cuatro tablas del Sprint 1, fuerza un modelo
de membresía y de organización por defecto antes de que exista ningún usuario, y
no compra casi nada — porque las tablas que importan para el tenancy (`scans`,
`findings`, `domains`) todavía no existen y pueden simplemente _crearse_ con la
columna.

### Tabla `organizations` ahora, sin FKs todavía

Rechazada. Una tabla sin columnas que la referencien y sin ruta de código crea la
apariencia de multitenancy sin proveer ninguna de las garantías. Además hace más
difícil de razonar la migración final, porque el código ya parecería manejar
organizaciones.

### Row Level Security (RLS) como sustituto de la columna de tenancy

Rechazada como sustituto. RLS es una potente _segunda_ capa de autorización, pero
requiere una columna tipo `organization_id` sobre la cual hacer el key, y es
específica de Postgres — lo que entra en conflicto con las reglas de neutralidad
respecto del proveedor del [ADR 0004](./0004-database-provider-neutrality.md).
Sigue siendo una opción como defensa en profundidad una vez que exista el
tenancy, pendiente de una decisión del propietario.

### Multitenancy solo en documentación (escribir el diseño, saltear el esquema)

Adoptada parcialmente. La costura de autorización y este ADR son ese diseño. El
cambio de esquema deliberadamente no se aplica por adelantado.
