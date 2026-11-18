# ADR 0019: Suscripciones simuladas detrás de una interfaz `PaymentProvider`

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

**CA-33/CA-34** (HU-02b) piden gestión de suscripción: planes, cambio de plan,
estado de la suscripción y cobro. Integrar una pasarela real (Stripe, MercadoPago)
en un sprint académico introduce tres problemas que no son del producto:
credenciales que no se pueden publicar, cumplimiento PCI, y un flujo que no se
puede demostrar sin dinero real.

Simular "por dentro" del código de suscripciones sería peor: mezclaría la
simulación con la lógica de negocio y volvería imposible conectar una pasarela real
después sin reescribir.

## Decisión

La lógica de suscripciones depende de una interfaz `PaymentProvider`. El Sprint 2
entrega una única implementación: un **simulador**.

Reglas del simulador:

- Se activa con `DEMO_MODE=true`. Sin ese flag, el sistema no ofrece el simulador.
- La pantalla lleva la etiqueta visible **"Modo demostración: no se realiza ningún
  cobro"**.
- Se documentan tarjetas de prueba con dos resultados: **aprobada** y **rechazada**.
- La activación del plan ocurre **solo** por webhook, nunca por la respuesta del
  formulario. El webhook valida firma HMAC, exige un identificador de evento único,
  deduplica y tolera eventos fuera de orden y reintentos.
- Los precios de los planes Pro quedan como `[COMPLETAR: precios definitivos]`.
- El veredicto del criterio es **"Cumple en modo simulado"**, nunca "Listo".

## Consecuencias

- La demo se puede repetir sin dinero y sin credenciales.
- Conectar una pasarela real es implementar la interfaz, no reescribir el dominio.
- El veredicto "Cumple en modo simulado" es honesto y evita presentar como real algo
  que no cobra.
- Cuesta mantener el simulador mientras no haya pasarela real.
- El webhook obliga a tener una URL pública o un túnel para probarlo de punta a
  punta; en local se prueba contra el propio endpoint.

## Alternativas consideradas

- **Integrar Stripe en modo test**: requiere credenciales y cuenta; el acta no puede
  publicar las claves y la demo depende de un tercero. Descartada para el sprint.
- **Simular dentro del código de suscripciones**: imposible de sustituir después.
  Descartada.
