import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryDb } from "@/lib/db";

const CreateStatementSchema = z.object({
  accountId: z.string().uuid().optional(),
  periodLabel: z.string().min(1),
  cutoffDate: z.string().min(1),
  paymentDueDate: z.string().min(1),
  statementBalanceGtq: z.number().min(0),
  statementBalanceUsd: z.number().min(0),
  paidAmountGtq: z.number().min(0),
  paidAmountUsd: z.number().min(0),
  interestChargedGtq: z.number().min(0).default(0),
  interestChargedUsd: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateStatementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const defaultAccountId = data.accountId || "11111111-1111-4111-8111-111111111103";

    // Mathematical audit of Totalero status (0% interest and fully paid)
    const isTotalero =
      data.interestChargedGtq === 0 &&
      data.interestChargedUsd === 0 &&
      data.paidAmountGtq >= data.statementBalanceGtq &&
      data.paidAmountUsd >= data.statementBalanceUsd;

    const inserted = await queryDb(
      `INSERT INTO credit_card_statements (
        account_id, period_label, cutoff_date, payment_due_date,
        statement_balance_gtq, statement_balance_usd,
        paid_amount_gtq, paid_amount_usd,
        interest_charged_gtq, interest_charged_usd,
        is_totalero_compliant
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        defaultAccountId,
        data.periodLabel,
        data.cutoffDate,
        data.paymentDueDate,
        data.statementBalanceGtq,
        data.statementBalanceUsd,
        data.paidAmountGtq,
        data.paidAmountUsd,
        data.interestChargedGtq,
        data.interestChargedUsd,
        isTotalero,
      ]
    );

    return NextResponse.json({ statement: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("Create Statement Error:", error);
    return NextResponse.json({ error: "Failed to record credit card statement" }, { status: 500 });
  }
}
