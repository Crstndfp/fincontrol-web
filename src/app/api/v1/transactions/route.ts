import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryDb } from "@/lib/db";
import { calculateSplitExpense } from "@/lib/financial-engine";

// RN-03: No tax ID (NIT) or invoice number required
const CreateTransactionSchema = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  merchantName: z.string().min(1, "Merchant name is required"),
  description: z.string().optional().default(""),
  transactionDate: z.string().optional(),
  currency: z.enum(["GTQ", "USD"]).default("GTQ"),
  totalAmountOriginal: z.number().positive(),
  exchangeRateToGtq: z.number().positive().optional().default(7.8),
  splitMode: z
    .enum(["NONE", "PERCENTAGE", "EXACT_PERSONAL_AMOUNT"])
    .default("NONE"),
  percentageOwn: z.number().min(1).max(100).optional(),
  exactPersonalAmountOriginal: z.number().min(0).optional(),
  debtorName: z.string().optional(),
  source: z
    .enum(["MOBILE_EXPRESS", "WEB_PDF_STATEMENT", "WEB_MANUAL"])
    .default("MOBILE_EXPRESS"),
  receiptAttachmentUrl: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Calculate Split Expense (RN-01 & RN-05)
    const splitCalc = calculateSplitExpense({
      totalAmountOriginal: data.totalAmountOriginal,
      currency: data.currency,
      exchangeRateToGtq: data.exchangeRateToGtq,
      mode: data.splitMode,
      percentageOwn: data.percentageOwn,
      exactPersonalAmountOriginal: data.exactPersonalAmountOriginal,
    });

    // Auto-predict category from categorization_rules if categoryId not provided
    let resolvedCategoryId = data.categoryId || null;
    if (!resolvedCategoryId) {
      const rules = await queryDb<{ category_id: string; keyword_pattern: string }>(
        `SELECT category_id, keyword_pattern FROM categorization_rules WHERE is_active = TRUE ORDER BY priority ASC`
      );
      const upperMerchant = data.merchantName.toUpperCase();
      for (const r of rules) {
        const keywords = r.keyword_pattern.split("|");
        if (keywords.some((k) => upperMerchant.includes(k.trim().toUpperCase()))) {
          resolvedCategoryId = r.category_id;
          break;
        }
      }
    }

    const defaultAccountId =
      data.accountId || "11111111-1111-4111-8111-111111111103"; // Default Visa Infinite

    // Check if there is an existing pending PDF statement transaction to auto-reconcile (Module 4.2)
    const existingMatches = await queryDb<{ id: string }>(
      `SELECT id FROM transactions
       WHERE account_id = $1
         AND original_currency = $2
         AND ABS(total_amount_original - $3) < 0.01
         AND reconciliation_status = 'PENDING_STATEMENT_MATCH'
         AND source != $4
       LIMIT 1`,
      [defaultAccountId, data.currency, splitCalc.totalAmountOriginal, data.source]
    );

    const reconciliationStatus =
      existingMatches.length > 0
        ? "RECONCILED_MERGED"
        : data.source === "MOBILE_EXPRESS"
        ? "PENDING_STATEMENT_MATCH"
        : "UNRECONCILED";

    const inserted = await queryDb(
      `INSERT INTO transactions (
        account_id, category_id, merchant_name, description, transaction_date,
        type, source, original_currency, exchange_rate_applied,
        total_amount_original, total_amount_gtq, is_split_expense,
        split_percentage, personal_amount_gtq, receivable_amount_gtq,
        debtor_name, reconciliation_status, receipt_attachment_url
      ) VALUES (
        $1, $2, $3, $4, COALESCE($5::timestamptz, NOW()),
        'EXPENSE', $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17
      ) RETURNING *`,
      [
        defaultAccountId,
        resolvedCategoryId,
        data.merchantName,
        data.description,
        data.transactionDate || null,
        data.source,
        data.currency,
        data.currency === "USD" ? data.exchangeRateToGtq : 1.0,
        splitCalc.totalAmountOriginal,
        splitCalc.totalAmountGtq,
        splitCalc.isSplitExpense,
        splitCalc.appliedPercentage,
        splitCalc.personalAmountGtq,
        splitCalc.receivableAmountGtq,
        data.debtorName || (splitCalc.isSplitExpense ? "Tercero por liquidar" : null),
        reconciliationStatus,
        data.receiptAttachmentUrl || null,
      ]
    );

    return NextResponse.json(
      {
        transaction: inserted[0],
        accountingBreakdown: splitCalc,
        reconciledExistingId: existingMatches[0]?.id || null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create Transaction Error:", error);
    return NextResponse.json(
      { error: "Failed to record transaction" },
      { status: 500 }
    );
  }
}
