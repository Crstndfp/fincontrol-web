import { NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { evaluateBudgetSemaphore } from "@/lib/financial-engine";

export async function GET() {
  try {
    const accounts = await queryDb(`
      SELECT id, name, institution, type, primary_currency, is_bimonetary,
             balance_gtq::float AS balance_gtq, balance_usd::float AS balance_usd,
             credit_limit_gtq::float AS credit_limit_gtq, cutoff_day, payment_due_day
      FROM accounts
      WHERE is_active = TRUE
      ORDER BY created_at ASC
    `);

    const categoriesWithSpend = await queryDb(`
      SELECT c.id, c.name, c.slug, c.icon, c.color, c.macro_group,
             c.monthly_budget_limit_gtq::float AS monthly_budget_limit_gtq,
             COALESCE(SUM(CASE WHEN t.type IN ('EXPENSE', 'LOAN_PAYMENT') THEN t.personal_amount_gtq ELSE 0 END), 0)::float AS executed_personal_gtq
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id
      GROUP BY c.id
      ORDER BY c.macro_group, c.name
    `);

    const transactions = await queryDb(`
      SELECT t.id, t.account_id, a.name AS account_name, t.category_id, c.name AS category_name,
             t.merchant_name, t.description, t.transaction_date, t.type, t.source,
             t.original_currency, t.exchange_rate_applied::float AS exchange_rate_applied,
             t.total_amount_original::float AS total_amount_original,
             t.total_amount_gtq::float AS total_amount_gtq,
             t.is_split_expense, t.split_percentage::float AS split_percentage,
             t.personal_amount_gtq::float AS personal_amount_gtq,
             t.receivable_amount_gtq::float AS receivable_amount_gtq,
             t.is_receivable_settled, t.debtor_name,
             t.principal_amount_gtq::float AS principal_amount_gtq,
             t.interest_amount_gtq::float AS interest_amount_gtq,
             t.insurance_fees_gtq::float AS insurance_fees_gtq,
             t.reconciliation_status, t.bank_reference_code, t.is_manual_override
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY t.transaction_date DESC
      LIMIT 40
    `);

    const documents = await queryDb(`
      SELECT d.id, d.file_name, d.file_type, d.document_kind, a.name AS account_name,
             d.status, d.detected_transactions_count, d.reconciled_count,
             d.duplicates_prevented_count, d.uploaded_at
      FROM uploaded_documents d
      LEFT JOIN accounts a ON a.id = d.account_id
      ORDER BY d.uploaded_at DESC
    `);

    const statements = await queryDb(`
      SELECT s.id, a.name AS card_name, s.period_label, s.cutoff_date, s.payment_due_date,
             s.statement_balance_gtq::float AS statement_balance_gtq,
             s.statement_balance_usd::float AS statement_balance_usd,
             s.paid_amount_gtq::float AS paid_amount_gtq,
             s.paid_amount_usd::float AS paid_amount_usd,
             s.interest_charged_gtq::float AS interest_charged_gtq,
             s.interest_charged_usd::float AS interest_charged_usd,
             s.is_totalero_compliant
      FROM credit_card_statements s
      JOIN accounts a ON a.id = s.account_id
      ORDER BY s.cutoff_date DESC
    `);

    const installments = await queryDb(`
      SELECT id, merchant_name, description, currency,
             total_principal::float AS total_principal,
             monthly_installment::float AS monthly_installment,
             total_installments, paid_installments,
             remaining_balance::float AS remaining_balance,
             interest_rate::float AS interest_rate, purchase_date
      FROM installment_plans
      WHERE is_active = TRUE
      ORDER BY purchase_date DESC
    `);

    const loans = await queryDb(`
      SELECT id, name, lender, currency,
             original_principal::float AS original_principal,
             current_principal_balance::float AS current_principal_balance,
             annual_interest_rate::float AS annual_interest_rate,
             remaining_term_months,
             scheduled_monthly_payment::float AS scheduled_monthly_payment,
             monthly_insurance_and_fees::float AS monthly_insurance_and_fees,
             next_payment_date
      FROM loans
    `);

    const snapshots = await queryDb(`
      SELECT snapshot_month,
             liquid_assets_gtq::float AS liquid_assets_gtq,
             investment_assets_gtq::float AS investment_assets_gtq,
             receivables_assets_gtq::float AS receivables_assets_gtq,
             current_liabilities_gtq::float AS current_liabilities_gtq,
             long_term_liabilities_gtq::float AS long_term_liabilities_gtq,
             net_worth_gtq::float AS net_worth_gtq
      FROM net_worth_snapshots
      ORDER BY snapshot_month ASC
    `);

    const milestones = await queryDb(`
      SELECT id, name, month_number, kind,
             estimated_amount_gtq::float AS estimated_amount_gtq, notes
      FROM financial_milestones
      ORDER BY month_number ASC
    `);

    const rules = await queryDb(`
      SELECT r.id, r.keyword_pattern, r.merchant_display_name,
             r.category_id, c.name AS category_name, c.macro_group,
             r.priority, r.usage_count
      FROM categorization_rules r
      JOIN categories c ON c.id = r.category_id
      WHERE r.is_active = TRUE
      ORDER BY r.priority ASC
    `);

    // Enrich categories with semaphore status
    const enrichedCategories = categoriesWithSpend.map((cat) => {
      const sem = evaluateBudgetSemaphore(
        Number(cat.executed_personal_gtq),
        Number(cat.monthly_budget_limit_gtq)
      );
      return { ...cat, ...sem };
    });

    return NextResponse.json({
      accounts,
      categories: enrichedCategories,
      transactions,
      documents,
      statements,
      installments,
      loans,
      snapshots,
      milestones,
      rules,
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json(
      { error: "Failed to load financial overview" },
      { status: 500 }
    );
  }
}
