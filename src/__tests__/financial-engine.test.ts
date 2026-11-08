import { describe, it, expect } from "vitest";
import {
  calculateSplitExpense,
  runReconciliationEngine,
  simulateMortgagePrepayment,
  evaluateBudgetSemaphore,
} from "../lib/financial-engine";

describe("FinControl Core Financial Engine", () => {
  describe("Scenario 1 & RN-01: Split Expense Accounting", () => {
    it("calculates 50% shared restaurant expense of Q600.00 into Q300 personal and Q300 receivable", () => {
      const result = calculateSplitExpense({
        totalAmountOriginal: 600.0,
        currency: "GTQ",
        mode: "PERCENTAGE",
        percentageOwn: 50,
      });

      expect(result.totalAmountGtq).toBe(600.0);
      expect(result.personalAmountGtq).toBe(300.0);
      expect(result.receivableAmountGtq).toBe(300.0);
      expect(result.isSplitExpense).toBe(true);
    });

    it("calculates exact assumed personal amount (Paid Q500, my share is Q200 -> Receivable Q300)", () => {
      const result = calculateSplitExpense({
        totalAmountOriginal: 500.0,
        currency: "GTQ",
        mode: "EXACT_PERSONAL_AMOUNT",
        exactPersonalAmountOriginal: 200.0,
      });

      expect(result.totalAmountGtq).toBe(500.0);
      expect(result.personalAmountGtq).toBe(200.0);
      expect(result.receivableAmountGtq).toBe(300.0);
      expect(result.appliedPercentage).toBe(40.0);
      expect(result.isSplitExpense).toBe(true);
    });

    it("supports bimonetary USD split expenses converted to GTQ (RN-05)", () => {
      const result = calculateSplitExpense({
        totalAmountOriginal: 100.0,
        currency: "USD",
        exchangeRateToGtq: 7.8,
        mode: "PERCENTAGE",
        percentageOwn: 25,
      });

      expect(result.totalAmountGtq).toBe(780.0);
      expect(result.personalAmountGtq).toBe(195.0);
      expect(result.receivableAmountGtq).toBe(585.0);
    });
  });

  describe("Scenario 2 & RN-02: Smart Reconciliation & Internal Transfer Neutralization", () => {
    it("detects and pairs Q14,618.32 checking debit (BANCA MOVIL) and credit card payment (GRACIAS POR SU PAGO)", () => {
      const outcome = runReconciliationEngine([
        {
          id: "tx-checking-debit",
          accountId: "acc-checking-bi",
          merchantName: "BANCA MOVIL",
          description: "Pago de tarjeta de credito",
          transactionDateIso: "2026-10-25T10:00:00Z",
          totalAmountGtq: 14618.32,
          originalCurrency: "GTQ",
          totalAmountOriginal: 14618.32,
          direction: "DEBIT",
          source: "WEB_PDF_STATEMENT",
        },
        {
          id: "tx-cc-credit",
          accountId: "acc-cc-bac",
          merchantName: "GRACIAS POR SU PAGO",
          description: "Abono recibido banca en linea",
          transactionDateIso: "2026-10-25T14:30:00Z",
          totalAmountGtq: 14618.32,
          originalCurrency: "GTQ",
          totalAmountOriginal: 14618.32,
          direction: "CREDIT",
          source: "WEB_PDF_STATEMENT",
        },
      ]);

      expect(outcome.internalTransferPairs).toHaveLength(1);
      expect(outcome.internalTransferPairs[0]).toEqual({
        debitId: "tx-checking-debit",
        creditId: "tx-cc-credit",
        amountGtq: 14618.32,
      });
    });

    it("merges Mobile Express expense (Q150.00 Farmacia Galeno) with subsequent Bank PDF transaction", () => {
      const outcome = runReconciliationEngine([
        {
          id: "mob-galeno-150",
          accountId: "acc-cc-bac",
          merchantName: "Farmacia Galeno",
          description: "Compra registrada en Android con foto",
          transactionDateIso: "2026-10-12T18:20:00Z",
          totalAmountGtq: 150.0,
          originalCurrency: "GTQ",
          totalAmountOriginal: 150.0,
          direction: "DEBIT",
          source: "MOBILE_EXPRESS",
        },
        {
          id: "pdf-galeno-150",
          accountId: "acc-cc-bac",
          merchantName: "FARMACIA GALENO Z10",
          description: "POS COMPRA",
          transactionDateIso: "2026-10-13T08:00:00Z",
          totalAmountGtq: 150.0,
          originalCurrency: "GTQ",
          totalAmountOriginal: 150.0,
          direction: "DEBIT",
          source: "WEB_PDF_STATEMENT",
        },
      ]);

      expect(outcome.mergedMobileWithPdfPairs).toHaveLength(1);
      expect(outcome.mergedMobileWithPdfPairs[0].mobileId).toBe("mob-galeno-150");
      expect(outcome.mergedMobileWithPdfPairs[0].pdfId).toBe("pdf-galeno-150");
    });
  });

  describe("Scenario 3: Parametric Mortgage Early Amortization Simulator", () => {
    it("calculates term reduction and interest saved when adding Q1,000.00/month extra principal", () => {
      const sim = simulateMortgagePrepayment({
        currentPrincipalBalance: 685000.0,
        annualInterestRatePercent: 7.5,
        remainingTermMonths: 180,
        extraMonthlyPrincipalContribution: 1000.0,
        monthlyNetSurplusGtq: 8000.0,
      });

      expect(sim.monthsSaved).toBeGreaterThan(35);
      expect(sim.interestSavedGtq).toBeGreaterThan(100000);
      expect(sim.acceleratedMonths).toBeLessThan(sim.baselineMonths);
      expect(sim.surplusPercentageRequired).toBe(12.5);
    });
  });

  describe("Module 3.3 & 4.3: 50/30/20 Semaphore Thresholds", () => {
    it("returns GREEN below 80%, YELLOW between 80% and 100%, and RED above 100%", () => {
      expect(evaluateBudgetSemaphore(1500, 2400).status).toBe("GREEN");
      expect(evaluateBudgetSemaphore(2000, 2400).status).toBe("YELLOW");
      expect(evaluateBudgetSemaphore(2200, 2400).alert90Triggered).toBe(true);
      expect(evaluateBudgetSemaphore(2500, 2400).status).toBe("RED");
    });
  });
});
