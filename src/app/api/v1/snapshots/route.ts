import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";

/**
 * Module 4.6: Create / Update Net Worth Monthly Snapshot
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { snapshotMonth, liquidAssetsGtq, investmentAssetsGtq, receivablesAssetsGtq, currentLiabilitiesGtq, longTermLiabilitiesGtq } = body;

    const netWorth = Number(liquidAssetsGtq) + Number(investmentAssetsGtq) + Number(receivablesAssetsGtq || 0) - Number(currentLiabilitiesGtq) - Number(longTermLiabilitiesGtq);

    const inserted = await queryDb(
      `INSERT INTO net_worth_snapshots (
        snapshot_month, liquid_assets_gtq, investment_assets_gtq,
        receivables_assets_gtq, current_liabilities_gtq, long_term_liabilities_gtq,
        net_worth_gtq
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (snapshot_month) DO UPDATE
      SET liquid_assets_gtq = EXCLUDED.liquid_assets_gtq,
          investment_assets_gtq = EXCLUDED.investment_assets_gtq,
          receivables_assets_gtq = EXCLUDED.receivables_assets_gtq,
          current_liabilities_gtq = EXCLUDED.current_liabilities_gtq,
          long_term_liabilities_gtq = EXCLUDED.long_term_liabilities_gtq,
          net_worth_gtq = EXCLUDED.net_worth_gtq
      RETURNING *`,
      [
        snapshotMonth,
        liquidAssetsGtq,
        investmentAssetsGtq,
        receivablesAssetsGtq || 0,
        currentLiabilitiesGtq,
        longTermLiabilitiesGtq,
        netWorth,
      ]
    );

    return NextResponse.json({ snapshot: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("Snapshot Error:", error);
    return NextResponse.json({ error: "Failed to record net worth snapshot" }, { status: 500 });
  }
}
