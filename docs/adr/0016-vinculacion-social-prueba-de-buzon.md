# ADR 0016: Vincular una cuenta social a una cuenta local exige prueba de control del buzón

Fecha: 2026-11-18
Estado: Aceptada
Decisores: Equipo VulDetected

## Contexto

El Sprint 2 pide dos cosas que se tocan:

- **CA-31** (HU-02a): un usuario puede iniciar sesión con Google o GitHub.
- **CA-33** (HU-02b): si el correo del proveedor coincide con una cuenta local ya
  existente, el sistema no debe crear una cuenta duplicada.

La lectura ingenua de CA-33 es "si el correo coincide, vincula y entra". Esa
lectura es una vulnerabilidad de toma de cuenta: un proveedor puede entregar un
correo que el usuario no controla (correo no verificado, correo corporativo
reasignado, proveedor mal configurado). Si el sistema vincula por coincidencia de
cadena, quien controle ese correo en el proveedor entra a una cuenta que ya tenía
contraseña, historial y dominios verificados.

## Decisión

La vinculación automática ocurre **solo** cuando se cumplen las dos condiciones:

1. El proveedor **afirma explícitamente** que el correo está verificado
   (`email_verified === true` en el `id_token`/perfil). Un correo presente pero no
   verificado no habilita nada.
2. La cuenta local **ya demostró control de ese buzón**: su correo está verificado
   en nuestro sistema mediante el enlace de verificación que enviamos nosotros.

Si cualquiera de las dos falla, no se crea sesión y no se vincula nada. El usuario
recibe la instrucción de iniciar sesión con su contraseña y vincular desde dentro
de la aplicación, o de verificar su correo primero.

## Consecuencias

- Un atacante que controle un correo en un proveedor externo no puede entrar a una
  cuenta local existente por el solo hecho de que la cadena coincida.
- El caso "primera vez que uso Google, el correo coincide con mi cuenta local sin
  verificar" requiere un paso extra (verificar el buzón). Es fricción deliberada.
- La regla se implementa una sola vez, en la capa de vinculación, y no en cada
  proveedor por separado.
- Se vuelve obligatorio registrar en la prueba qué proveedor afirmó verificación y
  cuál no, porque el resultado cambia con ese dato.

## Alternativas consideradas

- **Vincular por coincidencia de correo**: cómodo y peligroso. Descartada.
- **No vincular nunca y crear cuenta nueva**: genera duplicados y contradice CA-33.
  Descartada.
