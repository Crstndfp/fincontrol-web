import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";

/**
 * Module 4.3: Update Category Budget Limit & Macro Group (50/30/20)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, monthlyBudgetLimitGtq, macroGroup } = body;

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const updated = await queryDb(
      `UPDATE categories
       SET monthly_budget_limit_gtq = COALESCE($1, monthly_budget_limit_gtq),
           macro_group = COALESCE($2, macro_group)
       WHERE id = $3
       RETURNING *`,
      [monthlyBudgetLimitGtq !== undefined ? Number(monthlyBudgetLimitGtq) : null, macroGroup || null, id]
    );

    if (updated.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json({ category: updated[0] });
  } catch (error) {
    console.error("Update Category Error:", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}
