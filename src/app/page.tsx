"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Wallet,
  UploadCloud,
  RefreshCw,
  PieChart,
  CreditCard,
  Calculator,
  TrendingUp,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
  Users,
  Calendar,
  Building2,
  PlusCircle,
  FileText,
  ShieldCheck,
  Edit2,
  Trash2,
  Check,
  X,
  Plus,
} from "lucide-react";
import {
  simulateMortgagePrepayment,
  calculateSplitExpense,
} from "@/lib/financial-engine";

interface Account {
  id: string;
  name: string;
  institution: string;
  type: string;
  primary_currency: "GTQ" | "USD";
  is_bimonetary: boolean;
  balance_gtq: number;
  balance_usd: number;
  credit_limit_gtq: number | null;
  cutoff_day: number | null;
  payment_due_day: number | null;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  macro_group: "NEEDS_50" | "LIFESTYLE_30" | "SAVINGS_20";
  monthly_budget_limit_gtq: number;
  executed_personal_gtq: number;
  percentage: number;
  status: "GREEN" | "YELLOW" | "RED";
  alert90Triggered: boolean;
}

interface TransactionItem {
  id: string;
  account_id: string;
  account_name: string;
  category_id: string | null;
  category_name: string | null;
  merchant_name: string;
  description: string;
  transaction_date: string;
  type: "EXPENSE" | "INCOME" | "INTERNAL_TRANSFER" | "LOAN_PAYMENT";
  source: "MOBILE_EXPRESS" | "WEB_PDF_STATEMENT" | "WEB_MANUAL";
  original_currency: "GTQ" | "USD";
  total_amount_original: number;
  total_amount_gtq: number;
  is_split_expense: boolean;
  split_percentage: number;
  personal_amount_gtq: number;
  receivable_amount_gtq: number;
  debtor_name: string | null;
  reconciliation_status: string;
  bank_reference_code: string | null;
  is_manual_override?: boolean;
}

interface UploadedDoc {
  id: string;
  file_name: string;
  file_type: string;
  document_kind: string;
  account_name: string;
  status: string;
  detected_transactions_count: number;
  reconciled_count: number;
  duplicates_prevented_count: number;
  uploaded_at: string;
}

interface StatementCut {
  id: string;
  card_name: string;
  period_label: string;
  cutoff_date: string;
  payment_due_date: string;
  statement_balance_gtq: number;
  statement_balance_usd: number;
  paid_amount_gtq: number;
  paid_amount_usd: number;
  interest_charged_gtq: number;
  interest_charged_usd: number;
  is_totalero_compliant: boolean;
}

interface InstallmentPlan {
  id: string;
  merchant_name: string;
  description: string;
  currency: "GTQ" | "USD";
  total_principal: number;
  monthly_installment: number;
  total_installments: number;
  paid_installments: number;
  remaining_balance: number;
}

interface LoanItem {
  id: string;
  name: string;
  lender: string;
  original_principal: number;
  current_principal_balance: number;
  annual_interest_rate: number;
  remaining_term_months: number;
  scheduled_monthly_payment: number;
  monthly_insurance_and_fees: number;
}

interface SnapshotItem {
  snapshot_month: string;
  liquid_assets_gtq: number;
  investment_assets_gtq: number;
  receivables_assets_gtq: number;
  current_liabilities_gtq: number;
  long_term_liabilities_gtq: number;
  net_worth_gtq: number;
}

interface MilestoneItem {
  id: string;
  name: string;
  month_number: number;
  kind: "INCOME_BONUS" | "ANNUAL_EXPENSE";
  estimated_amount_gtq: number;
  notes: string;
}

interface RuleItem {
  id: string;
  keyword_pattern: string;
  merchant_display_name: string;
  category_name: string;
  macro_group: string;
  priority: number;
  usage_count: number;
}

