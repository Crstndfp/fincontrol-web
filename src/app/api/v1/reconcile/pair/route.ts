import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";

/**
 * RN-02 & RN-04: Manual Reversible Pairing of Internal Transfers and Merged Receipts
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, transactionIdA, transactionIdB } = body;

    if (!transactionIdA) {
      return NextResponse.json({ error: "transactionIdA is required" }, { status: 400 });
    }

    if (action === "PAIR_INTERNAL_TRANSFER") {
      if (!transactionIdB) {
        return NextResponse.json({ error: "transactionIdB is required to pair" }, { status: 400 });
      }

      await queryDb(
        `UPDATE transactions
         SET type = 'INTERNAL_TRANSFER',
             reconciliation_status = 'INTERNAL_TRANSFER_MATCHED',
             linked_transaction_id = $1,
             personal_amount_gtq = 0.00,
             receivable_amount_gtq = 0.00,
             is_manual_override = TRUE,
             updated_at = NOW()
         WHERE id = $2`,
        [transactionIdB, transactionIdA]
      );

      await queryDb(
        `UPDATE transactions
         SET type = 'INTERNAL_TRANSFER',
             reconciliation_status = 'INTERNAL_TRANSFER_MATCHED',
             linked_transaction_id = $1,
             personal_amount_gtq = 0.00,
             receivable_amount_gtq = 0.00,
             is_manual_override = TRUE,
             updated_at = NOW()
         WHERE id = $2`,
        [transactionIdA, transactionIdB]
      );

      return NextResponse.json({ success: true, message: "Transacciones vinculadas como Transferencia Interna" });
    }

    if (action === "UNPAIR") {
      const existing = await queryDb<any>(`SELECT * FROM transactions WHERE id = $1`, [transactionIdA]);
      if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const current = existing[0];
      const linkedId = current.linked_transaction_id;

      await queryDb(
        `UPDATE transactions
         SET type = 'EXPENSE',
             reconciliation_status = 'UNRECONCILED',
             linked_transaction_id = NULL,
             personal_amount_gtq = total_amount_gtq,
             is_manual_override = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [transactionIdA]
      );

      if (linkedId) {
        await queryDb(
          `UPDATE transactions
           SET type = 'EXPENSE',
               reconciliation_status = 'UNRECONCILED',
               linked_transaction_id = NULL,
               personal_amount_gtq = total_amount_gtq,
               is_manual_override = TRUE,
               updated_at = NOW()
           WHERE id = $1`,
          [linkedId]
        );
      }

      return NextResponse.json({ success: true, message: "Vinculación deshecha correctamente" });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("Pair/Unpair Error:", error);
    return NextResponse.json({ error: "Failed to pair/unpair transactions" }, { status: 500 });
  }
}
