# Arquitectura del Sistema — FinControl (Web & Mobile Ecosystem)

## 1. Visión Arquitectónica

El ecosistema **FinControl** resuelve la fricción entre la captura inmediata de gastos en el punto de venta (efectivo, gastos compartidos, tickets físicos) y la auditoría contable profunda de estados de cuenta bancarios en PDF (bimonetarios `GTQ`/`USD`, tarjetas de crédito, préstamos hipotecarios y fondos de inversión).

```mermaid
flowchart TD
    subgraph Android["📱 App Nativa Android (fincontrol-android)"]
        A1["Captura Express (<5s)\nTeclado Numérico GTQ/USD"] --> A2["Motor Split Expenses\n(% o Monto Propio RN-01)"]
        A2 --> A3[("Room SQLite\nOffline-First")]
        A3 --> A4["WorkManager Sync"]
    end

    subgraph WebMonolith["💻 Monolito Full-Stack Next.js (fincontrol-web)"]
        W1["Dropzone Masivo PDF / Tickets"] --> W2["Motor Conciliación Antiduplicidad"]
        A4 -->|POST /api/v1/transactions| W2
        W2 --> W3["Neutralizador Transferencias Internas (RN-02)"]
        W3 --> W4["Motor Presupuestario 50/30/20 & Reglas"]
        W4 --> W5["Simulador Hipotecario & Proyecciones"]
        W4 --> W6["Balance Patrimonial & Auditoría Totalero TC"]
    end

    subgraph Database["🗄️ Persistencia (Docker)"]
        PG[("PostgreSQL 16\nNUMERIC(14,2) Bimonetario")]
    end

    W2 <--> PG
    W4 <--> PG
    W5 <--> PG
    W6 <--> PG
```

---

## 2. Decisiones Arquitectónicas (ADRs)

### ADR-01: Monolito Unificado en Next.js (App Router) + PostgreSQL 16
- **Contexto:** Se requiere una interfaz web de alta densidad analítica y un backend seguro para sincronizar la app Android sin sobrecarga operativa de mantener múltiples servidores backend separados.
- **Decisión:** Utilizar **Next.js (TypeScript + Tailwind CSS)** como solución unificada. Las vistas de escritorio consumen datos directamente y los Route Handlers (`/api/v1/dashboard`, `/api/v1/transactions`, `/api/v1/reconcile`, `/api/v1/rules`) sirven tanto a la web como a la aplicación nativa Android.
- **Base de Datos:** **PostgreSQL 16** contenerizado en Docker con tipos `NUMERIC(14,2)` estrictos para evitar errores de coma flotante en cálculos bimonetarios (`GTQ` y `USD`).

### ADR-02: Tratamiento Contable de Gastos Compartidos (`RN-01`)
- **Restricción:** En toda transacción en la base de datos se cumple la invariante:
  `total_amount_gtq = personal_amount_gtq + receivable_amount_gtq`
- **Impacto:** Los semáforos de presupuesto 50/30/20 suman exclusivamente `personal_amount_gtq`. El excedente (`receivable_amount_gtq`) se contabiliza como **Activo Circulante Transitorio (Cuentas por Cobrar a Terceros)** hasta su liquidación.

### ADR-03: Motor de Conciliación Antiduplicidad y Neutralización (`RN-02`)
1. **Emparejamiento Móvil ↔ PDF Bancario:** Todo gasto registrado desde Android ingresa con estado `PENDING_STATEMENT_MATCH`. Al cargar el PDF del estado de cuenta bancario en la web, el motor busca coincidencias por `(cuenta, moneda, monto exacto, ventana de ±3 días)` y los fusiona en un único registro `RECONCILED_MERGED`, preservando la foto del ticket y notas móviles.
2. **Aislamiento de Transferencias Internas (`RN-02`):** Los pagos de tarjeta de crédito desde cuentas monetarias propias (`BANCA MOVIL` ↔ `GRACIAS POR SU PAGO`) se emparejan automáticamente por monto y ventana temporal de 72 horas, etiquetándose como `INTERNAL_TRANSFER` para no inflar ingresos ni gastos operativos.
