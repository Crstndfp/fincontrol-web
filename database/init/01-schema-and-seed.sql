-- =============================================================================
-- FinControl — Personal Financial & Wealth Management Platform
-- PostgreSQL 16 Schema & Seed Data
-- Enforces RN-01 (Split Expenses), RN-02 (Internal Transfer Isolation),
-- RN-03 (Zero Tax Blocking), RN-04 (Reversibility), RN-05 (Bimonetary GTQ/USD)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Enums & Types
CREATE TYPE currency_code AS ENUM ('GTQ', 'USD');
CREATE TYPE account_type AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN', 'INVESTMENT', 'CASH_WALLET', 'RECEIVABLES');
CREATE TYPE budget_macro_group AS ENUM ('NEEDS_50', 'LIFESTYLE_30', 'SAVINGS_20');
CREATE TYPE transaction_type AS ENUM ('EXPENSE', 'INCOME', 'INTERNAL_TRANSFER', 'LOAN_PAYMENT');
CREATE TYPE transaction_source AS ENUM ('MOBILE_EXPRESS', 'WEB_PDF_STATEMENT', 'WEB_MANUAL', 'SCHEDULED_MILESTONE');
CREATE TYPE reconciliation_status AS ENUM ('UNRECONCILED', 'PENDING_STATEMENT_MATCH', 'RECONCILED_MERGED', 'INTERNAL_TRANSFER_MATCHED');
CREATE TYPE document_status AS ENUM ('QUEUED', 'EXTRACTING', 'RECONCILED', 'NEEDS_REVIEW');

-- 2. Financial Accounts (Assets & Liabilities)
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    institution VARCHAR(100) NOT NULL,
    type account_type NOT NULL,
    primary_currency currency_code NOT NULL DEFAULT 'GTQ',
    is_bimonetary BOOLEAN NOT NULL DEFAULT FALSE,
    balance_gtq NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    balance_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    credit_limit_gtq NUMERIC(14, 2),
    cutoff_day SMALLINT CHECK (cutoff_day BETWEEN 1 AND 31),
    payment_due_day SMALLINT CHECK (payment_due_day BETWEEN 1 AND 31),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Expense & Savings Categories (50/30/20 Model)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(80) NOT NULL UNIQUE,
    icon VARCHAR(50) NOT NULL,
    color VARCHAR(30) NOT NULL,
    macro_group budget_macro_group NOT NULL,
    monthly_budget_limit_gtq NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Categorization Keyword Rules & Merchant Autocomplete
CREATE TABLE categorization_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword_pattern VARCHAR(120) NOT NULL,
    merchant_display_name VARCHAR(120) NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    priority SMALLINT NOT NULL DEFAULT 10,
    usage_count INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Uploaded Documents (Bank PDFs & Receipt Photos)
CREATE TABLE uploaded_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    document_kind VARCHAR(50) NOT NULL, -- 'BANK_STATEMENT_PDF', 'RECEIPT_IMAGE', 'INVOICE_PDF'
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    status document_status NOT NULL DEFAULT 'RECONCILED',
    detected_transactions_count INTEGER NOT NULL DEFAULT 0,
    reconciled_count INTEGER NOT NULL DEFAULT 0,
    duplicates_prevented_count INTEGER NOT NULL DEFAULT 0,
    raw_extracted_summary JSONB,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Transactions (Unified Ledger with Split Expense & Reconciliation Support)
