# ADR 0001: Monorepo y división de runtimes

- **Estado:** Aceptada
- **Fecha:** Sprint 1

## Contexto

VulDetected necesita tres tipos de maquinaria muy diferentes:

1. Una aplicación web — formularios, paneles, autenticación, un flujo en tiempo
   real con el progreso de los escaneos.
2. Un worker de escaneo — proceso de larga duración, intensivo en CPU y red,
   que orquesta herramientas externas (Nuclei, OWASP ZAP) distribuidas como
   binarios independientes.
3. Una base de datos relacional.

Dos de ellas (1 y 2) quieren cosas distintas de un runtime:

- La aplicación web se beneficia del renderizado en el servidor, los route
  handlers, las sesiones basadas en cookies y un paso de compilación que produce
  un artefacto desplegable.
- El worker quiere un proceso de larga duración con una cola de trabajos, sin
  superficie HTTP, y los bindings que hagan fiable la invocación de los
  escáneres.

Un instinto común es darle al backend un servicio NestJS al lado de Next.js, con
la teoría de que "un backend merece un framework de backend de verdad". Ese
instinto cuesta más de lo que devuelve a escala MVP, y este ADR explica por qué.

El repositorio además debe alojar un servicio Python, lo que significa que la
historia de las herramientas no es puramente TypeScript.

## Decisión

**1. Estructura de monorepo.** Workspaces de pnpm + Turborepo, con `apps/*` y
`packages/*` como globs del workspace.

```
apps/web                 Next.js App Router (web + backend del producto)
packages/db              esquema Drizzle, migraciones, fábrica de conexiones
packages/ui              tokens de tema y primitivas de Tailwind v4
packages/config          presets compartidos de tsconfig/eslint/prettier
services/scanner         worker Python + Celery (compilado y ejecutado solo vía Docker)
infra/                   stack de desarrollo con Docker Compose
docs/                    este conjunto de documentación
```

`services/scanner` es deliberadamente **no** un paquete de pnpm. Se compila y
ejecuta a través de Docker. Mezclar una toolchain de Python en el grafo de tareas
de pnpm/Turbo significaría que cada invocación de `pnpm run` negocia con dos
ecosistemas sin ningún beneficio.

**2. Next.js App Router es el único backend del producto. Sin NestJS.** El
servidor de Next.js es dueño de la autenticación, la validación de sesiones, la
autorización, el pool de conexiones a la base de datos, las reglas de negocio y
la superficie API con la que habla el navegador.

**3. El servicio Python existe por exactamente una razón: orquestar Nuclei y ZAP
mediante Celery.** Es un ejecutor de escaneos con una cola de trabajos, no un
segundo backend del producto. No contiene reglas de negocio, ni validación de
sesiones, ni acceso de escritura a los datos del producto más allá de los
resultados de escaneo devueltos a través de un canal autenticado y estrecho.

## Consecuencias

**Costos aceptados**

- Un trabajo de escaneo de larga duración no puede alojarse dentro de un
  request handler serverless. Ésa es la razón por la que el worker en Python y
  una cola de trabajos real (Celery + Redis) no son opcionales — son lo que hace
  sobrevivible el trabajo de larga duración.
- Dos runtimes significan dos conjuntos de dependencias, dos Dockerfiles y dos
  trabajos de CI. Turbo oculta parte de esto; no lo elimina.
- El servicio Python no puede importar directamente los tipos de dominio en
  TypeScript. Los tipos que cruzan la frontera se validan en tiempo de
  ejecución, no los comparte el compilador. Aceptamos el costo y lo pagamos con
  validación de esquema, porque el acoplamiento en tiempo de compilación a
  través de una frontera de proceso sería igualmente una mentira.

**Beneficios aceptados**

- Un solo lugar donde se aplica la autenticación. Cada decisión de autorización
  ocurre en un runtime, un framework, un lenguaje. No existe la pregunta "¿qué
  servicio valida la sesión?" para responder mal.
- Un solo juego de secretos que administrar para la superficie del producto.
- Una sola historia de CORS: el navegador habla con un solo origen. La
  complejidad cross-origin entre `web` y `api` desaparece por completo.
- Un solo artefacto de despliegue para el backend del producto, en lugar de dos
  que deben ser compatibles en versión.
- TypeScript en toda la superficie del producto significa un solo sistema de
  tipos, una sola configuración de lint y tipos compartidos en `packages/`.

## Alternativas consideradas

### NestJS como servicio API aparte

Rechazada. Significaría un segundo backend TS que duplica preocupaciones que el
servidor de Next.js ya debe resolver, y cada duplicación es un lugar donde
olvidar un control de seguridad:

- **Autenticación/validación de sesiones implementada dos veces.** Dos
  implementaciones se desvían. La que se desvía mal es un bypass de
  autenticación.
- **Configuración de CORS** entre `web` y `api`, incluidas las solicitudes con
  credenciales, el caché de preflight y las listas de permitidos de orígenes.
- **Coordinación de despliegue** — dos servicios que versionar, revertir y
  mantener en versiones de API compatibles.
- **Secretos** — un segundo entorno que configurar y un segundo lugar desde el
  cual puede filtrarse un secreto.
- **Validación de cuerpo y manejo de errores** duplicados en un segundo framework
  con distinta idiomática.

Para un MVP cuyo tráfico son usuarios autenticados de un panel, no una API
pública consumida a escala, esto es sobrecarga pura. Si más adelante una API
pública real y pesada justifica un servicio aparte, este ADR queda reemplazado —
y el disparador queda registrado en lugar de darlo por supuesto.

### Micro-frontends / repositorio de frontend separado

Rechazada. Hay una sola superficie de producto. Un repositorio de frontend
partido compra independencia organizacional que el equipo todavía no necesita y
paga con coordinación entre repositorios, tipos duplicados y design tokens
inconsistentes — lo que contradice directamente el requisito del ADR 0003 de que
los tokens se definan exactamente una sola vez.

### Backend en Python en lugar de un worker en Python

Rechazada. Convertir al worker en un backend completo arrastraría lógica de
negocio, manejo de sesiones y autorización a través de una frontera de proceso
que existe únicamente para ejecutar escáneres externos. Mantener el servicio
estrecho es lo que hace alcanzables sus requisitos de aislamiento (egreso
filtrado, sistema de archivos de solo lectura, sin credenciales de la base de
datos) — ver [ADR 0004](./0004-database-provider-neutrality.md) y
[`docs/security.md`](../security.md).

### Go o Rust para el worker del escáner

No rechazada por sus méritos — es viable y más rápido de ejecutar. Aplazada:
agregaría una tercera toolchain para una carga de trabajo que es limitada por
E/I (esperas de red contra objetivos lentos), no por CPU. Python más Celery es el
camino más rápido hacia un ciclo de escaneo funcional, y Celery es una cola
madura y observable. Se revisa si el uso de memoria del worker o el costo de
arranque en frío se convierten en un problema medido.
