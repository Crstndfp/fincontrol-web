import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryDb } from "@/lib/db";
import { roundCurrency } from "@/lib/financial-engine";

const CreateInstallmentSchema = z.object({
  accountId: z.string().uuid().optional(),
  merchantName: z.string().min(1),
  description: z.string().min(1),
  currency: z.enum(["GTQ", "USD"]).default("GTQ"),
  totalPrincipal: z.number().positive(),
  totalInstallments: z.number().int().min(1).max(48),
  purchaseDate: z.string().optional(),
});

export async function GET() {
  try {
    const plans = await queryDb(
      `SELECT id, account_id, merchant_name, description, currency,
              total_principal::float AS total_principal,
              monthly_installment::float AS monthly_installment,
              total_installments, paid_installments,
              remaining_balance::float AS remaining_balance,
              interest_rate::float AS interest_rate,
              purchase_date, is_active
       FROM installment_plans
       WHERE is_active = TRUE
       ORDER BY purchase_date DESC`
    );
    return NextResponse.json({ installments: plans });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch installments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateInstallmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { accountId, merchantName, description, currency, totalPrincipal, totalInstallments, purchaseDate } = parsed.data;
    const defaultAccountId = accountId || "11111111-1111-4111-8111-111111111103";
    const monthlyInstallment = roundCurrency(totalPrincipal / totalInstallments);
    const purchaseDateVal = purchaseDate || new Date().toISOString().slice(0, 10);

    const inserted = await queryDb(
      `INSERT INTO installment_plans (
        account_id, merchant_name, description, currency,
        total_principal, monthly_installment, total_installments,
        paid_installments, remaining_balance, interest_rate, purchase_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $5, 0.00, $8)
      RETURNING *`,
      [
        defaultAccountId,
        merchantName,
        description,
        currency,
        totalPrincipal,
        monthlyInstallment,
        totalInstallments,
        purchaseDateVal,
      ]
    );

    return NextResponse.json({ installment: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("Create Installment Error:", error);
    return NextResponse.json({ error: "Failed to create installment plan" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action } = body;

    if (!id || (action !== "ADVANCE_PAYMENT" && action !== "SETTLE_EARLY")) {
      return NextResponse.json({ error: "Invalid action or ID" }, { status: 400 });
    }

    const existing = await queryDb<any>(
      `SELECT * FROM installment_plans WHERE id = $1`,
      [id]
    );

    if (existing.length === 0) {
      return NextResponse.json({ error: "Installment plan not found" }, { status: 404 });
    }

    const plan = existing[0];

    if (action === "SETTLE_EARLY") {
      const updated = await queryDb(
        `UPDATE installment_plans
         SET paid_installments = total_installments,
             remaining_balance = 0.00,
             is_active = FALSE
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      return NextResponse.json({ installment: updated[0] });
    }

    // ADVANCE_PAYMENT
    const newPaid = plan.paid_installments + 1;
    const newRemaining = Math.max(0, plan.remaining_balance - plan.monthly_installment);
    const isActive = newPaid < plan.total_installments && newRemaining > 0;

    const updated = await queryDb(
      `UPDATE installment_plans
       SET paid_installments = $1,
           remaining_balance = $2,
           is_active = $3
       WHERE id = $4
       RETURNING *`,
      [newPaid, roundCurrency(newRemaining), isActive, id]
    );

    return NextResponse.json({ installment: updated[0] });
  } catch (error) {
    return NextResponse.json({ error: "Failed to advance payment" }, { status: 500 });
  }
}
