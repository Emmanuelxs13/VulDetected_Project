# ADR 0020: El escaneo autenticado de páginas privadas se demuestra con un fixture, sin tocar el SSRF

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

**HU-04** (SCRUM-30, CA-25, CA-26 y CA-27) pide escanear páginas privadas que están detrás
de un inicio de sesión. En el contexto del cliente eso significa una intranet.

Una intranet real es una red privada. Permitir que el escáner la alcance exige
desactivar o relajar el guard SSRF, que es una de las protecciones más importantes
del producto: es lo que impide que un usuario use el escáner para llegar a
`169.254.169.254`, a `localhost` del servidor o a la red interna del proveedor.

Desactivar SSRF para demostrar una funcionalidad es cambiar la seguridad del
producto por comodidad de la demo. No se hace.

## Decisión

1. El escaneo de una intranet real queda en la **HOJA DE RUTA**, no en el Sprint 2.
2. La demostración usa un **fixture**: una aplicación con páginas protegidas por
   login, servida localmente, con credenciales de prueba documentadas.
3. El guard SSRF **no se desactiva**. El fixture se alcanza por el mismo camino que
   cualquier objetivo de demo permitido, con la misma validación.
4. La pantalla y el manual indican explícitamente que el objetivo es un fixture y
   no una intranet real.
5. Los criterios CA-25, CA-26 y CA-27 se verifican contra el fixture y se reportan como
   cumplidos **en modo demostración**.

## Consecuencias

- La funcionalidad de autenticación se prueba de punta a punta: formulario de
  login, credencial cifrada, sesión, página privada, hallazgos.
- El producto no gana una vía para alcanzar redes internas.
- Queda claro en el acta que "intranet" es una promesa de hoja de ruta, no algo
  entregado.
- Cuesta mantener el fixture junto con el resto de los aceleradores de demo.

## Alternativas consideradas

- **Permitir objetivos privados con una bandera**: es exactamente el agujero que el
  guard existe para cerrar, y una bandera en producción es una pregunta de
  auditoría. Descartada.
- **Escanear una intranet real del cliente**: no hay acceso, no es reproducible y
  no se puede grabar. Descartada.
