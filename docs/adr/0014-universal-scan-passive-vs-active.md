# ADR 0014: Escaneo universal - análisis pasivo vs auditoría activa

Fecha: 2026-11-03
Estado: Aceptado
Decisores: Equipo VulDetected

## Contexto

Actualmente submitScanAction exige verificación de propiedad de dominio para cualquier escaneo mediante requireVerifiedDomain. El formulario fuerza el flujo de verificación de propiedad antes de permitir escanear cualquier URL.

El requisito para lanzamiento es: "cualquier URL (propia o ajena) debe poder escanearse; la verificación de propiedad solo aplica a la auditoría activa".

## Decisión

Se reinterpreta CA-04: la verificación de propiedad solo aplica a la auditoría activa, no al análisis pasivo.

- Análisis pasivo: permitido para cualquier URL válida (http/https), sin verificación de propiedad. Sin requerir correo verificado. Cuota reducida.
- Auditoría activa: requiere dominio verificado por el usuario, correo verificado, y puede incluir checks activos (XSS, SQLi, etc.). Aplica también a escaneos programados y exportaciones.
- Protecciones SSRF/abuso: se mantienen intactas. No se evaden WAF, CAPTCHA, anti-bot o límites de tasa.
- Escaneos programados: exigen auditoría activa, por lo que requieren dominio verificado y correo verificado.

## Consecuencias

- Se modifica submitScanAction para distinguir modo pasivo/activo
- Se relaja new-scan-form para permitir análisis pasivo directo sin flujo de propiedad
- Se añaden límites de cuota más restrictivos para usuarios no verificados/escaneos pasivos
- Se mantiene requireVerifiedDomain solo para auditorías activas
- Se documenta la distinción en UI con textos claros