-- RN-01: total_amount = personal_amount + receivable_amount
-- RN-03: No NIT or invoice number required
-- RN-05: Dual currency stored with exchange rate
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    document_id UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    merchant_name VARCHAR(160) NOT NULL,
    description TEXT,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type transaction_type NOT NULL DEFAULT 'EXPENSE',
    source transaction_source NOT NULL DEFAULT 'MOBILE_EXPRESS',
    
    -- Bimonetary Original Figures (RN-05)
    original_currency currency_code NOT NULL DEFAULT 'GTQ',
    exchange_rate_applied NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
    total_amount_original NUMERIC(14, 2) NOT NULL,
    
    -- Consolidated GTQ Figures & Split Expense Accounting (RN-01)
    total_amount_gtq NUMERIC(14, 2) NOT NULL,
    is_split_expense BOOLEAN NOT NULL DEFAULT FALSE,
    split_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    personal_amount_gtq NUMERIC(14, 2) NOT NULL,
    receivable_amount_gtq NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_receivable_settled BOOLEAN NOT NULL DEFAULT FALSE,
    debtor_name VARCHAR(120),
    
    -- Loan Payment Breakdown (Module 4.5)
    principal_amount_gtq NUMERIC(14, 2) DEFAULT 0.00,
    interest_amount_gtq NUMERIC(14, 2) DEFAULT 0.00,
    insurance_fees_gtq NUMERIC(14, 2) DEFAULT 0.00,

    -- Reconciliation & Audit Metadata (RN-02, RN-04)
    reconciliation_status reconciliation_status NOT NULL DEFAULT 'UNRECONCILED',
    linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    bank_reference_code VARCHAR(100),
    receipt_attachment_url TEXT,
    is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_split_accounting CHECK (total_amount_gtq = personal_amount_gtq + receivable_amount_gtq)
);

CREATE INDEX idx_transactions_date_amount ON transactions (transaction_date, total_amount_original, original_currency);
CREATE INDEX idx_transactions_reconciliation ON transactions (reconciliation_status, type);

-- 7. Credit Card Statement Cuts (Bimonetary Audit & Totalero Tracking - Module 4.4)
CREATE TABLE credit_card_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    period_label VARCHAR(40) NOT NULL, -- e.g. 'Octubre 2026'
    cutoff_date DATE NOT NULL,
    payment_due_date DATE NOT NULL,
    statement_balance_gtq NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    statement_balance_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount_gtq NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    interest_charged_gtq NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    interest_charged_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_totalero_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Visa Cuotas / 0% Installment Plans (Module 4.4)
CREATE TABLE installment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    merchant_name VARCHAR(160) NOT NULL,
    description VARCHAR(255) NOT NULL,
    currency currency_code NOT NULL DEFAULT 'GTQ',
    total_principal NUMERIC(14, 2) NOT NULL,
    monthly_installment NUMERIC(14, 2) NOT NULL,
    total_installments SMALLINT NOT NULL CHECK (total_installments > 0),
    paid_installments SMALLINT NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(14, 2) NOT NULL,
    interest_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    purchase_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 9. Mortgage & Long-Term Loans (Module 4.5)
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    lender VARCHAR(100) NOT NULL,
    currency currency_code NOT NULL DEFAULT 'GTQ',
    original_principal NUMERIC(14, 2) NOT NULL,
    current_principal_balance NUMERIC(14, 2) NOT NULL,
    annual_interest_rate NUMERIC(6, 3) NOT NULL, -- e.g. 7.500%
    remaining_term_months SMALLINT NOT NULL,
    scheduled_monthly_payment NUMERIC(14, 2) NOT NULL,
    monthly_insurance_and_fees NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    next_payment_date DATE NOT NULL
);

-- 10. Net Worth Historical Snapshots (Module 4.6)
CREATE TABLE net_worth_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_month DATE NOT NULL UNIQUE,
    liquid_assets_gtq NUMERIC(14, 2) NOT NULL,
    investment_assets_gtq NUMERIC(14, 2) NOT NULL,
    receivables_assets_gtq NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    current_liabilities_gtq NUMERIC(14, 2) NOT NULL,
    long_term_liabilities_gtq NUMERIC(14, 2) NOT NULL,
    net_worth_gtq NUMERIC(14, 2) NOT NULL
);

-- 11. Annual Milestones & Scheduled Extraordinary Events (Module 4.7)
CREATE TABLE financial_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    month_number SMALLINT NOT NULL CHECK (month_number BETWEEN 1 AND 12),
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('INCOME_BONUS', 'ANNUAL_EXPENSE')),
    estimated_amount_gtq NUMERIC(14, 2) NOT NULL,
    notes VARCHAR(255)
);

-- =============================================================================
-- SEED DATA (Realistic Guatemalan Financial Ecosystem)
-- =============================================================================

