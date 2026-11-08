import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { roundCurrency } from "@/lib/financial-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * RN-04: Reversibility & Audit
 * Allows manual overrides of categorized transactions, split accounting adjustments, or status changes.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await queryDb<any>(
      `SELECT * FROM transactions WHERE id = $1`,
      [id]
    );

    if (existing.length === 0) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const current = existing[0];

    const categoryId = body.categoryId !== undefined ? body.categoryId : current.category_id;
    const merchantName = body.merchantName || current.merchant_name;
    const description = body.description !== undefined ? body.description : current.description;
    const reconciliationStatus = body.reconciliationStatus || current.reconciliation_status;

    let totalAmountGtq = current.total_amount_gtq;
    let personalAmountGtq = current.personal_amount_gtq;
    let receivableAmountGtq = current.receivable_amount_gtq;
    let splitPercentage = current.split_percentage;
    let isSplitExpense = current.is_split_expense;

    if (body.splitPercentage !== undefined) {
      isSplitExpense = body.splitPercentage < 100;
      splitPercentage = Number(body.splitPercentage);
      personalAmountGtq = roundCurrency((totalAmountGtq * splitPercentage) / 100);
      receivableAmountGtq = roundCurrency(totalAmountGtq - personalAmountGtq);
    } else if (body.personalAmountGtq !== undefined) {
      personalAmountGtq = roundCurrency(Number(body.personalAmountGtq));
      receivableAmountGtq = roundCurrency(totalAmountGtq - personalAmountGtq);
      splitPercentage = roundCurrency((personalAmountGtq / totalAmountGtq) * 100);
      isSplitExpense = receivableAmountGtq > 0;
    }

    const updated = await queryDb(
      `UPDATE transactions
       SET category_id = $1,
           merchant_name = $2,
           description = $3,
           reconciliation_status = $4,
           personal_amount_gtq = $5,
           receivable_amount_gtq = $6,
           split_percentage = $7,
           is_split_expense = $8,
           is_manual_override = TRUE,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        categoryId,
        merchantName,
        description,
        reconciliationStatus,
        personalAmountGtq,
        receivableAmountGtq,
        splitPercentage,
        isSplitExpense,
        id,
      ]
    );

    return NextResponse.json({ transaction: updated[0] });
  } catch (error) {
    console.error("PATCH Transaction Error:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await queryDb(`DELETE FROM transactions WHERE id = $1`, [id]);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("DELETE Transaction Error:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
