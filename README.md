# FinControl Web — Plataforma Integral de Gestión y Control Financiero Personal

Plataforma Web y Backend API unificado para auditoría financiera bimonetaria (`GTQ` / `USD`), conciliación bancaria antiduplicidad, presupuesto 50/30/20, control de tarjetas de crédito ("Totalero" y Visa Cuotas) y simulación hipotecaria.

## Stack Tecnológico
- **Framework Unificado:** Next.js 15 (App Router) + React 18 + TypeScript
- **Estilos:** Tailwind CSS
- **Base de Datos:** PostgreSQL 16 (Docker Compose) con esquema financiero bimonetario `NUMERIC(14,2)`
- **Testing:** Vitest (Pruebas unitarias de los motores financieros y escenarios de aceptación 1, 2 y 3)

## Módulos Implementados
1. **Dropzone Inteligente y Conciliación (4.1 & 4.2):** Carga de estados de cuenta PDF y tickets, fusión automática con registros de la app Android (`fincontrol-android`) y neutralización de transferencias internas (`RN-02`).
2. **Motor de Categorización y Regla 50/30/20 (4.3):** Semáforo mensual (Verde/Amarillo/Rojo), alertas al superar el 90% y gestor de reglas por palabras clave (`RN-04`).
3. **Auditoría de Tarjetas Bimonetarias y Visa Cuotas (4.4):** Control separado en Quetzales (`GTQ`) y Dólares (`USD`), verificación de pago de contado 0% intereses y seguimiento de cuotas.
4. **Préstamos y Simulador Paramétrico de Amortización Anticipada (4.5):** Separación contable de cuota (Capital, Interés, Seguros) y simulador interactivo de abonos extraordinarios a capital.
5. **Balance Patrimonial y Proyecciones a Cierre de Año (4.6 & 4.7):** Net Worth Tracker consolidado (`RN-05`) e hitos anuales calendarizados (Bono 14, Aguinaldo, seguros).

## Ejecución Rápida

```bash
# 1. Levantar PostgreSQL 16 con esquema y datos semilla
docker compose up -d

# 2. Instalar dependencias
npm install

# 3. Ejecutar suite de pruebas unitarias (Escenarios 1, 2 y 3)
npm test

# 4. Iniciar servidor de desarrollo
npm run dev
```

La documentación arquitectónica detallada se encuentra en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
