# Architecture Decision Records (registros de decisiones de arquitectura)

Un ADR registra una decisión que **no** era obvia, junto con el contexto que la
volvía razonable y las consecuencias que crea. El punto no es documentar lo que
hace el código — eso ya lo hace el código — sino registrar _por qué un ingeniero
razonable podría haber elegido lo contrario_.

## Formato

Cada ADR usa las mismas seis secciones:

| Sección                       | Propósito                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------ |
| **Título**                    | La decisión, enunciada como una elección.                                      |
| **Estado**                    | `Propuesta`, `Aceptada` o `Reemplazada por ADR-NNNN`.                          |
| **Contexto**                  | Las fuerzas y restricciones que hicieron necesaria la decisión.                |
| **Decisión**                  | Qué elegimos, con la concreción suficiente para actuar.                        |
| **Consecuencias**             | Qué se vuelve más fácil, qué se vuelve más difícil y qué aceptamos como costo. |
| **Alternativas consideradas** | Qué más estaba en la mesa y por qué perdió.                                    |

## Reglas

1. Escriba el ADR **cuando se toma la decisión**, no retroactivamente. Una
   decisión registrada después de que se lanza es una racionalización, no un
   registro.
2. No edite la sustancia de un ADR aceptado. Reemplácelo con un archivo nuevo y
   actualice la línea de Estado del antiguo — el historial del razonamiento es
   todo el valor.
3. Mantenga las consecuencias honestas. Si una decisión es costosa, dígalo; un
   registro que solo enumera beneficios es marketing.
4. Cada elección arquitectónica significativa merece uno. Si está debatiendo si
   algo califica, califica.

## Índice

| ADR                                              | Estado   | Resumen de una línea                                                                                                  |
| ------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| [0001](./0001-monorepo-and-runtime-split.md)     | Aceptada | monorepo con pnpm + Turborepo; Next.js App Router es el único backend TS; Python existe solo para impulsar Nuclei/ZAP |
| [0002](./0002-authentication.md)                 | Aceptada | Better Auth + Drizzle, correo/contraseña, argon2id, tokens de sesión hasheados                                        |
| [0003](./0003-design-tokens-and-color-budget.md) | Aceptada | tokens semánticos definidos una sola vez en `@theme` de Tailwind v4; los colores de severidad nunca se usan solos     |
| [0004](./0004-database-provider-neutrality.md)   | Aceptada | la capa de datos permanece neutral respecto del proveedor: todo pasa por `DATABASE_URL`                               |
| [0005](./0005-deferred-multi-tenancy.md)         | Aceptada | sin `organization_id` en el Sprint 1; justificación y disparador de reconsideración                                   |