const fmtQ = (val: number) =>
  `Q ${Number(val || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtUSD = (val: number) =>
  `$ ${Number(val || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function FinControlDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    | "OVERVIEW"
    | "INGEST_RECONCILE"
    | "BUDGET_50_30_20"
    | "CARDS_CUOTAS"
    | "MORTGAGE_SIM"
    | "NET_WORTH_FORECAST"
    | "MOBILE_SIMULATOR"
  >("OVERVIEW");

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [statements, setStatements] = useState<StatementCut[]>([]);
  const [installments, setInstallments] = useState<InstallmentPlan[]>([]);
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);

  // Mortgage Simulator State (Module 4.5 & Scenario 3)
  const [extraMonthlyAbono, setExtraMonthlyAbono] = useState<number>(1000);

  // Mobile Express Simulator State (Modules 3.1, 3.2 & Scenario 1)
  const [mobAmount, setMobAmount] = useState<string>("600");
  const [mobCurrency, setMobCurrency] = useState<"GTQ" | "USD">("GTQ");
  const [mobMerchant, setMobMerchant] = useState<string>("Restaurante San Martín");
  const [mobCategoryId, setMobCategoryId] = useState<string>("");
  const [mobIsSplit, setMobIsSplit] = useState<boolean>(true);
  const [mobSplitMode, setMobSplitMode] = useState<"PERCENTAGE" | "EXACT_PERSONAL_AMOUNT">("PERCENTAGE");
  const [mobSplitPct, setMobSplitPct] = useState<number>(50);
  const [mobExactOwn, setMobExactOwn] = useState<string>("200");
  const [mobSubmitting, setMobSubmitting] = useState(false);

  // New Rule Form State
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleMerchant, setNewRuleMerchant] = useState("");
  const [newRuleCatId, setNewRuleCatId] = useState("");

  // New Installment Plan Form State (Visa Cuotas)
  const [newCuotaMerchant, setNewCuotaMerchant] = useState("");
  const [newCuotaDesc, setNewCuotaDesc] = useState("");
  const [newCuotaAmount, setNewCuotaAmount] = useState("");
  const [newCuotaMonths, setNewCuotaMonths] = useState("12");

  // New Milestone Form State (Module 4.7)
  const [newMsName, setNewMsName] = useState("");
  const [newMsMonth, setNewMsMonth] = useState("7");
  const [newMsKind, setNewMsKind] = useState<"INCOME_BONUS" | "ANNUAL_EXPENSE">("INCOME_BONUS");
  const [newMsAmount, setNewMsAmount] = useState("");
  const [newMsNotes, setNewMsNotes] = useState("");

  // Transaction Edit Modal / Override State (RN-04)
  const [editingTx, setEditingTx] = useState<TransactionItem | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSplitPct, setEditSplitPct] = useState(100);
  const [editMerchant, setEditMerchant] = useState("");

  // Dropzone State
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/dashboard");
      const data = await res.json();
      setAccounts(data.accounts || []);
      setCategories(data.categories || []);
      setTransactions(data.transactions || []);
      setDocuments(data.documents || []);
      setStatements(data.statements || []);
      setInstallments(data.installments || []);
      setLoans(data.loans || []);
      setSnapshots(data.snapshots || []);
      setMilestones(data.milestones || []);
      setRules(data.rules || []);
      if (data.documents?.length > 0 && !selectedDocId) {
        setSelectedDocId(data.documents[0].id);
      }
      if (data.categories?.length > 0 && !mobCategoryId) {
        const restCat = data.categories.find((c: CategoryItem) =>
          c.slug.includes("restaurantes")
        );
        setMobCategoryId(restCat ? restCat.id : data.categories[0].id);
        setNewRuleCatId(data.categories[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Consolidated KPIs respecting RN-01, RN-02, RN-05
  const kpis = useMemo(() => {
    const usdRate = 7.8;
    const liquidAssetsGtq = accounts
      .filter((a) => ["CHECKING", "SAVINGS", "CASH_WALLET"].includes(a.type))
      .reduce((acc, a) => acc + a.balance_gtq + a.balance_usd * usdRate, 0);

    const investmentAssetsGtq = accounts
      .filter((a) => a.type === "INVESTMENT")
      .reduce((acc, a) => acc + a.balance_gtq + a.balance_usd * usdRate, 0);

    const pendingReceivablesGtq = transactions
      .filter((t) => t.is_split_expense && t.receivable_amount_gtq > 0)
      .reduce((acc, t) => acc + t.receivable_amount_gtq, 0);

    const creditCardLiabilitiesGtq = accounts
      .filter((a) => a.type === "CREDIT_CARD")
      .reduce(
        (acc, a) => acc + Math.abs(a.balance_gtq) + Math.abs(a.balance_usd) * usdRate,
        0
      );

    const mortgageLiabilitiesGtq = accounts
      .filter((a) => a.type === "LOAN")
      .reduce((acc, a) => acc + Math.abs(a.balance_gtq), 0);

    // RN-01 & RN-02: Operational Expense only sums personal_amount_gtq and excludes INTERNAL_TRANSFER
    const monthlyPersonalExecutedGtq = transactions
      .filter((t) => t.type === "EXPENSE" || t.type === "LOAN_PAYMENT")
      .reduce((acc, t) => acc + t.personal_amount_gtq, 0);

    const monthlyTotalBudgetGtq = categories.reduce(
      (acc, c) => acc + c.monthly_budget_limit_gtq,
      0
    );

    const monthlyIncomeGtq = transactions
      .filter((t) => t.type === "INCOME")
      .reduce((acc, t) => acc + t.total_amount_gtq, 0);

    const netWorthGtq =
      liquidAssetsGtq +
      investmentAssetsGtq +
      pendingReceivablesGtq -
      creditCardLiabilitiesGtq -
      mortgageLiabilitiesGtq;

    return {
      liquidAssetsGtq,
      investmentAssetsGtq,
      pendingReceivablesGtq,
      creditCardLiabilitiesGtq,
      mortgageLiabilitiesGtq,
      monthlyPersonalExecutedGtq,
      monthlyTotalBudgetGtq,
      monthlyIncomeGtq,
      netWorthGtq,
    };
  }, [accounts, transactions, categories]);

  // Mortgage Prepayment Simulation (Module 4.5 & Scenario 3)
  const activeLoan = loans[0];
  const loanSimulation = useMemo(() => {
    const balance = activeLoan ? activeLoan.current_principal_balance : 685000;
    const rate = activeLoan ? activeLoan.annual_interest_rate : 7.5;
    const months = activeLoan ? activeLoan.remaining_term_months : 180;
    const surplus = Math.max(
      1000,
      kpis.monthlyIncomeGtq - kpis.monthlyPersonalExecutedGtq
    );

    return simulateMortgagePrepayment({
      currentPrincipalBalance: balance,
      annualInterestRatePercent: rate,
      remainingTermMonths: months,
      extraMonthlyPrincipalContribution: extraMonthlyAbono,
      monthlyNetSurplusGtq: surplus,
    });
  }, [activeLoan, extraMonthlyAbono, kpis]);

  // Live Split Expense Preview for Express Mobile Simulator
  const liveSplitPreview = useMemo(() => {
    const amt = parseFloat(mobAmount) || 0;
    if (amt <= 0) return null;
    try {
      return calculateSplitExpense({
        totalAmountOriginal: amt,
        currency: mobCurrency,
        exchangeRateToGtq: 7.8,
        mode: !mobIsSplit ? "NONE" : mobSplitMode,
        percentageOwn: mobSplitPct,
        exactPersonalAmountOriginal: parseFloat(mobExactOwn) || 0,
      });
    } catch {
      return null;
    }
  }, [mobAmount, mobCurrency, mobIsSplit, mobSplitMode, mobSplitPct, mobExactOwn]);

  const handleMerchantTyping = (value: string) => {
    setMobMerchant(value);
    const upper = value.toUpperCase();
    for (const r of rules) {
      const patterns = r.keyword_pattern.split("|");
      if (patterns.some((p) => upper.includes(p.trim().toUpperCase()))) {
        const matchedCat = categories.find((c) => c.name === r.category_name);
        if (matchedCat) {
          setMobCategoryId(matchedCat.id);
        }
        break;
      }
    }
  };

  const handleMobileExpressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveSplitPreview) return;
    setMobSubmitting(true);
    try {
      await fetch("/api/v1/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: mobCategoryId || undefined,
          merchantName: mobMerchant,
          description: mobIsSplit
            ? `Gasto compartido (${liveSplitPreview.appliedPercentage}% propio) registrado desde App Android`
            : "Registro Express Android (<5s)",
          currency: mobCurrency,
          totalAmountOriginal: liveSplitPreview.totalAmountOriginal,
          splitMode: !mobIsSplit ? "NONE" : mobSplitMode,
          percentageOwn: mobSplitPct,
          exactPersonalAmountOriginal: parseFloat(mobExactOwn) || undefined,
          source: "MOBILE_EXPRESS",
        }),
      });
      await fetchDashboardData();
    } finally {
      setMobSubmitting(false);
    }
  };

  const handleRealFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch("/api/v1/reconcile", {
        method: "POST",
        body: formData,
      });
      await fetchDashboardData();
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSimulatedDocumentDrop = async (sampleFileName: string) => {
    setUploadingDoc(true);
    try {
      await fetch("/api/v1/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: sampleFileName,
          fileType: sampleFileName.endsWith(".pdf")
            ? "application/pdf"
            : "image/jpeg",
        }),
      });
      await fetchDashboardData();
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern || !newRuleMerchant || !newRuleCatId) return;
    await fetch("/api/v1/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywordPattern: newRulePattern,
        merchantDisplayName: newRuleMerchant,
        categoryId: newRuleCatId,
        priority: rules.length + 1,
      }),
    });
    setNewRulePattern("");
    setNewRuleMerchant("");
    await fetchDashboardData();
  };

  const handleCreateInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    const principal = parseFloat(newCuotaAmount);
    const months = parseInt(newCuotaMonths);
    if (!newCuotaMerchant || !newCuotaDesc || isNaN(principal) || isNaN(months)) return;
    await fetch("/api/v1/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantName: newCuotaMerchant,
        description: newCuotaDesc,
        totalPrincipal: principal,
        totalInstallments: months,
      }),
    });
    setNewCuotaMerchant("");
    setNewCuotaDesc("");
    setNewCuotaAmount("");
    await fetchDashboardData();
  };

  const handleAdvanceCuota = async (planId: string) => {
    await fetch("/api/v1/installments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: planId, action: "ADVANCE_PAYMENT" }),
    });
    await fetchDashboardData();
  };

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newMsAmount);
    const month = parseInt(newMsMonth);
    if (!newMsName || isNaN(amount) || isNaN(month)) return;
    await fetch("/api/v1/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newMsName,
        monthNumber: month,
        kind: newMsKind,
        estimatedAmountGtq: amount,
        notes: newMsNotes,
      }),
    });
    setNewMsName("");
    setNewMsAmount("");
    setNewMsNotes("");
    await fetchDashboardData();
  };

  // RN-04 Manual Override
  const openEditModal = (tx: TransactionItem) => {
    setEditingTx(tx);
    setEditCategory(tx.category_id || (categories[0]?.id || ""));
    setEditSplitPct(tx.split_percentage || 100);
    setEditMerchant(tx.merchant_name);
  };

  const handleSaveTxOverride = async () => {
    if (!editingTx) return;
    await fetch(`/api/v1/transactions/${editingTx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: editCategory,
        merchantName: editMerchant,
        splitPercentage: editSplitPct,
      }),
    });
    setEditingTx(null);
    await fetchDashboardData();
  };

  const handleDeleteTx = async (id: string) => {
    if (!confirm("¿Deseas eliminar este registro contable?")) return;
    await fetch(`/api/v1/transactions/${id}`, { method: "DELETE" });
    await fetchDashboardData();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Executive Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  FinControl
                </h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  GTQ / USD Bimonetario
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Auditoría Contable, Conciliación Antiduplicidad & Simulación Patrimonial
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4 text-xs bg-slate-900/90 border border-slate-800 px-3.5 py-2 rounded-xl">
              <div>
                <span className="text-slate-400 block">Liquidez Disponible</span>
                <span className="font-semibold text-emerald-400">
                  {fmtQ(kpis.liquidAssetsGtq)}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <span className="text-slate-400 block">Por Cobrar (RN-01)</span>
                <span className="font-semibold text-amber-400">
                  {fmtQ(kpis.pendingReceivablesGtq)}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <span className="text-slate-400 block">TC / Cambio USD</span>
                <span className="font-semibold text-slate-200">Q 7.80</span>
              </div>
            </div>

            <button
              onClick={fetchDashboardData}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
              title="Sincronizar con PostgreSQL y App Android"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Module Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex overflow-x-auto no-scrollbar gap-1 border-t border-slate-900 pt-1">
          {[
            { id: "OVERVIEW", label: "Dashboard & Flujo Real", icon: PieChart },
            { id: "INGEST_RECONCILE", label: "Dropzone PDF & Conciliación (4.1/4.2)", icon: UploadCloud },
            { id: "BUDGET_50_30_20", label: "Motor 50/30/20 & Reglas (4.3)", icon: ShieldCheck },
            { id: "CARDS_CUOTAS", label: "Tarjetas Bimonetarias & Visa Cuotas (4.4)", icon: CreditCard },
            { id: "MORTGAGE_SIM", label: "Préstamos & Simulador Abonos (4.5)", icon: Calculator },
            { id: "NET_WORTH_FORECAST", label: "Patrimonio & Cierre Anual (4.6/4.7)", icon: TrendingUp },
            { id: "MOBILE_SIMULATOR", label: "Simulador App Android (<5s & Split)", icon: Smartphone },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition ${
                  active
                    ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ===================================================================
            TAB 1: EXECUTIVE OVERVIEW & REAL-TIME SYNC LEDGER
        =================================================================== */}
        {activeTab === "OVERVIEW" && (
          <div className="space-y-6">
            {/* Top 4 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Liquidez Consolidada (Bancos + Efectivo)</span>
                  <Wallet className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {fmtQ(kpis.liquidAssetsGtq)}
                </p>
                <p className="text-xs text-emerald-400 mt-1">
                  Incluye cuentas GTQ + ahorro USD (@ Q7.80)
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Gasto Propio Real del Mes (RN-01)</span>
                  <PieChart className="h-4 w-4 text-indigo-400" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {fmtQ(kpis.monthlyPersonalExecutedGtq)}
                </p>
                <div className="mt-2 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      kpis.monthlyPersonalExecutedGtq / kpis.monthlyTotalBudgetGtq > 1
                        ? "bg-rose-500"
                        : kpis.monthlyPersonalExecutedGtq / kpis.monthlyTotalBudgetGtq >= 0.8
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (kpis.monthlyPersonalExecutedGtq /
                          Math.max(1, kpis.monthlyTotalBudgetGtq)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Techo mensual 50/30/20: {fmtQ(kpis.monthlyTotalBudgetGtq)}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Cuentas por Cobrar a Terceros (Split)</span>
                  <Users className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-2xl font-bold text-amber-400">
                  {fmtQ(kpis.pendingReceivablesGtq)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Activo circulante transitorio (No infla tu presupuesto)
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Alerta Totalero TC (Visa Infinite)</span>
                  <CreditCard className="h-4 w-4 text-sky-400" />
                </div>
                <p className="text-2xl font-bold text-white">10 días</p>
                <p className="text-xs text-sky-400 mt-1">
                  Corte: Día 18 • Pago Contado: Día 08 (0% Interés)
                </p>
              </div>
            </div>

            {/* Accounts Overview & Unified Ledger */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Accounts List */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-400" />
                    Cuentas Bancarias y Carteras
                  </h2>
                  <span className="text-xs text-slate-400">{accounts.length} activas</span>
                </div>
                <div className="space-y-3">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-100">
                          {acc.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {acc.institution} • {acc.type}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xs font-bold ${
                            acc.balance_gtq < 0 ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {fmtQ(acc.balance_gtq)}
                        </p>
                        {acc.is_bimonetary && (
                          <p className="text-[11px] text-sky-400 font-medium">
                            {fmtUSD(acc.balance_usd)} USD
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Consolidated Transactions Ledger */}
              <div className="lg:col-span-2 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Libro Mayor Consolidado (App Android + Estados de Cuenta PDF)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Gasto Propio (RN-01), Transferencias Neutralizadas (RN-02) y Auditoría Reversible (RN-04)
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("MOBILE_SIMULATOR")}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Nuevo Gasto Express
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-2">Comercio / Concepto</th>
                        <th className="py-2.5 px-2">Origen & Estado</th>
                        <th className="py-2.5 px-2 text-right">Pagado Total</th>
                        <th className="py-2.5 px-2 text-right">Gasto Propio (RN-01)</th>
                        <th className="py-2.5 px-2 text-right">Por Cobrar</th>
                        <th className="py-2.5 px-2 text-center">Acciones (RN-04)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-2">
                            <p className="font-semibold text-slate-100">
                              {tx.merchant_name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {tx.category_name || "Transferencia / Nómina"} •{" "}
                              {tx.account_name}
                            </p>
                            {tx.is_manual_override && (
                              <span className="inline-block mt-0.5 text-[10px] text-amber-300">
                                ✎ Ajuste manual de usuario
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full w-fit bg-slate-800 text-slate-300">
                                {tx.source === "MOBILE_EXPRESS"
                                  ? "📱 Android Express"
                                  : "📄 PDF Estado Cuenta"}
                              </span>
                              {tx.type === "INTERNAL_TRANSFER" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                  <ArrowLeftRight className="h-3 w-3" />
                                  Transferencia Interna (RN-02 Neutralizada)
                                </span>
                              ) : tx.reconciliation_status === "RECONCILED_MERGED" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Conciliado ({tx.bank_reference_code || "OK"})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
                                  Pendiente corte PDF
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right font-medium text-slate-200">
                            {tx.original_currency === "USD" ? (
                              <div>
                                <span>{fmtUSD(tx.total_amount_original)}</span>
                                <span className="block text-[10px] text-slate-400">
                                  {fmtQ(tx.total_amount_gtq)}
                                </span>
                              </div>
                            ) : (
                              fmtQ(tx.total_amount_gtq)
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-bold">
                            {tx.type === "INTERNAL_TRANSFER" ? (
                              <span className="text-slate-500 line-through">Q 0.00</span>
                            ) : tx.type === "INCOME" ? (
                              <span className="text-emerald-400">
                                +{fmtQ(tx.personal_amount_gtq)}
                              </span>
                            ) : (
                              <span className="text-white">
                                {fmtQ(tx.personal_amount_gtq)}
                              </span>
                            )}
                            {tx.is_split_expense && (
                              <span className="block text-[10px] text-indigo-400">
                                ({tx.split_percentage}% propio)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {tx.receivable_amount_gtq > 0 ? (
                              <span className="font-semibold text-amber-400">
                                {fmtQ(tx.receivable_amount_gtq)}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openEditModal(tx)}
                                title="Editar / Reclasificar (RN-04)"
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTx(tx.id)}
                                title="Eliminar registro"
                                className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: SMART DOCUMENT DROPZONE & RECONCILIATION ENGINE (4.1 & 4.2)
        =================================================================== */}
        {activeTab === "INGEST_RECONCILE" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Smart Multi-File Dropzone with Real File Input */}
              <div className="rounded-2xl bg-slate-900/90 border-2 border-dashed border-indigo-500/40 p-6 text-center space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto">
                  <UploadCloud className="h-6 w-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    Dropzone Inteligente: Carga Masiva de Estados de Cuenta PDF y Facturas
                  </h2>
                  <p className="text-xs text-slate-400 max-w-xl mx-auto mt-1">
                    Soporta PDFs bancarios y comprobantes en imagen. Extrae transacciones, empareja con gastos registrados en Android y neutraliza pagos de tarjetas entre cuentas propias (RN-02).
                  </p>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleRealFileUpload}
                  accept=".pdf,image/png,image/jpeg,image/heic"
                  className="hidden"
                />

                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <button
                    disabled={uploadingDoc}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition flex items-center gap-2"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {uploadingDoc ? "Procesando archivo..." : "Seleccionar Archivo Local (PDF / Imagen)"}
                  </button>
                  <button
                    disabled={uploadingDoc}
                    onClick={() =>
                      handleSimulatedDocumentDrop(
                        "Estado_Cuenta_TC_BAC_Nov2026_Corte.pdf"
                      )
                    }
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
                  >
                    Simular Carga PDF TC BAC (Concilia Móvil)
                  </button>
                  <button
                    disabled={uploadingDoc}
                    onClick={() =>
                      handleSimulatedDocumentDrop(
                        "Ticket_Restaurante_San_Martin_600GTQ.jpg"
                      )
                    }
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
                  >
                    Simular Carga Ticket Factura (JPG)
                  </button>
                </div>
              </div>

              {/* Processed Files List */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  Cola de Documentos Auditados y Estado de Conciliación
                </h3>
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        selectedDocId === doc.id
                          ? "bg-indigo-950/40 border-indigo-500/60"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-indigo-400 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {doc.file_name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {doc.account_name || "Cuenta General"} •{" "}
                            {doc.detected_transactions_count} transacciones detectadas
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3" />
                          {doc.status}
                        </span>
                        <p className="text-[11px] text-indigo-300 mt-1">
                          {doc.duplicates_prevented_count} duplicados evitados
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Lateral Document Inspector & Scenario 2 Verification */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-sky-400" />
                Visor Lateral de Extracción & Regla RN-02
              </h3>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Documento Activo:</span>
                  <span className="font-semibold text-indigo-300 truncate max-w-[180px]">
                    {documents.find((d) => d.id === selectedDocId)?.file_name ||
                      "Estado_Cuenta_Monetaria_BI_Oct2026.pdf"}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                    Escenario 2: Neutralización de Pago TC
                  </p>
                  <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 space-y-1">
                    <p className="font-semibold text-white">
                      Débito Monetaria: BANCA MOVIL — Q 14,618.32
                    </p>
                    <p className="font-semibold text-white">
                      Crédito TC: GRACIAS POR SU PAGO — Q 14,618.32
                    </p>
                    <p className="text-[11px] text-sky-300">
                      ✓ Emparejados automáticamente como Transferencia Interna. Excluidos de ingresos y gastos operativos.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    Match Móvil ↔ Estado de Cuenta PDF
                  </p>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                    <p className="font-semibold text-white">
                      Farmacia Galeno — Q 150.00
                    </p>
                    <p className="text-[11px] text-emerald-300">
                      ✓ Registro móvil fusionado con línea del PDF bancario (AUTH-88412). Conserva foto del ticket adjunto sin duplicar el cargo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: 50/30/20 BUDGET ENGINE & KEYWORD RULES (MODULE 4.3)
        =================================================================== */}
        {activeTab === "BUDGET_50_30_20" && (
          <div className="space-y-6">
            {/* Macro Group Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  group: "NEEDS_50",
                  title: "1. Necesidades / Gastos Fijos (50%)",
                  desc: "Hipoteca, supermercado, salud, transporte, servicios",
                },
                {
                  group: "LIFESTYLE_30",
                  title: "2. Estilo de Vida / Variables (30%)",
                  desc: "Restaurantes, entretenimiento, compras personales",
                },
                {
                  group: "SAVINGS_20",
                  title: "3. Ahorro e Inversión (20%)",
                  desc: "Fondos de inversión programados y aportes a capital",
                },
              ].map((macro) => {
                const groupCats = categories.filter(
                  (c) => c.macro_group === macro.group
                );
                const limit = groupCats.reduce(
                  (acc, c) => acc + c.monthly_budget_limit_gtq,
                  0
                );
                const executed = groupCats.reduce(
                  (acc, c) => acc + c.executed_personal_gtq,
                  0
                );
                const pct = limit > 0 ? Math.round((executed / limit) * 100) : 0;

                return (
                  <div
                    key={macro.group}
                    className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3"
                  >
                    <div>
                      <h3 className="text-sm font-bold text-white">{macro.title}</h3>
                      <p className="text-xs text-slate-400">{macro.desc}</p>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-bold text-white">
                        {fmtQ(executed)}
                      </span>
                      <span className="text-xs text-slate-400">
                        de {fmtQ(limit)} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          pct > 100
                            ? "bg-rose-500"
                            : pct >= 80
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Category Semaphores & Keyword Rules Admin */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Category Semaphore Bars */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  Semáforo por Categoría (Solo contabiliza Gasto Propio RN-01)
                </h3>
                <div className="space-y-3.5">
                  {categories.map((cat) => (
                    <div key={cat.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">
                            {cat.name}
                          </span>
                          {cat.alert90Triggered && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <AlertTriangle className="h-3 w-3" /> &gt;90% Límite
                            </span>
                          )}
                        </div>
                        <span className="text-slate-300">
                          {fmtQ(cat.executed_personal_gtq)} /{" "}
                          {fmtQ(cat.monthly_budget_limit_gtq)} ({cat.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            cat.status === "RED"
                              ? "bg-rose-500"
                              : cat.status === "YELLOW"
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                          style={{ width: `${Math.min(100, cat.percentage)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Keyword Classification Rules Manager */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Gestor de Reglas de Clasificación Automática (Palabras Clave)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Predice la categoría en la App Android y clasifica estados de cuenta PDF (RN-04: 100% sobrescribible).
                  </p>
                </div>

                <form onSubmit={handleCreateRule} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Palabras clave (ej. UBER|DIDI)"
                    value={newRulePattern}
                    onChange={(e) => setNewRulePattern(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <input
                    type="text"
                    placeholder="Nombre Comercio (ej. Uber)"
                    value={newRuleMerchant}
                    onChange={(e) => setNewRuleMerchant(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newRuleCatId}
                      onChange={(e) => setNewRuleCatId(e.target.value)}
                      className="flex-1 px-2 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                    >
                      + Regla
                    </button>
                  </div>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {rules.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-mono text-indigo-300 font-semibold">
                          {r.keyword_pattern}
                        </p>
                        <p className="text-slate-400">
                          → {r.merchant_display_name} ({r.category_name})
                        </p>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {r.usage_count} usos
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 4: BIMONETARY CREDIT CARDS & VISA CUOTAS (MODULE 4.4)
        =================================================================== */}
        {activeTab === "CARDS_CUOTAS" && (
          <div className="space-y-6">
            {/* Bimonetary Statement Audit Table */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Auditoría de Cortes Bimonetarios (GTQ y USD Independientes) & Verificación Totalero
                </h2>
                <p className="text-xs text-slate-400">
                  Confirma matemáticamente el pago de contado al corte y audita que exista Q 0.00 / $ 0.00 de cargos por intereses moratorios o financiamiento.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">Periodo de Corte</th>
                      <th className="py-2.5 px-3">Fecha Corte / Pago</th>
                      <th className="py-2.5 px-3 text-right">Saldo Corte (GTQ)</th>
                      <th className="py-2.5 px-3 text-right">Pagado (GTQ)</th>
                      <th className="py-2.5 px-3 text-right">Saldo Corte (USD)</th>
                      <th className="py-2.5 px-3 text-right">Pagado (USD)</th>
                      <th className="py-2.5 px-3 text-right">Intereses Cobrados</th>
                      <th className="py-2.5 px-3 text-center">Estatus Totalero</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {statements.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-3 font-semibold text-white">
                          {st.period_label}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          Corte: {String(st.cutoff_date).slice(0, 10)} • Pago:{" "}
                          {String(st.payment_due_date).slice(0, 10)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-slate-200">
                          {fmtQ(st.statement_balance_gtq)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-emerald-400">
                          {fmtQ(st.paid_amount_gtq)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-sky-300">
                          {fmtUSD(st.statement_balance_usd)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-emerald-400">
                          {fmtUSD(st.paid_amount_usd)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-emerald-400">
                          Q {st.interest_charged_gtq.toFixed(2)} / ${" "}
                          {st.interest_charged_usd.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {st.is_totalero_compliant ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3" /> Totalero 0% Interés
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300">
                              Interés Detectado
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visa Cuotas Tracker & Registration Form */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Bitácora de Compras Financiadas a Tasa 0% (Visa Cuotas)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Control de cuotas mensuales pactadas y saldo remanente a liquidar.
                  </p>
                </div>
              </div>

              {/* Form to add a new Visa Cuotas plan */}
              <form onSubmit={handleCreateInstallment} className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <input
                  type="text"
                  placeholder="Comercio (ej. iShop)"
                  value={newCuotaMerchant}
                  onChange={(e) => setNewCuotaMerchant(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Descripción (ej. iPhone 16)"
                  value={newCuotaDesc}
                  onChange={(e) => setNewCuotaDesc(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                />
                <input
                  type="number"
                  placeholder="Monto Total GTQ"
                  value={newCuotaAmount}
                  onChange={(e) => setNewCuotaAmount(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                />
                <select
                  value={newCuotaMonths}
                  onChange={(e) => setNewCuotaMonths(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                >
                  <option value="3">3 Cuotas</option>
                  <option value="6">6 Cuotas</option>
                  <option value="10">10 Cuotas</option>
                  <option value="12">12 Cuotas</option>
                  <option value="18">18 Cuotas</option>
                  <option value="24">24 Cuotas</option>
                </select>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                >
                  + Agregar Cuota 0%
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {installments.map((plan) => {
                  const pct = Math.round(
                    (plan.paid_installments / plan.total_installments) * 100
                  );
                  return (
                    <div
                      key={plan.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold text-white">
                            {plan.description}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {plan.merchant_name}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Cuota {plan.paid_installments}/{plan.total_installments}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px]">
                            Cuota Mensual
                          </span>
                          <span className="font-semibold text-slate-200">
                            {fmtQ(plan.monthly_installment)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">
                            Saldo Remanente
                          </span>
                          <span className="font-bold text-amber-400">
                            {fmtQ(plan.remaining_balance)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAdvanceCuota(plan.id)}
                        className="w-full mt-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300"
                      >
                        ✓ Registrar Débito de Cuota Mensual
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: MORTGAGE & PARAMETRIC EARLY AMORTIZATION SIMULATOR (4.5)
        =================================================================== */}
        {activeTab === "MORTGAGE_SIM" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Accounting Breakdown of Current Mortgage Installment */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">
                  Desglose Contable de Cuota Hipotecaria
                </h2>
                <p className="text-xs text-slate-400">
                  {activeLoan?.name || "Préstamo Hipotecario Vivienda"} • Saldo Actual:{" "}
                  <strong className="text-white">
                    {fmtQ(activeLoan?.current_principal_balance || 685000)}
                  </strong>{" "}
                  ({activeLoan?.annual_interest_rate || 7.5}% anual)
                </p>

                <div className="space-y-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex justify-between text-xs font-semibold text-emerald-300">
                      <span>Abono Directo a Capital</span>
                      <span>Q 1,850.00</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Contabilizado como incremento directo en el Patrimonio Neto.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30">
                    <div className="flex justify-between text-xs font-semibold text-rose-300">
                      <span>Costo de Intereses Bancarios</span>
                      <span>Q 4,281.25</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Gasto financiero no recuperable por costo del dinero.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <div className="flex justify-between text-xs font-semibold text-amber-300">
                      <span>Seguros y Comisiones</span>
                      <span>Q 368.75</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Gasto fijo operativo mensual (Seguro de vida e incendio).
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Interactive Parametric Prepayment Simulator (Scenario 3) */}
              <div className="lg:col-span-2 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-5">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                    Escenario 3 • Simulador Paramétrico en Tiempo Real
                  </span>
                  <h2 className="text-base font-bold text-white mt-0.5">
                    ¿Qué pasa si abono capital extraordinario cada mes?
                  </h2>
                </div>

                {/* Quick Preset Buttons + Slider */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-300">
                      Abono Adicional Mensual a Capital:
                    </span>
                    <span className="text-xl font-bold text-indigo-400">
                      {fmtQ(extraMonthlyAbono)} / mes
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={10000}
                    step={250}
                    value={extraMonthlyAbono}
                    onChange={(e) => setExtraMonthlyAbono(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />

                  <div className="flex flex-wrap gap-2">
                    {[1000, 2500, 5000, 7500].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setExtraMonthlyAbono(preset)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          extraMonthlyAbono === preset
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        + {fmtQ(preset)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comparative Simulation Outputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-xs text-emerald-300 block">
                      Intereses Futuros Ahorrados
                    </span>
                    <p className="text-xl font-bold text-white mt-1">
                      {fmtQ(loanSimulation.interestSavedGtq)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Dinero que no pagarás al banco
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                    <span className="text-xs text-indigo-300 block">
                      Reducción de Plazo Total
                    </span>
                    <p className="text-xl font-bold text-white mt-1">
                      {loanSimulation.yearsSavedFormatted}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      De {loanSimulation.baselineMonths} a{" "}
                      {loanSimulation.acceleratedMonths} meses
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-xs text-amber-300 block">
                      Esfuerzo sobre Superávit Mensual
                    </span>
                    <p className="text-xl font-bold text-white mt-1">
                      {loanSimulation.surplusPercentageRequired}%
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Del flujo libre mensual actual
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Complete Comparative French Amortization Timeline */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">
                Proyección Comparativa de Reducción de Saldo (Amortización Francesa)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">Hito Temporal</th>
                      <th className="py-2.5 px-3 text-right">Saldo Escenario Base</th>
                      <th className="py-2.5 px-3 text-right">Saldo Acelerado (+{fmtQ(extraMonthlyAbono)})</th>
                      <th className="py-2.5 px-3 text-right">Diferencia de Capital Reducido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loanSimulation.comparisonSchedule.map((row) => (
                      <tr key={row.month} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-medium text-slate-300">
                          Mes #{row.month} (Año {(row.month / 12).toFixed(1)})
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400">
                          {fmtQ(row.baselineBalance)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                          {fmtQ(row.acceleratedBalance)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-indigo-300">
                          {fmtQ(row.baselineBalance - row.acceleratedBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 6: NET WORTH TRACKER & YEAR-END PROJECTIONS (4.6 & 4.7)
        =================================================================== */}
        {activeTab === "NET_WORTH_FORECAST" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Balance Patrimonial Consolidado */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">
                  Balance Patrimonial Consolidado (Net Worth Tracker)
                </h2>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-300">
                      + Activos Líquidos (Monetarias, Ahorro USD, Efectivo)
                    </span>
                    <span className="font-bold text-emerald-400">
                      {fmtQ(kpis.liquidAssetsGtq)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-300">
                      + Activos de Inversión (Fondos de Retiro y Aportes)
                    </span>
                    <span className="font-bold text-emerald-400">
                      {fmtQ(kpis.investmentAssetsGtq)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-300">
                      + Cuentas por Cobrar a Terceros (Gastos Compartidos RN-01)
                    </span>
                    <span className="font-bold text-amber-400">
                      {fmtQ(kpis.pendingReceivablesGtq)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-300">
                      - Pasivos Corrientes (Deuda Tarjetas al Corte GTQ + USD)
                    </span>
                    <span className="font-bold text-rose-400">
                      -{fmtQ(kpis.creditCardLiabilitiesGtq)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-300">
                      - Pasivos de Largo Plazo (Saldo Capital Hipotecario)
                    </span>
                    <span className="font-bold text-rose-400">
                      -{fmtQ(kpis.mortgageLiabilitiesGtq)}
                    </span>
                  </div>
                  <div className="flex justify-between p-4 rounded-xl bg-indigo-950/50 border border-indigo-500/40 text-sm">
                    <span className="font-bold text-white">
                      Patrimonio Neto Real (Activos - Pasivos)
                    </span>
                    <span className="font-bold text-indigo-300">
                      {fmtQ(kpis.netWorthGtq)}
                    </span>
                  </div>
                </div>

                {/* Historical Evolution */}
                <div className="pt-2">
                  <p className="text-xs font-semibold text-slate-300 mb-2">
                    Evolución Patrimonial Reciente (Últimos 6 meses)
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[11px]">
                    {snapshots.map((s) => (
                      <div
                        key={s.snapshot_month}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800"
                      >
                        <span className="text-slate-400 block">
                          {String(s.snapshot_month).slice(0, 7)}
                        </span>
                        <span className="font-semibold text-emerald-400 block mt-1">
                          {fmtQ(s.liquid_assets_gtq + s.investment_assets_gtq)}
                        </span>
                        <span className="text-[10px] text-slate-500">Activos</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Year-End Run-Rate & Milestones (Module 4.7) */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-indigo-400" />
                    Hitos Calendarizados & Proyecciones (4.7)
                  </h2>
                </div>

                {/* Form to add new milestone */}
                <form onSubmit={handleCreateMilestone} className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <input
                    type="text"
                    placeholder="Hito (ej. Aguinaldo)"
                    value={newMsName}
                    onChange={(e) => setNewMsName(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                  />
                  <select
                    value={newMsMonth}
                    onChange={(e) => setNewMsMonth(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>
                        Mes #{m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newMsKind}
                    onChange={(e) => setNewMsKind(e.target.value as any)}
                    className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                  >
                    <option value="INCOME_BONUS">Ingreso Extraordinario</option>
                    <option value="ANNUAL_EXPENSE">Gasto Anual Programado</option>
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Monto GTQ"
                      value={newMsAmount}
                      onChange={(e) => setNewMsAmount(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                    >
                      +
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          Mes #{m.month_number} — {m.name}
                        </p>
                        <p className="text-[11px] text-slate-400">{m.notes}</p>
                      </div>
                      <span
                        className={`font-bold ${
                          m.kind === "INCOME_BONUS"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {m.kind === "INCOME_BONUS" ? "+" : "-"}
                        {fmtQ(m.estimated_amount_gtq)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 7: INTERACTIVE ANDROID EXPRESS SIMULATOR (MODULES 3.1, 3.2 & SCENARIO 1)
        =================================================================== */}
        {activeTab === "MOBILE_SIMULATOR" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Phone Frame Preview */}
            <div className="max-w-md mx-auto w-full rounded-[32px] bg-slate-900 border-4 border-slate-800 p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white">
                    FinControl Android • Captura Express (&lt;5s)
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  RN-03 Sin Bloqueo NIT
                </span>
              </div>

              <form onSubmit={handleMobileExpressSubmit} className="space-y-4">
                {/* 1. Direct Numeric Amount + Currency Toggle */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-slate-400">
                      1. Monto Pagado Total
                    </label>
                    <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                      {(["GTQ", "USD"] as const).map((curr) => (
                        <button
                          type="button"
                          key={curr}
                          onClick={() => setMobCurrency(curr)}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                            mobCurrency === curr
                              ? "bg-indigo-600 text-white"
                              : "text-slate-400"
                          }`}
                        >
                          {curr}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-indigo-400">
                      {mobCurrency === "GTQ" ? "Q" : "$"}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={mobAmount}
                      onChange={(e) => setMobAmount(e.target.value)}
                      className="w-full bg-transparent text-3xl font-extrabold text-white focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* 2. Merchant Autocomplete */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    2. Comercio (Autocompletado predictivo de categoría)
                  </label>
                  <input
                    type="text"
                    value={mobMerchant}
                    onChange={(e) => handleMerchantTyping(e.target.value)}
                    placeholder="Ej. La Torre, Gasolinera Texaco, San Martín..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      "Restaurante San Martín",
                      "Supermercados La Torre",
                      "Gasolinera Texaco",
                      "Farmacia Galeno",
                    ].map((quickMerch) => (
                      <button
                        type="button"
                        key={quickMerch}
                        onClick={() => handleMerchantTyping(quickMerch)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        {quickMerch}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Visual Category Chips */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    3. Categoría Predictiva
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setMobCategoryId(cat.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition ${
                          mobCategoryId === cat.id
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-950 border-slate-800 text-slate-400"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Split Expense Toggle (Module 3.2 & Scenario 1) */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      ¿Es un gasto compartido? (RN-01)
                    </span>
                    <input
                      type="checkbox"
                      checked={mobIsSplit}
                      onChange={(e) => setMobIsSplit(e.target.checked)}
                      className="h-4 w-4 accent-indigo-500"
                    />
                  </div>

                  {mobIsSplit && (
                    <div className="space-y-3 pt-1 border-t border-slate-800">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMobSplitMode("PERCENTAGE")}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold ${
                            mobSplitMode === "PERCENTAGE"
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-900 text-slate-400"
                          }`}
                        >
                          Por % Participación
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobSplitMode("EXACT_PERSONAL_AMOUNT")}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold ${
                            mobSplitMode === "EXACT_PERSONAL_AMOUNT"
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-900 text-slate-400"
                          }`}
                        >
                          Por Monto Propio
                        </button>
                      </div>

                      {mobSplitMode === "PERCENTAGE" ? (
                        <div className="flex items-center gap-2">
                          {[50, 33, 25].map((pct) => (
                            <button
                              type="button"
                              key={pct}
                              onClick={() => setMobSplitPct(pct)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                mobSplitPct === pct
                                  ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                                  : "bg-slate-900 border-slate-800 text-slate-400"
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                          <input
                            type="number"
                            value={mobSplitPct}
                            onChange={(e) => setMobSplitPct(Number(e.target.value))}
                            className="w-20 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white text-center"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">
                            Mi parte real asumida ({mobCurrency}):
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={mobExactOwn}
                            onChange={(e) => setMobExactOwn(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                          />
                        </div>
                      )}

                      {liveSplitPreview && (
                        <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-300">
                              Gasto Personal Real (Presupuesto):
                            </span>
                            <span className="font-bold text-emerald-400">
                              {fmtQ(liveSplitPreview.personalAmountGtq)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">
                              Cuenta por Cobrar a Terceros (Activo):
                            </span>
                            <span className="font-bold text-amber-400">
                              {fmtQ(liveSplitPreview.receivableAmountGtq)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={mobSubmitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-xs font-bold text-white shadow-lg"
                >
                  {mobSubmitting
                    ? "Sincronizando con PostgreSQL..."
                    : "Guardar Gasto Express y Sincronizar"}
                </button>
              </form>
            </div>

            {/* Right: Architecture Explanation of Mobile Sync */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
              <h3 className="text-base font-bold text-white">
                Sincronización en Tiempo Real: App Android ↔ Plataforma Web
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Este simulador ejecuta exactamente el mismo endpoint{" "}
                <code className="text-indigo-300">POST /api/v1/transactions</code> que
                consume el repositorio nativo Android (
                <code className="text-indigo-300">fincontrol-android</code>) mediante
                Room + WorkManager.
              </p>
              <ul className="space-y-2.5 text-xs text-slate-300 list-disc pl-4">
                <li>
                  <strong>Escenario 1 Verificado:</strong> Al registrar Q 600.00 al 50%
                  en un restaurante, únicamente Q 300.00 consumen el presupuesto de la
                  categoría y los otros Q 300.00 pasan a Cuentas por Cobrar.
                </li>
                <li>
                  <strong>Cero fricción tributaria (RN-03):</strong> No solicita NIT ni
                  serie de factura; soporta compras en efectivo e informales.
                </li>
                <li>
                  <strong>Emparejamiento Antiduplicidad:</strong> Queda marcado como{" "}
                  <code className="text-amber-300">PENDING_STATEMENT_MATCH</code> hasta
                  que subas el PDF del estado de cuenta bancario en la pestaña Dropzone.
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* RN-04 Manual Transaction Edit & Override Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white">
                Ajuste Manual / Auditoría (RN-04)
              </h3>
              <button
                onClick={() => setEditingTx(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nombre Comercio</label>
                <input
                  type="text"
                  value={editMerchant}
                  onChange={(e) => setEditMerchant(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Reclasificar Categoría</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.macro_group})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  % Participación Propia ({editSplitPct}%)
                </label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={editSplitPct}
                  onChange={(e) => setEditSplitPct(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Gasto personal calculado:{" "}
                  <strong className="text-emerald-400">
                    {fmtQ((editingTx.total_amount_gtq * editSplitPct) / 100)}
                  </strong>{" "}
                  • Cuenta por Cobrar:{" "}
                  <strong className="text-amber-400">
                    {fmtQ(
                      editingTx.total_amount_gtq -
                        (editingTx.total_amount_gtq * editSplitPct) / 100
                    )}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingTx(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTxOverride}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Guardar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
