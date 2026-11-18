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
importan, porque las acciones de riesgo ya exigen correo verificado.

## Decisión

Se adopta la **lectura literal**, y solo para cuentas nuevas creadas con Google:

- La cuenta se crea y la sesión inicia en el mismo paso.
- Se envía un correo de verificación.
- Mientras el correo no esté verificado, el usuario puede navegar y hacer análisis
  pasivo, pero **no** auditoría activa, escaneos programados ni exportaciones.
- Ninguna acción sensible se habilita por el hecho de venir de un proveedor social.

## Consecuencias

- CA-30 se cumple al pie de la letra.
- La superficie de riesgo queda igual que hoy: el correo verificado sigue siendo la
  puerta de las acciones sensibles.
- Existe una ventana en la que un usuario tiene sesión con un correo que el
  proveedor afirma verificado pero nosotros no hemos comprobado. Es aceptable
  porque esa ventana no habilita ninguna acción de riesgo.
- **Requiere aprobación explícita del equipo**: es una decisión de producto y de
  seguridad a la vez, y el acta del Sprint 2 debe registrarla como tal.

## Alternativas consideradas

- **Lectura estricta (sin sesión hasta verificar)**: más segura, contradice el
  texto del criterio y agrega fricción a la demo. Queda sobre la mesa si el equipo
  prefiere priorizar la seguridad sobre la literalidad.
- **Sesión plena sin verificación**: incumple la regla de correo verificado para
  acciones sensibles y rompe ADR 0014. Descartada.
