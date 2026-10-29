# Rendimiento - Línea base

**Rama:** `feature/fixes-ui-ux`  
**Fecha:** 2026-10-28  
**Base:** `feature/puesta_produccion` (commits `890d4b3`, `1a2848b`, `ac6d82d`)  

## METODOLOGÍA

- **Producción:** `pnpm build && pnpm start` (modo producción real)
- **Desarrollo:** `pnpm dev` (comparativa) + `next dev --turbopack` si aplica
- **Lighthouse:** Móvil y escritorio en rutas objetivo
- **Bundle:** `@next/bundle-analyzer` sobre build de producción
- **Servidor/SQL:** Medición por ruta + consultas >100ms

## TABLA "ANTES" - Lighthouse

| Ruta | Modo | LCP (s) | INP (ms) | CLS | Performance | Accessibility | Best Practices | SEO | Notas |
|---|---|---|---|---|---|---|---|---|---|
| `/` (landing) | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/` (landing) | Escritorio Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/login` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/login` | Escritorio Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/register` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/register` | Escritorio Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/dashboard` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/dashboard` | Escritorio Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/scans` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/scans` | Escritorio Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/scans/[id]` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/reports` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/findings` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |
| `/guides` | Móvil Prod | TBD | TBD | TBD | TBD | TBD | TBD | TBD | Pendiente medición |

## TABLA "ANTES" - Build / Bundle

| Métrica | Valor | Notas |
|---|---|---|
| `pnpm build` (tiempo) | 1m39s | Build exitoso, standalone generado |
| First Load JS shared by all | 102 kB | Chunks: 75019b68 (54.2 kB), 960 (46.2 kB), otros (1.99 kB) |
| Landing `/` | 78 B + 103 kB shared = **103 kB** aprox First Load | Parece ligero, revisar con bundle analyzer |
| Login `/login` First Load JS | **206 kB** | Muy alto - objetivo >150 KB |
| Register `/register` First Load JS | **206 kB** | Muy alto |
| Scans `/scans` First Load JS | **196 kB** | Alto |
| Forgot/Reset password | **194 kB** | Alto |
| Dashboard `/dashboard` First Load JS | **169 kB** | Alto |
| Findings `/findings` First Load JS | **170 kB** | Alto |
| Scans detail `/scans/[scanId]` First Load JS | **172 kB** | Alto |
| Ruta con mayor JS | `/login` / `/register` (206 kB) | Top offenders - exceden objetivo <150 KB |
| Bundle analyzer ejecutado | NO | Se ejecutará en FASE 1 para identificar imports pesados |

## TABLA "ANTES" - Servidor / SQL

| Ruta | TTFB medio (ms) | Consultas SQL | Consultas >100ms | Notas |
|---|---|---|---|---|
| `/` | TBD | TBD | TBD | |
| `/dashboard` | TBD | TBD | TBD | Revisar cascadas |
| `/scans` | TBD | TBD | TBD | |
| `/findings` | TBD | TBD | TBD | Posible N+1 |
| `/reports` | TBD | TBD | TBD | |

## CAUSAS RAÍZ IDENTIFICADAS (FASE 0)

Pendiente perfilado con evidencia real.

## PRESUPUESTOS OBJETIVO
- LCP < 2,5 s | INP < 200 ms | CLS < 0,1
- JS inicial landing < 150 KB gzip
- Lighthouse ≥ 90 (Performance/Accessibility/Best Practices/SEO) en landing, login, panel
- Axe WCAG 2.2 AA sin violaciones críticas
