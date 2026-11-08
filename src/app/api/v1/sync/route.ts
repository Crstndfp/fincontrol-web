import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { calculateSplitExpense, evaluateBudgetSemaphore } from "@/lib/financial-engine";

interface IncomingTransaction {
  id: string;
  merchantName: string;
  categoryName?: string;
  currency: "GTQ" | "USD";
  totalAmountOriginal: number;
  isSplitExpense: boolean;
  splitPercentage: number;
  personalAmountGtq: number;
  receivableAmountGtq: number;
  timestampEpochMillis: number;
}

/**
 * Module 3 & 4: Two-Way Atomic Sync Endpoint for LAN / Offline-First Mobile App
 * - PUSH: Receives batched offline transactions recorded while disconnected.
 * - PULL: Returns updated accounts, liquid balances, 50/30/20 budgets, and credit card alerts
 *   so the Android app can cache them locally in Room and function 100% offline.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pendingTransactions: IncomingTransaction[] = body.pendingTransactions || [];
    const defaultAccountId = "11111111-1111-4111-8111-111111111103"; // Default Visa Infinite

    // 1. Process PUSH (Incoming offline expenses)
    let pushedCount = 0;
    if (pendingTransactions.length > 0) {
      // Fetch categories for mapping
      const categories = await queryDb<{ id: string; name: string }>(
        `SELECT id, name FROM categories`
      );

      for (const tx of pendingTransactions) {
        const matchedCat = categories.find(
          (c) => c.name.toLowerCase() === (tx.categoryName || "").toLowerCase()
        );
        const categoryId = matchedCat?.id || null;

        const dateIso = new Date(tx.timestampEpochMillis || Date.now()).toISOString();

        // Check if transaction already exists (idempotency)
        const existing = await queryDb<{ id: string }>(
          `SELECT id FROM transactions WHERE id = $1`,
          [tx.id]
        );

        if (existing.length === 0) {
          await queryDb(
            `INSERT INTO transactions (
              id, account_id, category_id, merchant_name, description,
              transaction_date, type, source, original_currency,
              exchange_rate_applied, total_amount_original, total_amount_gtq,
              is_split_expense, split_percentage, personal_amount_gtq,
              receivable_amount_gtq, reconciliation_status
            ) VALUES (
              $1, $2, $3, $4, 'Sincronizado desde app móvil en red local',
              $5, 'EXPENSE', 'MOBILE_EXPRESS', $6,
              $7, $8, $9,
              $10, $11, $12,
              $13, 'PENDING_STATEMENT_MATCH'
            )`,
            [
              tx.id,
              defaultAccountId,
              categoryId,
              tx.merchantName,
              dateIso,
              tx.currency,
              tx.currency === "USD" ? 7.8 : 1.0,
              tx.totalAmountOriginal,
              tx.currency === "USD" ? tx.totalAmountOriginal * 7.8 : tx.totalAmountOriginal,
              tx.isSplitExpense,
              tx.splitPercentage,
              tx.personalAmountGtq,
              tx.receivableAmountGtq,
            ]
          );
          pushedCount++;
        }
      }
    }

    // 2. Prepare PULL (Latest consolidated state for mobile Room cache)
    const accounts = await queryDb(
      `SELECT id, name, institution, type, primary_currency, is_bimonetary,
              balance_gtq::float AS balance_gtq, balance_usd::float AS balance_usd,
              cutoff_day, payment_due_day
       FROM accounts WHERE is_active = TRUE`
    );

    const categoriesWithSpend = await queryDb(
      `SELECT c.id, c.name, c.macro_group,
              c.monthly_budget_limit_gtq::float AS monthly_budget_limit_gtq,
              COALESCE(SUM(CASE WHEN t.type IN ('EXPENSE', 'LOAN_PAYMENT') THEN t.personal_amount_gtq ELSE 0 END), 0)::float AS executed_personal_gtq
       FROM categories c
       LEFT JOIN transactions t ON t.category_id = c.id
       GROUP BY c.id`
    );

    const recentTransactions = await queryDb(
      `SELECT t.id, t.merchant_name, c.name AS category_name,
              t.original_currency AS currency,
              t.total_amount_original::float AS total_amount,
              t.personal_amount_gtq::float AS personal_amount,
              t.receivable_amount_gtq::float AS receivable_amount,
              t.is_split_expense AS is_split,
              t.transaction_date,
              t.reconciliation_status
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY t.transaction_date DESC
       LIMIT 10`
    );

    // Compute fresh KPIs
    const liquidAssetsGtq = accounts
      .filter((a: any) => ["CHECKING", "SAVINGS", "CASH_WALLET"].includes(a.type))
      .reduce((acc: number, a: any) => acc + a.balance_gtq + a.balance_usd * 7.8, 0);

    const monthlyTotalBudgetGtq = categoriesWithSpend.reduce(
      (acc: number, c: any) => acc + c.monthly_budget_limit_gtq,
      0
    );

    const monthlyPersonalExecutedGtq = categoriesWithSpend.reduce(
      (acc: number, c: any) => acc + c.executed_personal_gtq,
      0
    );

    const semaphore = evaluateBudgetSemaphore(monthlyPersonalExecutedGtq, monthlyTotalBudgetGtq);

    return NextResponse.json({
      syncSummary: {
        pushedExpensesCount: pushedCount,
        serverTime: new Date().toISOString(),
      },
      cachedState: {
        liquidAssetsGtq,
        monthlyBudgetCeilingGtq: monthlyTotalBudgetGtq,
        monthlyPersonalExecutedGtq,
        semaphoreStatus: semaphore.status,
        accounts,
        categories: categoriesWithSpend,
        recentMovements: recentTransactions,
      },
    });
  } catch (error) {
    console.error("Two-Way Sync Error:", error);
    return NextResponse.json(
      { error: "Failed to process two-way sync" },
      { status: 500 }
    );
  }
}