INSERT INTO accounts (id, name, institution, type, primary_currency, is_bimonetary, balance_gtq, balance_usd, credit_limit_gtq, cutoff_day, payment_due_day) VALUES
('11111111-1111-4111-8111-111111111101', 'Cuenta Monetaria Nómina', 'Banco Industrial', 'CHECKING', 'GTQ', FALSE, 28450.00, 0.00, NULL, NULL, NULL),
('11111111-1111-4111-8111-111111111102', 'Cuenta de Ahorro Dólares', 'BAC Credomatic', 'SAVINGS', 'USD', TRUE, 15000.00, 3200.00, NULL, NULL, NULL),
('11111111-1111-4111-8111-111111111103', 'Visa Infinite Bimonetaria', 'BAC Credomatic', 'CREDIT_CARD', 'GTQ', TRUE, -8420.50, -340.00, 65000.00, 18, 8),
('11111111-1111-4111-8111-111111111104', 'Fondo de Inversión Retiro', 'G&T Continental', 'INVESTMENT', 'GTQ', FALSE, 142000.00, 0.00, NULL, NULL, NULL),
('11111111-1111-4111-8111-111111111105', 'Préstamo Hipotecario Vivienda', 'Banco Industrial', 'LOAN', 'GTQ', FALSE, -685000.00, 0.00, NULL, 1, 5),
('11111111-1111-4111-8111-111111111106', 'Efectivo & Billetera Móvil', 'Efectivo', 'CASH_WALLET', 'GTQ', FALSE, 1850.00, 0.00, NULL, NULL, NULL);

INSERT INTO categories (id, name, slug, icon, color, macro_group, monthly_budget_limit_gtq) VALUES
('22222222-2222-4222-8222-222222222201', 'Vivienda & Hipoteca', 'vivienda-hipoteca', 'Home', 'blue', 'NEEDS_50', 6800.00),
('22222222-2222-4222-8222-222222222202', 'Supermercado & Despensa', 'supermercado-despensa', 'ShoppingCart', 'emerald', 'NEEDS_50', 3800.00),
('22222222-2222-4222-8222-222222222203', 'Transporte & Combustible', 'transporte-combustible', 'Fuel', 'amber', 'NEEDS_50', 1800.00),
('22222222-2222-4222-8222-222222222204', 'Salud & Farmacia', 'salud-farmacia', 'HeartPulse', 'rose', 'NEEDS_50', 1200.00),
('22222222-2222-4222-8222-222222222205', 'Servicios Básicos & Seguros', 'servicios-seguros', 'ShieldCheck', 'indigo', 'NEEDS_50', 1900.00),
('22222222-2222-4222-8222-222222222206', 'Restaurantes & Cafés', 'restaurantes-cafes', 'Utensils', 'orange', 'LIFESTYLE_30', 2400.00),
('22222222-2222-4222-8222-222222222207', 'Entretenimiento & Suscripciones', 'entretenimiento-suscripciones', 'Film', 'purple', 'LIFESTYLE_30', 1100.00),
('22222222-2222-4222-8222-222222222208', 'Compras Personales', 'compras-personales', 'ShoppingBag', 'pink', 'LIFESTYLE_30', 2000.00),
('22222222-2222-4222-8222-222222222209', 'Ahorro & Fondo de Inversión', 'ahorro-inversion', 'TrendingUp', 'teal', 'SAVINGS_20', 6200.00);

INSERT INTO categorization_rules (keyword_pattern, merchant_display_name, category_id, priority, usage_count) VALUES
('LA TORRE|WALMART|PAIZ|PRICESMART', 'Supermercados La Torre', '22222222-2222-4222-8222-222222222202', 1, 42),
('TEXACO|SHELL|PUMA|UNO GASOLINERA', 'Gasolinera Texaco', '22222222-2222-4222-8222-222222222203', 2, 35),
('SAN MARTIN|TRE FRATELLI|KFC|STARBUCKS', 'Panadería San Martín', '22222222-2222-4222-8222-222222222206', 3, 29),
('FARMACIA GALENO|CRUZ VERDE|MEYKOS', 'Farmacia Galeno', '22222222-2222-4222-8222-222222222204', 4, 18),
('EEGSA|EMPAGUA|TIGO|CLARO', 'EEGSA Energía Eléctrica', '22222222-2222-4222-8222-222222222205', 5, 12),
('NETFLIX|SPOTIFY|AMAZON PRIME|STEAM', 'Suscripciones Digitales', '22222222-2222-4222-8222-222222222207', 6, 15);

