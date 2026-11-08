import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";

/**
 * Module 4.3: Categorization Keyword Rules Manager
 * Allows creating and reordering keyword rules (e.g. WALMART -> Supermercado / NEEDS_50)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keywordPattern, merchantDisplayName, categoryId, priority = 10 } = body;

    if (!keywordPattern || !merchantDisplayName || !categoryId) {
      return NextResponse.json(
        { error: "keywordPattern, merchantDisplayName, and categoryId are required" },
        { status: 400 }
      );
    }

    const inserted = await queryDb(
      `INSERT INTO categorization_rules (
        keyword_pattern, merchant_display_name, category_id, priority
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [keywordPattern.toUpperCase(), merchantDisplayName, categoryId, Number(priority)]
    );

    return NextResponse.json({ rule: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("Create Rule Error:", error);
    return NextResponse.json(
      { error: "Failed to create categorization rule" },
      { status: 500 }
    );
  }
}
