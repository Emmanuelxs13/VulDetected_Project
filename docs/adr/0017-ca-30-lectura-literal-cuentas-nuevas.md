# ADR 0017: Lectura literal de CA-30 para cuentas nuevas de Google

Fecha: 2026-11-18
Estado: Propuesta — requiere aprobación del equipo
Decisores: Equipo VulDetected

## Contexto

**CA-30** dice que un usuario puede crear una cuenta e iniciar sesión con Google.

Hay dos lecturas posibles y no son equivalentes:

- **Lectura literal**: la sesión empieza de inmediato; además se envía un correo de
  verificación y las acciones sensibles (auditoría activa, escaneos programados,
  exportaciones) quedan bloqueadas hasta que el correo se verifique.
- **Lectura estricta**: no hay sesión hasta que el usuario verifique el correo.

La estricta es más segura pero contradice el texto del criterio ("crear una cuenta
e iniciar sesión"). La literal cumple el criterio y conserva las barreras donde
importan, siempre que las acciones de riesgo exijan correo verificado (ADR 0014).

## Decisión

Se adopta la **lectura literal**, y solo para cuentas nuevas creadas con Google:

- La cuenta se crea y la sesión inicia en el mismo paso.
- Se envía un correo de verificación **solo cuando el proveedor no afirma que el
  correo está verificado**. Si Google o GitHub asertan `email_verified`, la cuenta
  se crea con `emailVerified = true` y no se envía nada: mandar un correo de
  confirmación a una dirección que el proveedor ya confirmó sería ruido, y el
  usuario quedaría marcado como no verificado en su propio perfil pese a tener
  sesión.
- Mientras el correo no esté verificado, el usuario puede navegar y hacer análisis
  pasivo, pero **no** auditoría activa, escaneos programados ni exportaciones.
- Ninguna acción sensible se habilita por el hecho de venir de un proveedor social.

## Estado de implementación (verificado el 2026-11-18)

Implementado y comprobado en navegador:

- La cuenta se crea y la sesión inicia en el mismo paso (CA-30).
- Con correo asertado por el proveedor: `emailVerified = true`, cero correos.
- Sin aserción del proveedor: `emailVerified = false` y exactamente un correo
  "Confirma tu correo en VulDetected".

**No implementado todavía — brecha conocida:**

- El bloqueo de acciones sensibles por correo no verificado **no existe en el
  código**. La única barrera real de las acciones de riesgo es la verificación de
  propiedad del dominio (ADR 0014), que sí está implementada y probada. Un usuario
  con correo sin verificar puede hoy exportar el PDF de un escaneo propio y crear
  escaneos programados sobre un dominio que ya verificó.
- Plan: una guarda compartida `requireVerifiedEmail` aplicada en
  `submitScanAction` (modo activo), `createScheduleAction`/`updateScheduleAction`
  y la ruta del PDF, con su código de error traducible. Queda registrada como
  brecha abierta del Sprint 2 en `PRUEBA_SPRINT_2.md` en lugar de darse por hecha.

## Consecuencias

- CA-30 se cumple al pie de la letra.
- La superficie de riesgo queda igual que hoy **en cuanto a propiedad de dominio**;
  la barrera de correo verificado sigue pendiente de implementación.
- Existe una ventana en la que un usuario tiene sesión con un correo que el
  proveedor afirma verificado pero nosotros no hemos comprobado. Es aceptable
  porque el proveedor es una fuente confiable para ese dato y porque la barrera
  real de las acciones de riesgo —la propiedad del dominio— sí está implementada.
- **Requiere aprobación explícita del equipo**: es una decisión de producto y de
  seguridad a la vez, y el acta del Sprint 2 debe registrarla como tal.

## Alternativas consideradas

- **Lectura estricta (sin sesión hasta verificar)**: más segura, contradice el
  texto del criterio y agrega fricción a la demo. Queda sobre la mesa si el equipo
  prefiere priorizar la seguridad sobre la literalidad.
- **Sesión plena sin verificación**: incumple la regla de correo verificado para
  acciones sensibles y rompe ADR 0014. Descartada.