INSERT INTO uploaded_documents (id, file_name, file_type, document_kind, account_id, status, detected_transactions_count, reconciled_count, duplicates_prevented_count) VALUES
('33333333-3333-4333-8333-333333333301', 'Estado_Cuenta_Monetaria_BI_Oct2026.pdf', 'application/pdf', 'BANK_STATEMENT_PDF', '11111111-1111-4111-8111-111111111101', 'RECONCILED', 18, 18, 2),
('33333333-3333-4333-8333-333333333302', 'Estado_Cuenta_TC_BAC_Oct2026.pdf', 'application/pdf', 'BANK_STATEMENT_PDF', '11111111-1111-4111-8111-111111111103', 'RECONCILED', 24, 23, 3),
('33333333-3333-4333-8333-333333333303', 'Factura_Farmacia_Galeno_150GTQ.jpg', 'image/jpeg', 'RECEIPT_IMAGE', '11111111-1111-4111-8111-111111111103', 'RECONCILED', 1, 1, 1);

-- Seed Transactions covering Scenarios 1, 2, and reconciled mobile/PDF entries
INSERT INTO transactions (
    id, account_id, category_id, document_id, merchant_name, description, transaction_date,
    type, source, original_currency, exchange_rate_applied, total_amount_original,
    total_amount_gtq, is_split_expense, split_percentage, personal_amount_gtq, receivable_amount_gtq,
    is_receivable_settled, debtor_name, reconciliation_status, bank_reference_code
) VALUES
-- Scenario 1: Split Expense at Restaurant (Total Q600, Personal 50% = Q300, Receivable = Q300)
('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222206', NULL,
 'Restaurante San Martín', 'Cena familiar compartida (50% propio)', NOW() - INTERVAL '1 day',
 'EXPENSE', 'MOBILE_EXPRESS', 'GTQ', 1.0000, 600.00,
 600.00, TRUE, 50.00, 300.00, 300.00, FALSE, 'Familiar (Cena)', 'PENDING_STATEMENT_MATCH', 'MOB-901'),

-- Split Expense at Supermarket (Paid Q500, Personal Assumed Q200, Receivable Q300)
('44444444-4444-4444-8444-444444444402', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222202', '33333333-3333-4333-8333-333333333302',
 'Supermercados La Torre', 'Compra de supermercado compartida en pareja', NOW() - INTERVAL '3 days',
 'EXPENSE', 'MOBILE_EXPRESS', 'GTQ', 1.0000, 500.00,
 500.00, TRUE, 40.00, 200.00, 300.00, FALSE, 'Pareja', 'RECONCILED_MERGED', 'AUTH-77210'),

-- Reconciled Mobile + PDF Statement Entry (Farmacia Galeno Q150.00)
('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222204', '33333333-3333-4333-8333-333333333303',
 'Farmacia Galeno', 'Medicamentos con receta adjunta desde app Android', NOW() - INTERVAL '4 days',
 'EXPENSE', 'MOBILE_EXPRESS', 'GTQ', 1.0000, 150.00,
 150.00, FALSE, 100.00, 150.00, 0.00, TRUE, NULL, 'RECONCILED_MERGED', 'AUTH-88412'),

-- Regular Expense in USD on Bimonetary Card ($45.00 USD -> Q351.00 GTQ)
('44444444-4444-4444-8444-444444444404', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222207', '33333333-3333-4333-8333-333333333302',
 'Amazon Web Services & Prime', 'Suscripción y servicios cloud en USD', NOW() - INTERVAL '5 days',
 'EXPENSE', 'WEB_PDF_STATEMENT', 'USD', 7.8000, 45.00,
 351.00, FALSE, 100.00, 351.00, 0.00, TRUE, NULL, 'RECONCILED_MERGED', 'USD-99102'),

-- Fuel Expense
('44444444-4444-4444-8444-444444444405', '11111111-1111-4111-8111-111111111106', '22222222-2222-4222-8222-222222222203', NULL,
 'Gasolinera Texaco', 'Tanque lleno efectivo sin factura (RN-03)', NOW() - INTERVAL '2 days',
 'EXPENSE', 'MOBILE_EXPRESS', 'GTQ', 1.0000, 420.00,
 420.00, FALSE, 100.00, 420.00, 0.00, TRUE, NULL, 'UNRECONCILED', NULL),

