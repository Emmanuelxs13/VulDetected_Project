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
| [0014](./0014-universal-scan-passive-vs-active.md) | Aceptada | el escaneo pasivo no exige dominio verificado; la auditoría activa sí |
| [0015](./0015-criterios-oficiales-sprint-2.md) | Aceptada | los criterios oficiales del Sprint 2 mandan; los propuestos se renombran `CA-P01+` |
| [0016](./0016-vinculacion-social-prueba-de-buzon.md) | Aceptada | vincular una cuenta social exige correo afirmado por el proveedor **y** buzón ya demostrado |
| [0017](./0017-ca-30-lectura-literal-cuentas-nuevas.md) | **Propuesta** | CA-30 literal: sesión inmediata en cuentas nuevas de Google, acciones sensibles bloqueadas hasta verificar |
| [0018](./0018-criterios-github-propuestos.md) | **Propuesta** | equivalentes `CA-30-GH`…`CA-33-GH`, solo correo primario verificado |
| [0019](./0019-suscripciones-simuladas.md) | Aceptada | suscripciones detrás de `PaymentProvider` con simulador, activación solo por webhook firmado |
| [0020](./0020-intranet-hoja-de-ruta-fixture.md) | Aceptada | intranet es hoja de ruta; la demo usa fixture y el guard SSRF no se desactiva |
| [0021](./0021-datos-demo-marcados.md) | Aceptada | `demo:seed-history` marca `is_demo` y la interfaz lo muestra |
| [0022](./0022-historial-instantaneas-sin-puntaje.md) | Aceptada | el historial son instantáneas comparables, sin puntaje compuesto; el semáforo no se redefine |
| [0023](./0023-vulnerabilidad-nueva-y-entrega-de-alerta.md) | Aceptada | "nueva" = huella ausente de los hallazgos abiertos del escaneo comparable anterior |
| [0024](./0024-cancelacion-resultados-parciales.md) | Aceptada | cancelar conserva hallazgos y marca `partial`; lo parcial nunca es comparable |
| [0025](./0025-tabla-operacion-vs-ruta.md) | Aceptada | tabla de equivalencia funcional entre la operación del acta y la ruta real |
| [0026](./0026-cierre-honesto-parcial.md) | Aceptada | un criterio es "Listo" solo con prueba con su ID y evidencia manual; lo demás es "Parcial" con plan |
