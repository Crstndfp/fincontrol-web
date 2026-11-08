/**
 * Core Financial & Accounting Engine for FinControl
 * Implements deterministic decimal math (rounded to 2 decimal places / cents)
 * Enforces RN-01, RN-02, RN-03, RN-04, RN-05 and Acceptance Criteria Scenarios 1, 2, 3.
 */

export type CurrencyCode = "GTQ" | "USD";
export type SplitCalculationMode = "NONE" | "PERCENTAGE" | "EXACT_PERSONAL_AMOUNT";

export interface SplitExpenseInput {
  totalAmountOriginal: number;
  currency: CurrencyCode;
  exchangeRateToGtq?: number; // Default 7.80 for USD, 1.00 for GTQ
  mode: SplitCalculationMode;
  percentageOwn?: number; // e.g. 50 for 50%
  exactPersonalAmountOriginal?: number; // e.g. Paid 500, my share is 200
}

export interface SplitExpenseResult {
  totalAmountOriginal: number;
  totalAmountGtq: number;
  personalAmountGtq: number;
  receivableAmountGtq: number;
  appliedPercentage: number;
  isSplitExpense: boolean;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * RN-01 & RN-05: Calculates Personal Expense vs. Accounts Receivable (Third-party reimbursement)
 */
export function calculateSplitExpense(input: SplitExpenseInput): SplitExpenseResult {
  if (input.totalAmountOriginal <= 0) {
    throw new Error("Total amount must be greater than zero.");
  }

  const rate =
    input.currency === "USD" ? input.exchangeRateToGtq ?? 7.8 : 1.0;
  const totalGtq = roundCurrency(input.totalAmountOriginal * rate);

  if (input.mode === "NONE") {
    return {
      totalAmountOriginal: roundCurrency(input.totalAmountOriginal),
      totalAmountGtq: totalGtq,
      personalAmountGtq: totalGtq,
      receivableAmountGtq: 0,
      appliedPercentage: 100,
      isSplitExpense: false,
    };
  }

  if (input.mode === "PERCENTAGE") {
    const pct = input.percentageOwn ?? 100;
    if (pct <= 0 || pct > 100) {
      throw new Error("Split percentage must be between 0.01 and 100.");
    }
    const personalGtq = roundCurrency((totalGtq * pct) / 100);
    const receivableGtq = roundCurrency(totalGtq - personalGtq);
    return {
      totalAmountOriginal: roundCurrency(input.totalAmountOriginal),
      totalAmountGtq: totalGtq,
      personalAmountGtq: personalGtq,
      receivableAmountGtq: receivableGtq,
      appliedPercentage: roundCurrency(pct),
      isSplitExpense: pct < 100,
    };
  }

  // EXACT_PERSONAL_AMOUNT mode
  const exactOriginal = input.exactPersonalAmountOriginal ?? input.totalAmountOriginal;
  if (exactOriginal < 0 || exactOriginal > input.totalAmountOriginal) {
    throw new Error("Personal assumed amount cannot exceed total paid amount.");
  }
  const personalGtq = roundCurrency(exactOriginal * rate);
  const receivableGtq = roundCurrency(totalGtq - personalGtq);
  const derivedPct = roundCurrency((personalGtq / totalGtq) * 100);

  return {
    totalAmountOriginal: roundCurrency(input.totalAmountOriginal),
    totalAmountGtq: totalGtq,
    personalAmountGtq: personalGtq,
    receivableAmountGtq: receivableGtq,
    appliedPercentage: derivedPct,
    isSplitExpense: receivableGtq > 0,
  };
}

/**
 * RN-02 & Module 4.2: Smart Reconciliation & Deduplication Engine
 * 1) Neutralizes internal transfers between own accounts (e.g. Checking Debit <-> Credit Card Credit)
 * 2) Matches mobile express records with subsequent PDF bank statement lines within +/- 3 days
 */
export interface CandidateTransaction {
  id: string;
  accountId: string;
  merchantName: string;
  description: string;
  transactionDateIso: string;
  totalAmountGtq: number;
  originalCurrency: CurrencyCode;
  totalAmountOriginal: number;
  direction: "DEBIT" | "CREDIT";
  source: "MOBILE_EXPRESS" | "WEB_PDF_STATEMENT" | "WEB_MANUAL";
}

export interface ReconciliationOutcome {
  internalTransferPairs: Array<{ debitId: string; creditId: string; amountGtq: number }>;
  mergedMobileWithPdfPairs: Array<{ mobileId: string; pdfId: string; amountGtq: number }>;
}

const INTERNAL_TRANSFER_KEYWORDS = [
  "BANCA MOVIL",
  "GRACIAS POR SU PAGO",
  "TRANSFERENCIA PROPIA",
  "TRASLADO ACH PROPIO",
  "PAGO TARJETA",
  "ABONO TC",
];

export function runReconciliationEngine(
  transactions: CandidateTransaction[]
): ReconciliationOutcome {
  const internalTransferPairs: Array<{ debitId: string; creditId: string; amountGtq: number }> = [];
  const mergedMobileWithPdfPairs: Array<{ mobileId: string; pdfId: string; amountGtq: number }> = [];
  const consumedIds = new Set<string>();

  // Step 1: Detect Internal Transfers (Debit in Account A + Credit in Account B, same amount, within 72h)
  const debits = transactions.filter((t) => t.direction === "DEBIT");
  const credits = transactions.filter((t) => t.direction === "CREDIT");

  for (const debit of debits) {
    if (consumedIds.has(debit.id)) continue;

    const matchingCredit = credits.find((credit) => {
      if (consumedIds.has(credit.id)) return false;
      if (credit.accountId === debit.accountId) return false;
      const sameAmount = Math.abs(credit.totalAmountGtq - debit.totalAmountGtq) < 0.01;
      if (!sameAmount) return false;

      const diffHours =
        Math.abs(
          new Date(credit.transactionDateIso).getTime() -
            new Date(debit.transactionDateIso).getTime()
        ) /
        (1000 * 60 * 60);

      const hasTransferKeyword =
        INTERNAL_TRANSFER_KEYWORDS.some((kw) =>
          debit.merchantName.toUpperCase().includes(kw) ||
          debit.description.toUpperCase().includes(kw)
        ) ||
        INTERNAL_TRANSFER_KEYWORDS.some((kw) =>
          credit.merchantName.toUpperCase().includes(kw) ||
          credit.description.toUpperCase().includes(kw)
        );

      return diffHours <= 72 && hasTransferKeyword;
    });

    if (matchingCredit) {
      consumedIds.add(debit.id);
      consumedIds.add(matchingCredit.id);
      internalTransferPairs.push({
        debitId: debit.id,
        creditId: matchingCredit.id,
        amountGtq: debit.totalAmountGtq,
      });
    }
  }

  // Step 2: Match Mobile Express Expenses with Bank Statement PDF Expenses (Anti-duplicity)
  const mobileEntries = transactions.filter(
    (t) => t.source === "MOBILE_EXPRESS" && !consumedIds.has(t.id)
  );
  const pdfEntries = transactions.filter(
    (t) => t.source === "WEB_PDF_STATEMENT" && !consumedIds.has(t.id)
  );

  for (const mob of mobileEntries) {
    const matchPdf = pdfEntries.find((pdf) => {
      if (consumedIds.has(pdf.id)) return false;
      const sameAmount =
        Math.abs(pdf.totalAmountOriginal - mob.totalAmountOriginal) < 0.01 &&
        pdf.originalCurrency === mob.originalCurrency;
      if (!sameAmount) return false;

      const diffDays =
        Math.abs(
          new Date(pdf.transactionDateIso).getTime() -
            new Date(mob.transactionDateIso).getTime()
        ) /
        (1000 * 60 * 60 * 24);

      return diffDays <= 3.5;
    });

    if (matchPdf) {
      consumedIds.add(mob.id);
      consumedIds.add(matchPdf.id);
      mergedMobileWithPdfPairs.push({
        mobileId: mob.id,
        pdfId: matchPdf.id,
        amountGtq: mob.totalAmountGtq,
      });
    }
  }

  return { internalTransferPairs, mergedMobileWithPdfPairs };
}

/**
 * Module 4.5 & Scenario 3: Parametric Mortgage Early Amortization Simulator
 * Calculates baseline vs. accelerated payoff with extra monthly principal contributions.
 */
export interface LoanSimulationInput {
  currentPrincipalBalance: number;
  annualInterestRatePercent: number; // e.g. 7.5
  remainingTermMonths: number;
  extraMonthlyPrincipalContribution: number;
  monthlyNetSurplusGtq?: number;
}

export interface LoanSimulationResult {
  scheduledMonthlyPrincipalAndInterest: number;
  baselineTotalInterestGtq: number;
  acceleratedTotalInterestGtq: number;
  interestSavedGtq: number;
  baselineMonths: number;
  acceleratedMonths: number;
  monthsSaved: number;
  yearsSavedFormatted: string;
  surplusPercentageRequired: number;
  comparisonSchedule: Array<{
    month: number;
    baselineBalance: number;
    acceleratedBalance: number;
  }>;
}

export function simulateMortgagePrepayment(
  input: LoanSimulationInput
): LoanSimulationResult {
  const {
    currentPrincipalBalance,
    annualInterestRatePercent,
    remainingTermMonths,
    extraMonthlyPrincipalContribution,
    monthlyNetSurplusGtq = 10000,
  } = input;

  if (currentPrincipalBalance <= 0 || remainingTermMonths <= 0) {
    throw new Error("Loan balance and remaining term must be positive.");
  }

  const monthlyRate = annualInterestRatePercent / 100 / 12;

  // Standard French amortization payment formula
  const scheduledPmt =
    monthlyRate === 0
      ? currentPrincipalBalance / remainingTermMonths
      : (currentPrincipalBalance *
          (monthlyRate * Math.pow(1 + monthlyRate, remainingTermMonths))) /
        (Math.pow(1 + monthlyRate, remainingTermMonths) - 1);

  let baseBalance = currentPrincipalBalance;
  let baseTotalInterest = 0;
  let baseMonths = 0;

  let accelBalance = currentPrincipalBalance;
  let accelTotalInterest = 0;
  let accelMonths = 0;

  const schedule: Array<{
    month: number;
    baselineBalance: number;
    acceleratedBalance: number;
  }> = [];

  for (let m = 1; m <= remainingTermMonths; m++) {
    if (baseBalance > 0.01) {
      const interest = baseBalance * monthlyRate;
      const principal = Math.min(baseBalance, scheduledPmt - interest);
      baseBalance = Math.max(0, baseBalance - principal);
      baseTotalInterest += interest;
      baseMonths = m;
    }

    if (accelBalance > 0.01) {
      const interest = accelBalance * monthlyRate;
      const totalPrincipal =
        scheduledPmt - interest + Math.max(0, extraMonthlyPrincipalContribution);
      const actualPrincipal = Math.min(accelBalance, totalPrincipal);
      accelBalance = Math.max(0, accelBalance - actualPrincipal);
      accelTotalInterest += interest;
      accelMonths = m;
    }

    if (m % 12 === 0 || m === 1 || m === remainingTermMonths || (accelBalance === 0 && schedule[schedule.length - 1]?.acceleratedBalance !== 0)) {
      schedule.push({
        month: m,
        baselineBalance: roundCurrency(baseBalance),
        acceleratedBalance: roundCurrency(accelBalance),
      });
    }
  }

  const monthsSaved = Math.max(0, baseMonths - accelMonths);
  const years = Math.floor(monthsSaved / 12);
  const remMonths = monthsSaved % 12;
  const yearsSavedFormatted =
    years > 0 ? `${years} años y ${remMonths} meses` : `${remMonths} meses`;

  const interestSaved = Math.max(0, baseTotalInterest - accelTotalInterest);
  const surplusPct =
    monthlyNetSurplusGtq > 0
      ? roundCurrency((extraMonthlyPrincipalContribution / monthlyNetSurplusGtq) * 100)
      : 0;

  return {
    scheduledMonthlyPrincipalAndInterest: roundCurrency(scheduledPmt),
    baselineTotalInterestGtq: roundCurrency(baseTotalInterest),
    acceleratedTotalInterestGtq: roundCurrency(accelTotalInterest),
    interestSavedGtq: roundCurrency(interestSaved),
    baselineMonths: baseMonths,
    acceleratedMonths: accelMonths,
    monthsSaved,
    yearsSavedFormatted,
    surplusPercentageRequired: surplusPct,
    comparisonSchedule: schedule,
  };
}

/**
 * Module 3.3 & 4.3: 50/30/20 Budget Semaphore Evaluator
 *Verde (<80%), Amarillo (80%-100%), Rojo (>100%)
 */
export type SemaphoreStatus = "GREEN" | "YELLOW" | "RED";

export function evaluateBudgetSemaphore(
  executedPersonalGtq: number,
  budgetLimitGtq: number
): { percentage: number; status: SemaphoreStatus; alert90Triggered: boolean } {
  if (budgetLimitGtq <= 0) {
    return { percentage: 0, status: "GREEN", alert90Triggered: false };
  }
  const pct = roundCurrency((executedPersonalGtq / budgetLimitGtq) * 100);
  let status: SemaphoreStatus = "GREEN";
  if (pct > 100) {
    status = "RED";
  } else if (pct >= 80) {
    status = "YELLOW";
  }
  return {
    percentage: pct,
    status,
    alert90Triggered: pct >= 90,
  };
}