-- Scenario 2: Internal Transfer Pair (Checking Debit Q14,618.32 <-> Credit Card Payment Q14,618.32)
('44444444-4444-4444-8444-444444444406', '11111111-1111-4111-8111-111111111101', NULL, '33333333-3333-4333-8333-333333333301',
 'BANCA MOVIL PAGO TC', 'Débito cuenta monetaria para pago de contado TC', NOW() - INTERVAL '6 days',
 'INTERNAL_TRANSFER', 'WEB_PDF_STATEMENT', 'GTQ', 1.0000, 14618.32,
 14618.32, FALSE, 100.00, 0.00, 0.00, TRUE, NULL, 'INTERNAL_TRANSFER_MATCHED', 'BM-1461832'),

('44444444-4444-4444-8444-444444444407', '11111111-1111-4111-8111-111111111103', NULL, '33333333-3333-4333-8333-333333333302',
 'GRACIAS POR SU PAGO', 'Crédito en tarjeta por pago de contado', NOW() - INTERVAL '6 days',
 'INTERNAL_TRANSFER', 'WEB_PDF_STATEMENT', 'GTQ', 1.0000, 14618.32,
 14618.32, FALSE, 100.00, 0.00, 0.00, TRUE, NULL, 'INTERNAL_TRANSFER_MATCHED', 'TC-1461832'),

-- Monthly Salary Income
('44444444-4444-4444-8444-444444444408', '11111111-1111-4111-8111-111111111101', NULL, '33333333-3333-4333-8333-333333333301',
 'PLANILLA CORPORATIVA S.A.', 'Salario Mensual Neto acreditado', NOW() - INTERVAL '8 days',
 'INCOME', 'WEB_PDF_STATEMENT', 'GTQ', 1.0000, 28500.00,
 28500.00, FALSE, 100.00, 28500.00, 0.00, TRUE, NULL, 'RECONCILED_MERGED', 'ACH-SAL-10');

-- Link the internal transfer pair
UPDATE transactions SET linked_transaction_id = '44444444-4444-4444-8444-444444444407' WHERE id = '44444444-4444-4444-8444-444444444406';
UPDATE transactions SET linked_transaction_id = '44444444-4444-4444-8444-444444444406' WHERE id = '44444444-4444-4444-8444-444444444407';

-- Mortgage Loan Payment with Accounting Breakdown (Principal Q1,850 + Interest Q4,281.25 + Insurance Q368.75 = Q6,500)
INSERT INTO transactions (
    id, account_id, category_id, document_id, merchant_name, description, transaction_date,
    type, source, original_currency, exchange_rate_applied, total_amount_original,
    total_amount_gtq, is_split_expense, split_percentage, personal_amount_gtq, receivable_amount_gtq,
    principal_amount_gtq, interest_amount_gtq, insurance_fees_gtq, reconciliation_status
) VALUES (
    '44444444-4444-4444-8444-444444444409', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301',
    'Banco Industrial Hipoteca', 'Cuota mensual préstamo hipotecario (Capital + Interés + Seguro)', NOW() - INTERVAL '5 days',
    'LOAN_PAYMENT', 'WEB_PDF_STATEMENT', 'GTQ', 1.0000, 6500.00,
    6500.00, FALSE, 100.00, 6500.00, 0.00,
    1850.00, 4281.25, 368.75, 'RECONCILED_MERGED'
);

-- Planned Savings Contribution
INSERT INTO transactions (
    id, account_id, category_id, document_id, merchant_name, description, transaction_date,
    type, source, original_currency, exchange_rate_applied, total_amount_original,
    total_amount_gtq, is_split_expense, split_percentage, personal_amount_gtq, receivable_amount_gtq,
    reconciliation_status
) VALUES (
    '44444444-4444-4444-8444-444444444410', '11111111-1111-4111-8111-111111111104', '22222222-2222-4222-8222-222222222209', '33333333-3333-4333-8333-333333333301',
    'Fondo de Inversión G&T', 'Aporte programado mensual al fondo de retiro', NOW() - INTERVAL '4 days',
    'EXPENSE', 'WEB_PDF_STATEMENT', 'GTQ', 1.0000, 5500.00,
    5500.00, FALSE, 100.00, 5500.00, 0.00,
    'RECONCILED_MERGED'
);

