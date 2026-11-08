import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryDb } from "@/lib/db";

const CreateMilestoneSchema = z.object({
  name: z.string().min(1),
  monthNumber: z.number().int().min(1).max(12),
  kind: z.enum(["INCOME_BONUS", "ANNUAL_EXPENSE"]),
  estimatedAmountGtq: z.number().positive(),
  notes: z.string().optional().default(""),
});

export async function GET() {
  try {
    const milestones = await queryDb(
      `SELECT id, name, month_number, kind,
              estimated_amount_gtq::float AS estimated_amount_gtq, notes
       FROM financial_milestones
       ORDER BY month_number ASC`
    );
    return NextResponse.json({ milestones });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch milestones" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateMilestoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { name, monthNumber, kind, estimatedAmountGtq, notes } = parsed.data;

    const inserted = await queryDb(
      `INSERT INTO financial_milestones (
        name, month_number, kind, estimated_amount_gtq, notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [name, monthNumber, kind, estimatedAmountGtq, notes]
    );

    return NextResponse.json({ milestone: inserted[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create milestone" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Milestone ID is required" }, { status: 400 });
    }
    await queryDb(`DELETE FROM financial_milestones WHERE id = $1`, [id]);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete milestone" }, { status: 500 });
  }
}