-- Seed Credit Card Statements (Bimonetary Audit)
INSERT INTO credit_card_statements (
    account_id, period_label, cutoff_date, payment_due_date,
    statement_balance_gtq, statement_balance_usd, paid_amount_gtq, paid_amount_usd,
    interest_charged_gtq, interest_charged_usd, is_totalero_compliant
) VALUES
('11111111-1111-4111-8111-111111111103', 'Septiembre 2026', '2026-09-18', '2026-10-08', 12450.00, 280.00, 12450.00, 280.00, 0.00, 0.00, TRUE),
('11111111-1111-4111-8111-111111111103', 'Octubre 2026', '2026-10-18', '2026-11-08', 14618.32, 310.00, 14618.32, 310.00, 0.00, 0.00, TRUE),
('11111111-1111-4111-8111-111111111103', 'Noviembre 2026 (En Curso)', '2026-11-18', '2026-12-08', 8420.50, 340.00, 0.00, 0.00, 0.00, 0.00, TRUE);

-- Seed Installment Plans (Visa Cuotas 0%)
INSERT INTO installment_plans (
    account_id, merchant_name, description, currency, total_principal,
    monthly_installment, total_installments, paid_installments, remaining_balance,
    interest_rate, purchase_date
) VALUES
('11111111-1111-4111-8111-111111111103', 'iShop Guatemala', 'MacBook Pro M3 14"', 'GTQ', 15600.00, 1300.00, 12, 8, 5200.00, 0.00, '2026-03-15'),
('11111111-1111-4111-8111-111111111103', 'MAX Distelsa', 'Refrigeradora Inverter LG', 'GTQ', 9000.00, 900.00, 10, 5, 4500.00, 0.00, '2026-06-10'),
('11111111-1111-4111-8111-111111111103', 'Pricesmart', 'Llantas Michelin Set x4', 'GTQ', 4800.00, 800.00, 6, 4, 1600.00, 0.00, '2026-07-20');

-- Seed Mortgage Loan (Scenario 3)
INSERT INTO loans (
    account_id, name, lender, currency, original_principal, current_principal_balance,
    annual_interest_rate, remaining_term_months, scheduled_monthly_payment, monthly_insurance_and_fees, next_payment_date
) VALUES (
    '11111111-1111-4111-8111-111111111105', 'Préstamo Hipotecario Residencial Zona 14', 'Banco Industrial', 'GTQ',
    850000.00, 685000.00, 7.500, 180, 6349.98, 368.75, '2026-12-05'
);

-- Seed Net Worth Historical Evolution
INSERT INTO net_worth_snapshots (
    snapshot_month, liquid_assets_gtq, investment_assets_gtq, receivables_assets_gtq,
    current_liabilities_gtq, long_term_liabilities_gtq, net_worth_gtq
) VALUES
('2026-06-01', 49200.00, 120000.00, 450.00, 14200.00, 694200.00, -538750.00),
('2026-07-01', 58400.00, 126000.00, 300.00, 11800.00, 692350.00, -519450.00),
('2026-08-01', 61100.00, 131500.00, 800.00, 13100.00, 690500.00, -510200.00),
('2026-09-01', 64800.00, 136800.00, 250.00, 14634.00, 688650.00, -501434.00),
('2026-10-01', 67900.00, 142000.00, 600.00, 17036.32, 686850.00, -493386.32),
('2026-11-01', 70260.00, 142000.00, 600.00, 11072.50, 685000.00, -483212.50);

-- Seed Annual Milestones (Module 4.7)
INSERT INTO financial_milestones (name, month_number, kind, estimated_amount_gtq, notes) VALUES
('Bono 14 (Prestación Legal Julio)', 7, 'INCOME_BONUS', 28500.00, 'Ingreso extraordinario libre de ISR - 50% a fondo de inversión, 50% amortización capital'),
('Aguinaldo (Diciembre)', 12, 'INCOME_BONUS', 28500.00, 'Liquidez de cierre de año y provisiones navideñas'),
('Seguro Médico y Automóvil Anual', 11, 'ANNUAL_EXPENSE', 6800.00, 'Renovación anual de póliza familiar'),
('Inscripciones y Útiles Escolares', 1, 'ANNUAL_EXPENSE', 8500.00, 'Inicio de ciclo escolar anual');
