import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateRangeFilter, type DateRange, rangeStart } from "@/components/app/DateRangeFilter";
import { SearchSelect } from "@/components/app/SearchSelect";
import { loadSettings } from "@/routes/settings";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";

type PaymentMethod = "cash" | "card" | "online" | "fonepay" | "esewa";
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "fonepay", "esewa", "card", "online"];

type LocalPayment = {
  id: string;
  receipt_no: string;
  invoice_id: string;
  patient_id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  reference?: string | null;
  notes?: string | null;
};

type LocalExpense = {
  id: string;
  incurred_on: string;
  category: string;
  doctor_id?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  vendor?: string | null;
  notes?: string | null;
  recurring_id?: string | null;
};

type LocalRecurringExpense = {
  id: string;
  name: string;
  category: string;
  doctor_id?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  day_of_month: number;
  active: boolean;
  notes?: string | null;
};

type LocalCommissionRule = {
  id: string;
  doctor_id: string;
  scope: "visit" | "service";
  invoice_type?: string | null;
  service_category?: string | null;
  service_match?: string | null;
  calc_type: "percent" | "fixed";
  value: number;
  active: boolean;
};

type LocalFinanceState = {
  receipt_last_no: Record<string, number>;
  payments: LocalPayment[];
  expenses: LocalExpense[];
  recurring: LocalRecurringExpense[];
  commission_rules: LocalCommissionRule[];
  expense_categories: string[];
};

const LOCAL_FINANCE_KEY = "kpcms.finance.local.v1";

function loadLocalFinance(): LocalFinanceState {
  if (typeof window === "undefined") {
    return { receipt_last_no: {}, payments: [], expenses: [], recurring: [], commission_rules: [], expense_categories: [] };
  }
  try {
    const raw = localStorage.getItem(LOCAL_FINANCE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      receipt_last_no: parsed.receipt_last_no ?? {},
      payments: parsed.payments ?? [],
      expenses: parsed.expenses ?? [],
      recurring: parsed.recurring ?? [],
      commission_rules: parsed.commission_rules ?? [],
      expense_categories: parsed.expense_categories ?? [],
    };
  } catch {
    return { receipt_last_no: {}, payments: [], expenses: [], recurring: [], commission_rules: [], expense_categories: [] };
  }
}

function saveLocalFinance(next: LocalFinanceState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_FINANCE_KEY, JSON.stringify(next));
}

function nextReceiptNoLocal(state: LocalFinanceState) {
  const y = String(new Date().getFullYear());
  const n = (state.receipt_last_no[y] ?? 0) + 1;
  state.receipt_last_no[y] = n;
  return `RCPT-${y}-${String(n).padStart(4, "0")}`;
}

function newLocalId() {
  return (
    (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [{ title: "Finance — KPC-MS" }] }),
  component: () => <AppShell><FinancePage /></AppShell>,
});

function FinancePage() {
  const settings = loadSettings();
  const money = settings.currency === "NPR" ? "Rs" : settings.currency;
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [range, setRange] = useState<DateRange>("month");
  const start = rangeStart(range);
  const [local, setLocal] = useState<LocalFinanceState>(() => loadLocalFinance());
  const updateLocal = (recipe: (draft: LocalFinanceState) => void) => {
    setLocal((prev) => {
      const next =
        typeof (globalThis as any).structuredClone === "function"
          ? (globalThis as any).structuredClone(prev)
          : JSON.parse(JSON.stringify(prev));
      recipe(next);
      saveLocalFinance(next);
      return next;
    });
  };

  useEffect(() => {
    setLocal(loadLocalFinance());
    const handler = (e: StorageEvent) => {
      if (e.key === LOCAL_FINANCE_KEY) setLocal(loadLocalFinance());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const { data: caps, isLoading: capsLoading } = useQuery({
    queryKey: ["finance-caps"],
    retry: false,
    queryFn: async () => {
      const exists = async (table: string) => {
        const { error } = await supabase.from(table as any).select("*").limit(1);
        if (!error) return true;
        if (String((error as any).message || "").toLowerCase().includes("could not find the table")) return false;
        return true;
      };
      const [payments, expenses, recurring, commissions] = await Promise.all([
        exists("invoice_payments"),
        exists("expenses"),
        exists("recurring_expenses"),
        exists("doctor_commission_rules"),
      ]);
      return { payments, expenses, recurring, commissions };
    },
  });

  const financeReady = !!caps?.payments && !!caps?.expenses && !!caps?.recurring && !!caps?.commissions;
  const localSig = `${local.payments.length}-${local.expenses.length}-${local.recurring.length}-${local.commission_rules.length}`;

  const { data: dash } = useQuery({
    queryKey: ["finance-dash", range, caps?.payments ? "p1" : "p0", caps?.expenses ? "e1" : "e0", localSig],
    queryFn: async () => {
      const isoStart = start ? start.toISOString() : "1970-01-01T00:00:00.000Z";
      const dayStart = start ? start.toISOString().slice(0, 10) : "1970-01-01";
      const localPayments = caps?.payments
        ? null
        : local.payments.filter((p) => new Date(p.paid_at).toISOString() >= isoStart);
      const localExpenses = caps?.expenses
        ? null
        : local.expenses.filter((e) => String(e.incurred_on) >= dayStart);
      const [inv, pay, exp] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, total, paid_amount, status")
          .gte("created_at", isoStart),
        caps?.payments
          ? supabase
              .from("invoice_payments")
              .select("amount, paid_at")
              .gte("paid_at", isoStart)
          : Promise.resolve({ data: localPayments ?? [], error: null } as any),
        caps?.expenses
          ? supabase
              .from("expenses")
              .select("amount, incurred_on")
              .gte("incurred_on", dayStart)
          : Promise.resolve({ data: localExpenses ?? [], error: null } as any),
      ]);
      if (inv.error || pay.error || exp.error) {
        return { revenue: 0, expenseTotal: 0, profit: 0, outstanding: 0, pendingCount: 0, revenueFromPayments: 0, fallbackRevenue: 0 };
      }
      const invoices = inv.data ?? [];
      const payments = pay.data ?? [];
      const expenses = exp.data ?? [];
      const revenueFromPayments = payments.reduce((s, p) => s + Number((p as any).amount || 0), 0);
      const fallbackRevenue = invoices.reduce((s, i) => s + Number((i as any).paid_amount || 0), 0);
      const revenue = revenueFromPayments > 0 ? revenueFromPayments : fallbackRevenue;
      const expenseTotal = expenses.reduce((s, e) => s + Number((e as any).amount || 0), 0);
      const profit = revenue - expenseTotal;
      const outstanding = invoices.reduce((s, i) => s + Math.max(0, Number((i as any).total || 0) - Number((i as any).paid_amount || 0)), 0);
      const pendingCount = invoices.filter((i: any) => Number(i.total) > Number(i.paid_amount)).length;
      return { revenue, expenseTotal, profit, outstanding, pendingCount, revenueFromPayments, fallbackRevenue };
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">Revenue, expenses, payments, commissions and reports.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["finance-dash"] })}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {capsLoading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Checking finance database…</CardContent>
        </Card>
      )}

      {!capsLoading && !financeReady && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Finance database not set up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="text-muted-foreground">
              Apply the Supabase migration that adds finance tables, then refresh the page.
            </div>
            <div className="text-muted-foreground">
              Migration files: supabase/migrations/20260520121500_finance_module.sql, supabase/migrations/20260520123500_finance_rls_and_triggers.sql
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric title="Revenue" value={`${money} ${(dash?.revenue ?? 0).toFixed(2)}`} sub={dash?.revenueFromPayments ? "From payments" : "From invoice paid totals"} />
            <Metric title="Expenses" value={`${money} ${(dash?.expenseTotal ?? 0).toFixed(2)}`} />
            <Metric title="Profit" value={`${money} ${(dash?.profit ?? 0).toFixed(2)}`} />
            <Metric title="Outstanding" value={`${money} ${(dash?.outstanding ?? 0).toFixed(2)}`} sub={`${dash?.pendingCount ?? 0} unpaid/partial invoices`} />
            <Metric title="Period" value={rangeLabel(range)} sub={start ? `Since ${start.toLocaleDateString()}` : "All time"} />
          </div>
        </TabsContent>

        <TabsContent value="payments">
          {caps?.payments ? (
            <PaymentsPanel money={money} />
          ) : (
            <LocalPaymentsPanel money={money} local={local} updateLocal={updateLocal} />
          )}
        </TabsContent>

        <TabsContent value="expenses">
          {caps?.expenses ? (
            <ExpensesPanel money={money} />
          ) : (
            <LocalExpensesPanel money={money} local={local} updateLocal={updateLocal} />
          )}
        </TabsContent>

        <TabsContent value="commissions">
          {caps?.commissions ? (
            <CommissionsPanel money={money} />
          ) : (
            <LocalCommissionsPanel
              money={money}
              local={local}
              updateLocal={updateLocal}
              expensesEnabled={!!caps?.expenses}
            />
          )}
        </TabsContent>

        <TabsContent value="reports">
          <ReportsPanel
            money={money}
            paymentsEnabled={!!caps?.payments}
            expensesEnabled={!!caps?.expenses}
            local={local}
            localSig={localSig}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function rangeLabel(r: DateRange) {
  if (r === "today") return "Today";
  if (r === "week") return "Last 7 days";
  if (r === "15days") return "Last 15 days";
  if (r === "month") return "Last 30 days";
  return "All time";
}

function PaymentsPanel({ money }: { money: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [prefillInvoice, setPrefillInvoice] = useState<string | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["finance-payments", q],
    queryFn: async () => {
      let query = supabase
        .from("invoice_payments")
        .select("*, invoices(invoice_number,total,paid_amount,status), patients(full_name)")
        .order("paid_at", { ascending: false });
      if (q.trim()) query = query.ilike("receipt_no", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const printReceipt = (p: any) => {
    const settings = loadSettings();
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(settings.clinic_name || "KPC-MS", 14, 16);
    doc.setFontSize(10);
    doc.text("Payment receipt", 14, 22);
    doc.setFontSize(10);
    const lines = [
      ["Receipt #", p.receipt_no],
      ["Date", new Date(p.paid_at).toLocaleString()],
      ["Patient", p.patients?.full_name ?? "—"],
      ["Billing #", p.invoices?.invoice_number ?? "—"],
      ["Method", String(p.method || "cash").toUpperCase()],
      ["Amount", `${money} ${Number(p.amount).toFixed(2)}`],
      ["Reference", p.reference ?? "—"],
    ];
    autoTable(doc, { startY: 28, head: [["Field", "Value"]], body: lines });
    doc.save(`${p.receipt_no}.pdf`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Input className="w-64" placeholder="Search by receipt #" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setPrefillInvoice(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add payment
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && (payments ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No payments</TableCell></TableRow>}
              {(payments ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.receipt_no}</TableCell>
                  <TableCell>{new Date(p.paid_at).toLocaleString()}</TableCell>
                  <TableCell>{p.patients?.full_name ?? "—"}</TableCell>
                  <TableCell>{p.invoices?.invoice_number ?? "—"}</TableCell>
                  <TableCell className="uppercase text-xs">{p.method}</TableCell>
                  <TableCell className="text-right">{money} {Number(p.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setPrefillInvoice(p.invoice_id); setOpen(true); }}>
                        <Plus className="h-3 w-3" /> More
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => printReceipt(p)}>
                        <Printer className="h-3 w-3" /> Receipt
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PaymentDialog
        open={open}
        onOpenChange={setOpen}
        initialInvoiceId={prefillInvoice}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["finance-payments"] });
          qc.invalidateQueries({ queryKey: ["invoices"] });
          qc.invalidateQueries({ queryKey: ["finance-dash"] });
        }}
      />
    </div>
  );
}

function LocalPaymentsPanel({
  money,
  local,
  updateLocal,
}: {
  money: string;
  local: LocalFinanceState;
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [prefillInvoice, setPrefillInvoice] = useState<string | null>(null);

  const { data: invoices } = useQuery({
    queryKey: ["finance-invoices-min-local"],
    queryFn: async () =>
      (
        await supabase
          .from("invoices")
          .select("id, invoice_number, patient_id, total, paid_amount, status")
          .order("created_at", { ascending: false })
          .limit(500)
      ).data ?? [],
  });

  const { data: patients } = useQuery({
    queryKey: ["finance-patients-min-local"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });

  const invById = useMemo(() => Object.fromEntries((invoices ?? []).map((i: any) => [i.id, i])), [invoices]);
  const patById = useMemo(() => Object.fromEntries((patients ?? []).map((p: any) => [p.id, p])), [patients]);

  const rows = useMemo(() => {
    const list = [...(local.payments ?? [])].sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
    const qq = q.trim().toLowerCase();
    return qq ? list.filter((p) => String(p.receipt_no).toLowerCase().includes(qq)) : list;
  }, [local.payments, q]);

  const printReceipt = (p: LocalPayment) => {
    const settings = loadSettings();
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(settings.clinic_name || "KPC-MS", 14, 16);
    doc.setFontSize(10);
    doc.text("Payment receipt", 14, 22);
    const inv = invById[p.invoice_id];
    const pat = patById[p.patient_id];
    const lines = [
      ["Receipt #", p.receipt_no],
      ["Date", new Date(p.paid_at).toLocaleString()],
      ["Patient", pat?.full_name ?? "—"],
      ["Billing #", inv?.invoice_number ?? "—"],
      ["Method", String(p.method || "cash").toUpperCase()],
      ["Amount", `${money} ${Number(p.amount).toFixed(2)}`],
      ["Reference", p.reference ?? "—"],
    ];
    autoTable(doc, { startY: 28, head: [["Field", "Value"]], body: lines });
    doc.save(`${p.receipt_no}.pdf`);
  };

  const deletePayment = async (id: string) => {
    const current = local.payments.find((p) => p.id === id);
    if (!current) return;
    updateLocal((draft) => {
      draft.payments = (draft.payments ?? []).filter((p) => p.id !== id);
    });
    const latest = loadLocalFinance();
    const sum = latest.payments.filter((p) => p.invoice_id === current.invoice_id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const inv = invById[current.invoice_id];
    const total = Number(inv?.total || 0);
    const status = total > 0 ? (sum >= total ? "paid" : sum > 0 ? "partial" : "unpaid") : "unpaid";
    await supabase.from("invoices").update({ paid_amount: sum, status } as any).eq("id", current.invoice_id);
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["finance-dash"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Input className="w-64" placeholder="Search by receipt #" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setPrefillInvoice(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add payment
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No payments</TableCell></TableRow>}
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.receipt_no}</TableCell>
                  <TableCell>{new Date(p.paid_at).toLocaleString()}</TableCell>
                  <TableCell>{patById[p.patient_id]?.full_name ?? "—"}</TableCell>
                  <TableCell>{invById[p.invoice_id]?.invoice_number ?? "—"}</TableCell>
                  <TableCell className="uppercase text-xs">{p.method}</TableCell>
                  <TableCell className="text-right">{money} {Number(p.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setPrefillInvoice(p.invoice_id); setOpen(true); }}>
                        <Plus className="h-3 w-3" /> More
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => printReceipt(p)}>
                        <Printer className="h-3 w-3" /> Receipt
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => deletePayment(p.id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LocalPaymentDialog
        open={open}
        onOpenChange={setOpen}
        initialInvoiceId={prefillInvoice}
        money={money}
        invoices={invoices ?? []}
        patients={patients ?? []}
        updateLocal={updateLocal}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["invoices"] });
          qc.invalidateQueries({ queryKey: ["finance-dash"] });
        }}
      />
    </div>
  );
}

function LocalPaymentDialog({
  open,
  onOpenChange,
  initialInvoiceId,
  money,
  invoices,
  patients,
  updateLocal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialInvoiceId: string | null;
  money: string;
  invoices: any[];
  patients: any[];
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    invoice_id: initialInvoiceId ?? "",
    patient_id: "",
    amount: "",
    method: "cash" as PaymentMethod,
    reference: "",
    notes: "",
    paid_at: new Date().toISOString().slice(0, 16),
  });

  const selectedInvoice = (invoices ?? []).find((i: any) => i.id === form.invoice_id);
  const balance = useMemo(() => {
    if (!selectedInvoice) return 0;
    return Math.max(0, Number(selectedInvoice.total || 0) - Number(selectedInvoice.paid_amount || 0));
  }, [selectedInvoice]);

  const save = async () => {
    if (!form.invoice_id) return toast.error("Invoice required");
    const inv = selectedInvoice;
    const patientId = form.patient_id || inv?.patient_id;
    if (!patientId) return toast.error("Patient required");
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return toast.error("Amount required");
    setBusy(true);
    const paidAtIso = form.paid_at ? new Date(form.paid_at).toISOString() : new Date().toISOString();
    updateLocal((draft) => {
      const receipt = nextReceiptNoLocal(draft);
      const payment: LocalPayment = {
        id: newLocalId(),
        receipt_no: receipt,
        invoice_id: form.invoice_id,
        patient_id: patientId,
        amount: amt,
        method: form.method,
        paid_at: paidAtIso,
        reference: form.reference?.trim() || null,
        notes: form.notes?.trim() || null,
      };
      draft.payments = [payment, ...(draft.payments ?? [])];
    });
    const latest = loadLocalFinance();
    const sum = latest.payments.filter((p) => p.invoice_id === form.invoice_id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const total = Number(inv?.total || 0);
    const status = total > 0 ? (sum >= total ? "paid" : sum > 0 ? "partial" : "unpaid") : "unpaid";
    const { error } = await supabase.from("invoices").update({ paid_amount: sum, status } as any).eq("id", form.invoice_id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Payment recorded");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) setForm((s: any) => ({ ...s, invoice_id: initialInvoiceId ?? s.invoice_id })); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice *" className="sm:col-span-2">
            <SearchSelect
              value={form.invoice_id}
              onValueChange={(v) => {
                const inv = (invoices ?? []).find((i: any) => i.id === v);
                setForm((s: any) => ({ ...s, invoice_id: v, patient_id: inv?.patient_id ?? s.patient_id }));
              }}
              placeholder="Select invoice"
              options={(invoices ?? []).map((i: any) => ({
                value: i.id,
                label: i.invoice_number,
                keywords: `${i.invoice_number} ${Number(i.total).toFixed(2)} ${Number(i.paid_amount).toFixed(2)}`,
              }))}
            />
          </Field>
          <Field label="Patient" className="sm:col-span-2">
            <SearchSelect
              value={form.patient_id || selectedInvoice?.patient_id || ""}
              onValueChange={(v) => setForm((s: any) => ({ ...s, patient_id: v }))}
              placeholder="Auto from invoice (or override)"
              options={(patients ?? []).map((p: any) => ({ value: p.id, label: p.full_name }))}
            />
          </Field>
          <Field label="Method">
            <Select value={form.method} onValueChange={(v) => setForm((s: any) => ({ ...s, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Amount (${money}) *`}>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s: any) => ({ ...s, amount: e.target.value }))} />
            {selectedInvoice && <div className="text-xs text-muted-foreground mt-1">Balance due: {money} {balance.toFixed(2)}</div>}
          </Field>
          <Field label="Paid at" className="sm:col-span-2">
            <Input type="datetime-local" value={form.paid_at} onChange={(e) => setForm((s: any) => ({ ...s, paid_at: e.target.value }))} />
          </Field>
          <Field label="Reference" className="sm:col-span-2">
            <Input value={form.reference} onChange={(e) => setForm((s: any) => ({ ...s, reference: e.target.value }))} placeholder="Card last4 / transaction id (optional)" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  initialInvoiceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialInvoiceId: string | null;
  onSaved?: () => void;
}) {
  const settings = loadSettings();
  const money = settings.currency === "NPR" ? "Rs" : settings.currency;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    invoice_id: initialInvoiceId ?? "",
    patient_id: "",
    amount: "",
    method: "cash" as PaymentMethod,
    reference: "",
    notes: "",
    paid_at: new Date().toISOString().slice(0, 16),
  });

  const { data: invoices } = useQuery({
    queryKey: ["finance-invoices-min"],
    enabled: open,
    queryFn: async () => (await supabase.from("invoices").select("id, invoice_number, patient_id, total, paid_amount").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  const { data: patients } = useQuery({
    queryKey: ["finance-patients-min"],
    enabled: open,
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });

  const selectedInvoice = (invoices ?? []).find((i: any) => i.id === form.invoice_id);
  const balance = useMemo(() => {
    if (!selectedInvoice) return 0;
    return Math.max(0, Number(selectedInvoice.total || 0) - Number(selectedInvoice.paid_amount || 0));
  }, [selectedInvoice]);

  const save = async () => {
    if (!form.invoice_id) return toast.error("Invoice required");
    const inv = selectedInvoice;
    const patientId = form.patient_id || inv?.patient_id;
    if (!patientId) return toast.error("Patient required");
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return toast.error("Amount required");
    setBusy(true);
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: form.invoice_id,
      patient_id: patientId,
      amount: amt,
      method: form.method,
      reference: form.reference?.trim() || null,
      notes: form.notes?.trim() || null,
      paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : undefined,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Payment recorded");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) setForm((s: any) => ({ ...s, invoice_id: initialInvoiceId ?? s.invoice_id })); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice *" className="sm:col-span-2">
            <SearchSelect
              value={form.invoice_id}
              onValueChange={(v) => {
                const inv = (invoices ?? []).find((i: any) => i.id === v);
                setForm((s: any) => ({ ...s, invoice_id: v, patient_id: inv?.patient_id ?? s.patient_id }));
              }}
              placeholder="Select invoice"
              options={(invoices ?? []).map((i: any) => ({
                value: i.id,
                label: i.invoice_number,
                keywords: `${i.invoice_number} ${Number(i.total).toFixed(2)} ${Number(i.paid_amount).toFixed(2)}`,
              }))}
            />
          </Field>
          <Field label="Patient" className="sm:col-span-2">
            <SearchSelect
              value={form.patient_id || selectedInvoice?.patient_id || ""}
              onValueChange={(v) => setForm((s: any) => ({ ...s, patient_id: v }))}
              placeholder="Auto from invoice (or override)"
              options={(patients ?? []).map((p: any) => ({ value: p.id, label: p.full_name }))}
            />
          </Field>
          <Field label="Method">
            <Select value={form.method} onValueChange={(v) => setForm((s: any) => ({ ...s, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Amount (${money}) *`}>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s: any) => ({ ...s, amount: e.target.value }))} />
            {selectedInvoice && <div className="text-xs text-muted-foreground mt-1">Balance due: {money} {balance.toFixed(2)}</div>}
          </Field>
          <Field label="Paid at" className="sm:col-span-2">
            <Input type="datetime-local" value={form.paid_at} onChange={(e) => setForm((s: any) => ({ ...s, paid_at: e.target.value }))} />
          </Field>
          <Field label="Reference" className="sm:col-span-2">
            <Input value={form.reference} onChange={(e) => setForm((s: any) => ({ ...s, reference: e.target.value }))} placeholder="Card last4 / transaction id (optional)" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpensesPanel({ money }: { money: string }) {
  const qc = useQueryClient();
  const [openExpense, setOpenExpense] = useState(false);
  const [openCategory, setOpenCategory] = useState(false);
  const [openRecurring, setOpenRecurring] = useState(false);
  const [q, setQ] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await supabase.from("expense_categories").select("*").order("name")).data ?? [],
  });

  const { data: doctors } = useQuery({
    queryKey: ["doctors-min-finance"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name")).data ?? [],
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", q],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select("*, expense_categories(name), doctors(full_name)")
        .order("incurred_on", { ascending: false });
      if (q.trim()) query = query.ilike("vendor", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: recurring } = useQuery({
    queryKey: ["recurring-expenses"],
    queryFn: async () => (await supabase.from("recurring_expenses").select("*, expense_categories(name), doctors(full_name)").order("name")).data ?? [],
  });

  const generateThisMonth = async () => {
    const month = new Date();
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc("generate_recurring_expenses", { p_month: monthStart } as any);
    if (error) return toast.error(error.message);
    toast.success(`Generated ${Number(data ?? 0)} expense(s)`);
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
    qc.invalidateQueries({ queryKey: ["finance-dash"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Input className="w-64" placeholder="Search vendor" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateThisMonth}>
            <RefreshCw className="h-4 w-4" /> Generate monthly
          </Button>
          <Button variant="outline" onClick={() => setOpenRecurring(true)}>Recurring</Button>
          <Button variant="outline" onClick={() => setOpenCategory(true)}>Categories</Button>
          <Button onClick={() => setOpenExpense(true)}><Plus className="h-4 w-4" /> Add expense</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && (expenses ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No expenses</TableCell></TableRow>}
              {(expenses ?? []).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>{e.incurred_on}</TableCell>
                  <TableCell>{e.expense_categories?.name ?? "—"}</TableCell>
                  <TableCell>{e.doctors?.full_name ?? "—"}</TableCell>
                  <TableCell>{e.vendor ?? "—"}</TableCell>
                  <TableCell className="uppercase text-xs">{e.payment_method}</TableCell>
                  <TableCell className="text-right">{money} {Number(e.amount).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ExpenseDialog
        open={openExpense}
        onOpenChange={setOpenExpense}
        categories={categories ?? []}
        doctors={doctors ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["expenses"] });
          qc.invalidateQueries({ queryKey: ["finance-dash"] });
        }}
      />

      <CategoryDialog
        open={openCategory}
        onOpenChange={setOpenCategory}
        categories={categories ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["expense-categories"] })}
      />

      <RecurringDialog
        open={openRecurring}
        onOpenChange={setOpenRecurring}
        categories={categories ?? []}
        doctors={doctors ?? []}
        templates={recurring ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
          qc.invalidateQueries({ queryKey: ["expenses"] });
          qc.invalidateQueries({ queryKey: ["finance-dash"] });
        }}
      />
    </div>
  );
}

function LocalExpensesPanel({
  money,
  local,
  updateLocal,
}: {
  money: string;
  local: LocalFinanceState;
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
}) {
  const qc = useQueryClient();
  const [openExpense, setOpenExpense] = useState(false);
  const [openCategory, setOpenCategory] = useState(false);
  const [openRecurring, setOpenRecurring] = useState(false);
  const [q, setQ] = useState("");

  const { data: doctors } = useQuery({
    queryKey: ["doctors-min-finance-local"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name")).data ?? [],
  });

  const docById = useMemo(() => Object.fromEntries((doctors ?? []).map((d: any) => [d.id, d])), [doctors]);

  const rows = useMemo(() => {
    const list = [...(local.expenses ?? [])].sort((a, b) => String(b.incurred_on).localeCompare(String(a.incurred_on)));
    const qq = q.trim().toLowerCase();
    return qq ? list.filter((e) => String(e.vendor || "").toLowerCase().includes(qq)) : list;
  }, [local.expenses, q]);

  const generateThisMonth = () => {
    const month = new Date();
    const ym = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    let count = 0;
    updateLocal((draft) => {
      const existing = new Set(
        (draft.expenses ?? [])
          .filter((e) => e.recurring_id && String(e.incurred_on || "").startsWith(ym))
          .map((e) => `${e.recurring_id}:${String(e.incurred_on).slice(0, 7)}`),
      );
      const toAdd: LocalExpense[] = [];
      (draft.recurring ?? []).filter((t) => t.active).forEach((t) => {
        const key = `${t.id}:${ym}`;
        if (existing.has(key)) return;
        const d = String(t.day_of_month).padStart(2, "0");
        const incurred_on = `${ym}-${d}`;
        toAdd.push({
          id: newLocalId(),
          incurred_on,
          category: t.category,
          doctor_id: t.doctor_id ?? null,
          amount: Number(t.amount || 0),
          payment_method: t.payment_method,
          vendor: t.name,
          notes: t.notes ?? null,
          recurring_id: t.id,
        });
      });
      if (toAdd.length) {
        draft.expenses = [...toAdd, ...(draft.expenses ?? [])];
        count = toAdd.length;
      }
    });
    toast.success(`Generated ${count} expense(s)`);
    qc.invalidateQueries({ queryKey: ["finance-dash"] });
  };

  const deleteExpense = (id: string) => {
    updateLocal((draft) => {
      draft.expenses = (draft.expenses ?? []).filter((e) => e.id !== id);
    });
    qc.invalidateQueries({ queryKey: ["finance-dash"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Input className="w-64" placeholder="Search vendor" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateThisMonth}>
            <RefreshCw className="h-4 w-4" /> Generate monthly
          </Button>
          <Button variant="outline" onClick={() => setOpenRecurring(true)}>Recurring</Button>
          <Button variant="outline" onClick={() => setOpenCategory(true)}>Categories</Button>
          <Button onClick={() => setOpenExpense(true)}><Plus className="h-4 w-4" /> Add expense</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No expenses</TableCell></TableRow>}
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.incurred_on}</TableCell>
                  <TableCell>{e.category || "—"}</TableCell>
                  <TableCell>{e.doctor_id ? (docById[e.doctor_id]?.full_name ?? "—") : "—"}</TableCell>
                  <TableCell>{e.vendor ?? "—"}</TableCell>
                  <TableCell className="uppercase text-xs">{e.payment_method}</TableCell>
                  <TableCell className="text-right">{money} {Number(e.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteExpense(e.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LocalExpenseDialog
        open={openExpense}
        onOpenChange={setOpenExpense}
        money={money}
        categories={local.expense_categories ?? []}
        doctors={doctors ?? []}
        updateLocal={updateLocal}
        onSaved={() => qc.invalidateQueries({ queryKey: ["finance-dash"] })}
      />

      <LocalCategoryDialog
        open={openCategory}
        onOpenChange={setOpenCategory}
        categories={local.expense_categories ?? []}
        updateLocal={updateLocal}
      />

      <LocalRecurringDialog
        open={openRecurring}
        onOpenChange={setOpenRecurring}
        categories={local.expense_categories ?? []}
        doctors={doctors ?? []}
        templates={local.recurring ?? []}
        updateLocal={updateLocal}
        money={money}
        onSaved={() => qc.invalidateQueries({ queryKey: ["finance-dash"] })}
      />
    </div>
  );
}

function LocalExpenseDialog({
  open,
  onOpenChange,
  money,
  categories,
  doctors,
  updateLocal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  money: string;
  categories: string[];
  doctors: any[];
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    incurred_on: new Date().toISOString().slice(0, 10),
    category: "",
    doctor_id: "",
    amount: "",
    payment_method: "cash",
    vendor: "",
    notes: "",
  });

  const save = () => {
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return toast.error("Amount required");
    setBusy(true);
    updateLocal((draft) => {
      const exp: LocalExpense = {
        id: newLocalId(),
        incurred_on: form.incurred_on,
        category: form.category,
        doctor_id: form.doctor_id || null,
        amount: amt,
        payment_method: form.payment_method || "cash",
        vendor: form.vendor?.trim() || null,
        notes: form.notes?.trim() || null,
        recurring_id: null,
      };
      draft.expenses = [exp, ...(draft.expenses ?? [])];
    });
    setBusy(false);
    toast.success("Expense saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" value={form.incurred_on} onChange={(e) => setForm((s: any) => ({ ...s, incurred_on: e.target.value }))} />
          </Field>
          <Field label="Method">
            <Select value={form.payment_method} onValueChange={(v) => setForm((s: any) => ({ ...s, payment_method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category" className="sm:col-span-2">
            <SearchSelect
              value={form.category}
              onValueChange={(v) => setForm((s: any) => ({ ...s, category: v }))}
              placeholder="Select category"
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Doctor (salary/commission)" className="sm:col-span-2">
            <SearchSelect
              value={form.doctor_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, doctor_id: v }))}
              placeholder="Optional"
              options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
            />
          </Field>
          <Field label="Vendor" className="sm:col-span-2">
            <Input value={form.vendor} onChange={(e) => setForm((s: any) => ({ ...s, vendor: e.target.value }))} />
          </Field>
          <Field label={`Amount (${money}) *`} className="sm:col-span-2">
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s: any) => ({ ...s, amount: e.target.value }))} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocalCategoryDialog({
  open,
  onOpenChange,
  categories,
  updateLocal,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: string[];
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
}) {
  const [name, setName] = useState("");

  const add = () => {
    const n = name.trim();
    if (!n) return;
    updateLocal((draft) => {
      const list = [...new Set([...(draft.expense_categories ?? []), n])].sort((a, b) => a.localeCompare(b));
      draft.expense_categories = list;
    });
    setName("");
    toast.success("Category added");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Expense categories</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
            <Button onClick={add} disabled={!name.trim()}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          <div className="grid gap-2">
            {categories.length === 0 && <div className="text-sm text-muted-foreground">No categories yet</div>}
            {categories.map((c) => (
              <div key={c} className="text-sm flex items-center justify-between border rounded-md px-3 py-2">
                <div>{c}</div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocalRecurringDialog({
  open,
  onOpenChange,
  categories,
  doctors,
  templates,
  updateLocal,
  money,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: string[];
  doctors: any[];
  templates: LocalRecurringExpense[];
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
  money: string;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    name: "",
    category: "",
    doctor_id: "",
    amount: "",
    payment_method: "cash",
    day_of_month: 1,
    notes: "",
  });

  const add = () => {
    if (!form.name.trim()) return toast.error("Name required");
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return toast.error("Amount required");
    setBusy(true);
    updateLocal((draft) => {
      const t: LocalRecurringExpense = {
        id: newLocalId(),
        name: form.name.trim(),
        category: form.category,
        doctor_id: form.doctor_id || null,
        amount: amt,
        payment_method: form.payment_method || "cash",
        day_of_month: Math.max(1, Math.min(28, Number(form.day_of_month) || 1)),
        active: true,
        notes: form.notes?.trim() || null,
      };
      draft.recurring = [t, ...(draft.recurring ?? [])];
    });
    setBusy(false);
    toast.success("Recurring expense added");
    setForm({ name: "", category: "", doctor_id: "", amount: "", payment_method: "cash", day_of_month: 1, notes: "" });
    onSaved?.();
  };

  const toggle = (id: string) => {
    updateLocal((draft) => {
      draft.recurring = (draft.recurring ?? []).map((t) => (t.id === id ? { ...t, active: !t.active } : t));
    });
    onSaved?.();
  };

  const remove = (id: string) => {
    updateLocal((draft) => {
      draft.recurring = (draft.recurring ?? []).filter((t) => t.id !== id);
    });
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Recurring monthly expenses</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm((s: any) => ({ ...s, name: e.target.value }))} placeholder="Rent / Salary / Internet" />
          </Field>
          <Field label="Category">
            <SearchSelect
              value={form.category}
              onValueChange={(v) => setForm((s: any) => ({ ...s, category: v }))}
              placeholder="Select"
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Doctor (salary)">
            <SearchSelect
              value={form.doctor_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, doctor_id: v }))}
              placeholder="Optional"
              options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
            />
          </Field>
          <Field label="Method">
            <Select value={form.payment_method} onValueChange={(v) => setForm((s: any) => ({ ...s, payment_method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Day of month (1-28)">
            <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm((s: any) => ({ ...s, day_of_month: e.target.value }))} />
          </Field>
          <Field label={`Amount (${money}) *`} className="sm:col-span-2">
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s: any) => ({ ...s, amount: e.target.value }))} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={add} disabled={busy}><Plus className="h-4 w-4" /> Add recurring</Button>
        </div>

        <Card className="mt-4">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No recurring expenses</TableCell></TableRow>}
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>{t.category || "—"}</TableCell>
                    <TableCell>{t.doctor_id ? doctors.find((d) => d.id === t.doctor_id)?.full_name ?? "—" : "—"}</TableCell>
                    <TableCell>{t.day_of_month}</TableCell>
                    <TableCell>{t.active ? "Active" : "Paused"}</TableCell>
                    <TableCell className="text-right">{money} {Number(t.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggle(t.id)}>{t.active ? "Pause" : "Resume"}</Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(t.id)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  categories,
  doctors,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: any[];
  doctors: any[];
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    incurred_on: new Date().toISOString().slice(0, 10),
    category_id: "",
    doctor_id: "",
    amount: "",
    payment_method: "cash",
    vendor: "",
    notes: "",
  });

  const save = async () => {
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return toast.error("Amount required");
    setBusy(true);
    const { error } = await supabase.from("expenses").insert({
      incurred_on: form.incurred_on,
      category_id: form.category_id || null,
      doctor_id: form.doctor_id || null,
      amount: amt,
      payment_method: form.payment_method || "cash",
      vendor: form.vendor?.trim() || null,
      notes: form.notes?.trim() || null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Expense saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" value={form.incurred_on} onChange={(e) => setForm((s: any) => ({ ...s, incurred_on: e.target.value }))} />
          </Field>
          <Field label="Method">
            <Select value={form.payment_method} onValueChange={(v) => setForm((s: any) => ({ ...s, payment_method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category" className="sm:col-span-2">
            <SearchSelect
              value={form.category_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, category_id: v }))}
              placeholder="Select category"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Doctor (salary/commission)" className="sm:col-span-2">
            <SearchSelect
              value={form.doctor_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, doctor_id: v }))}
              placeholder="Optional"
              options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
            />
          </Field>
          <Field label="Vendor" className="sm:col-span-2">
            <Input value={form.vendor} onChange={(e) => setForm((s: any) => ({ ...s, vendor: e.target.value }))} />
          </Field>
          <Field label="Amount *" className="sm:col-span-2">
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s: any) => ({ ...s, amount: e.target.value }))} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: any[];
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("expense_categories").insert({ name: name.trim() } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    setName("");
    toast.success("Category added");
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Expense categories</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
            <Button onClick={add} disabled={busy || !name.trim()}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          <div className="grid gap-2">
            {categories.length === 0 && <div className="text-sm text-muted-foreground">No categories yet</div>}
            {categories.map((c) => (
              <div key={c.id} className="text-sm flex items-center justify-between border rounded-md px-3 py-2">
                <div>{c.name}</div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecurringDialog({
  open,
  onOpenChange,
  categories,
  doctors,
  templates,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: any[];
  doctors: any[];
  templates: any[];
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    name: "",
    category_id: "",
    doctor_id: "",
    amount: "",
    payment_method: "cash",
    day_of_month: 1,
    notes: "",
  });

  const add = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return toast.error("Amount required");
    setBusy(true);
    const { error } = await supabase.from("recurring_expenses").insert({
      name: form.name.trim(),
      category_id: form.category_id || null,
      doctor_id: form.doctor_id || null,
      amount: amt,
      payment_method: form.payment_method || "cash",
      day_of_month: Number(form.day_of_month) || 1,
      notes: form.notes?.trim() || null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Recurring expense added");
    setForm({ name: "", category_id: "", doctor_id: "", amount: "", payment_method: "cash", day_of_month: 1, notes: "" });
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Recurring monthly expenses</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm((s: any) => ({ ...s, name: e.target.value }))} placeholder="Rent / Salary / Internet" />
          </Field>
          <Field label="Category">
            <SearchSelect
              value={form.category_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, category_id: v }))}
              placeholder="Select"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Doctor (salary)" >
            <SearchSelect
              value={form.doctor_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, doctor_id: v }))}
              placeholder="Optional"
              options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
            />
          </Field>
          <Field label="Method">
            <Select value={form.payment_method} onValueChange={(v) => setForm((s: any) => ({ ...s, payment_method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Day of month (1-28)">
            <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm((s: any) => ({ ...s, day_of_month: e.target.value }))} />
          </Field>
          <Field label="Amount *" className="sm:col-span-2">
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s: any) => ({ ...s, amount: e.target.value }))} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={add} disabled={busy}><Plus className="h-4 w-4" /> Add recurring</Button>
        </div>

        <Card className="mt-4">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No recurring expenses</TableCell></TableRow>}
                {templates.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>{t.expense_categories?.name ?? "—"}</TableCell>
                    <TableCell>{t.doctors?.full_name ?? "—"}</TableCell>
                    <TableCell>{t.day_of_month}</TableCell>
                    <TableCell className="text-right">{Number(t.amount).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommissionsPanel({ money }: { money: string }) {
  const qc = useQueryClient();
  const [openRule, setOpenRule] = useState(false);
  const [range, setRange] = useState<DateRange>("month");
  const start = rangeStart(range);

  const { data: doctors } = useQuery({
    queryKey: ["doctors-min-commission"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name")).data ?? [],
  });

  const { data: rules } = useQuery({
    queryKey: ["doctor-commission-rules"],
    queryFn: async () => (await supabase.from("doctor_commission_rules").select("*, doctors(full_name)").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: report } = useQuery({
    queryKey: ["commission-report", range],
    queryFn: async () => {
      const since = start ? start.toISOString() : "1970-01-01T00:00:00.000Z";
      const [itemsRes, expRes] = await Promise.all([
        supabase
          .from("invoice_items")
          .select("id, description, category, quantity, unit_price, doctor_id, invoice_id, invoices(id, doctor_id, invoice_type, total, paid_amount, created_at)")
          .gte("created_at", since),
        supabase
          .from("expenses")
          .select("amount, doctor_id, incurred_on")
          .gte("incurred_on", start ? start.toISOString().slice(0, 10) : "1970-01-01"),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (expRes.error) throw expRes.error;
      const items = itemsRes.data ?? [];
      const expenses = expRes.data ?? [];

      const byDoctor: Record<string, { revenue: number; commission: number; salary: number }> = {};
      const activeRules = (rules ?? []).filter((r: any) => r.active);

      const getDoctor = (it: any) => it.doctor_id || it.invoices?.doctor_id;
      const realizedAmount = (it: any) => {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unit_price || 0);
        const amount = qty * unit;
        const inv = it.invoices;
        const total = Number(inv?.total || 0);
        const paid = Number(inv?.paid_amount || 0);
        const ratio = total > 0 ? Math.min(1, paid / total) : 0;
        return amount * ratio;
      };

      const pickRule = (doctorId: string, it: any) => {
        const inv = it.invoices;
        const list = activeRules.filter((r: any) => r.doctor_id === doctorId);
        const service = list.filter((r: any) => r.scope === "service");
        const matches = service.filter((r: any) => {
          if (r.invoice_type && inv?.invoice_type && r.invoice_type !== inv.invoice_type) return false;
          if (r.service_category && r.service_category !== it.category) return false;
          if (r.service_match && !String(it.description || "").toLowerCase().includes(String(r.service_match).toLowerCase())) return false;
          return true;
        });
        if (matches.length) {
          matches.sort((a: any, b: any) => {
            const aScore = (a.service_match ? 4 : 0) + (a.service_category ? 2 : 0) + (a.invoice_type ? 1 : 0);
            const bScore = (b.service_match ? 4 : 0) + (b.service_category ? 2 : 0) + (b.invoice_type ? 1 : 0);
            return bScore - aScore;
          });
          return matches[0];
        }
        const visit = list.find((r: any) => r.scope === "visit" && (!r.invoice_type || r.invoice_type === inv?.invoice_type));
        return visit ?? null;
      };

      items.forEach((it: any) => {
        const doctorId = getDoctor(it);
        if (!doctorId) return;
        const amt = realizedAmount(it);
        if (!byDoctor[doctorId]) byDoctor[doctorId] = { revenue: 0, commission: 0, salary: 0 };
        byDoctor[doctorId].revenue += amt;
        const rule = pickRule(doctorId, it);
        if (!rule) return;
        if (rule.calc_type === "fixed") {
          byDoctor[doctorId].commission += Number(rule.value || 0) * Math.max(1, Number(it.quantity || 1));
        } else {
          byDoctor[doctorId].commission += amt * (Number(rule.value || 0) / 100);
        }
      });

      expenses.forEach((e: any) => {
        if (!e.doctor_id) return;
        if (!byDoctor[e.doctor_id]) byDoctor[e.doctor_id] = { revenue: 0, commission: 0, salary: 0 };
        byDoctor[e.doctor_id].salary += Number(e.amount || 0);
      });

      const rows = (doctors ?? []).map((d: any) => ({
        doctor_id: d.id,
        doctor: d.full_name,
        revenue: byDoctor[d.id]?.revenue ?? 0,
        commission: byDoctor[d.id]?.commission ?? 0,
        salary: byDoctor[d.id]?.salary ?? 0,
      }));
      return rows;
    },
    enabled: !!rules && !!doctors,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <Button onClick={() => setOpenRule(true)}><Plus className="h-4 w-4" /> Add rule</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Salary/Expense</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No data</TableCell></TableRow>}
              {(report ?? []).map((r: any) => (
                <TableRow key={r.doctor_id}>
                  <TableCell>{r.doctor}</TableCell>
                  <TableCell className="text-right">{money} {Number(r.revenue).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{money} {Number(r.commission).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{money} {Number(r.salary).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Commission rules</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Invoice type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Calc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No rules</TableCell></TableRow>}
              {(rules ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.doctors?.full_name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.scope}</TableCell>
                  <TableCell>{r.invoice_type ?? "All"}</TableCell>
                  <TableCell>{r.service_category ?? "All"}</TableCell>
                  <TableCell>{r.service_match ?? "—"}</TableCell>
                  <TableCell>{r.calc_type === "fixed" ? `${money} ${Number(r.value).toFixed(2)} / unit` : `${Number(r.value).toFixed(2)}%`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RuleDialog
        open={openRule}
        onOpenChange={setOpenRule}
        doctors={doctors ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["doctor-commission-rules"] });
          qc.invalidateQueries({ queryKey: ["commission-report"] });
          qc.invalidateQueries({ queryKey: ["finance-dash"] });
        }}
      />
    </div>
  );
}

function LocalCommissionsPanel({
  money,
  local,
  updateLocal,
  expensesEnabled,
}: {
  money: string;
  local: LocalFinanceState;
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
  expensesEnabled: boolean;
}) {
  const [openRule, setOpenRule] = useState(false);
  const [range, setRange] = useState<DateRange>("month");
  const start = rangeStart(range);

  const { data: doctors } = useQuery({
    queryKey: ["doctors-min-commission-local"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name")).data ?? [],
  });

  const { data: report } = useQuery({
    queryKey: ["commission-report-local", range, `${local.commission_rules.length}-${local.expenses.length}`],
    queryFn: async () => {
      const since = start ? start.toISOString() : "1970-01-01T00:00:00.000Z";
      const [itemsRes, expRes] = await Promise.all([
        supabase
          .from("invoice_items")
          .select("id, description, category, quantity, unit_price, doctor_id, invoice_id, invoices(id, doctor_id, invoice_type, total, paid_amount, created_at)")
          .gte("created_at", since),
        expensesEnabled
          ? supabase
              .from("expenses")
              .select("amount, doctor_id, incurred_on")
              .gte("incurred_on", start ? start.toISOString().slice(0, 10) : "1970-01-01")
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (expRes.error) throw expRes.error;
      const items = itemsRes.data ?? [];
      const expenses = expensesEnabled ? (expRes.data ?? []) : [];

      const byDoctor: Record<string, { revenue: number; commission: number; salary: number }> = {};
      const activeRules = (local.commission_rules ?? []).filter((r) => r.active);

      const getDoctor = (it: any) => it.doctor_id || it.invoices?.doctor_id;
      const realizedAmount = (it: any) => {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unit_price || 0);
        const amount = qty * unit;
        const inv = it.invoices;
        const total = Number(inv?.total || 0);
        const paid = Number(inv?.paid_amount || 0);
        const ratio = total > 0 ? Math.min(1, paid / total) : 0;
        return amount * ratio;
      };

      const pickRule = (doctorId: string, it: any) => {
        const inv = it.invoices;
        const list = activeRules.filter((r) => r.doctor_id === doctorId);
        const service = list.filter((r) => r.scope === "service");
        const matches = service.filter((r) => {
          if (r.invoice_type && inv?.invoice_type && r.invoice_type !== inv.invoice_type) return false;
          if (r.service_category && r.service_category !== it.category) return false;
          if (r.service_match && !String(it.description || "").toLowerCase().includes(String(r.service_match).toLowerCase())) return false;
          return true;
        });
        if (matches.length) {
          matches.sort((a, b) => {
            const aScore = (a.service_match ? 4 : 0) + (a.service_category ? 2 : 0) + (a.invoice_type ? 1 : 0);
            const bScore = (b.service_match ? 4 : 0) + (b.service_category ? 2 : 0) + (b.invoice_type ? 1 : 0);
            return bScore - aScore;
          });
          return matches[0];
        }
        const visit = list.find((r) => r.scope === "visit" && (!r.invoice_type || r.invoice_type === inv?.invoice_type));
        return visit ?? null;
      };

      items.forEach((it: any) => {
        const doctorId = getDoctor(it);
        if (!doctorId) return;
        const amt = realizedAmount(it);
        if (!byDoctor[doctorId]) byDoctor[doctorId] = { revenue: 0, commission: 0, salary: 0 };
        byDoctor[doctorId].revenue += amt;
        const rule = pickRule(doctorId, it);
        if (!rule) return;
        if (rule.calc_type === "fixed") {
          byDoctor[doctorId].commission += Number(rule.value || 0) * Math.max(1, Number(it.quantity || 1));
        } else {
          byDoctor[doctorId].commission += amt * (Number(rule.value || 0) / 100);
        }
      });

      const salarySrc = expensesEnabled ? expenses : local.expenses;
      salarySrc.forEach((e: any) => {
        if (!e.doctor_id) return;
        if (!byDoctor[e.doctor_id]) byDoctor[e.doctor_id] = { revenue: 0, commission: 0, salary: 0 };
        byDoctor[e.doctor_id].salary += Number(e.amount || 0);
      });

      const rows = (doctors ?? []).map((d: any) => ({
        doctor_id: d.id,
        doctor: d.full_name,
        revenue: byDoctor[d.id]?.revenue ?? 0,
        commission: byDoctor[d.id]?.commission ?? 0,
        salary: byDoctor[d.id]?.salary ?? 0,
      }));
      return rows;
    },
    enabled: !!doctors,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <Button onClick={() => setOpenRule(true)}><Plus className="h-4 w-4" /> Add rule</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Salary/Expense</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No data</TableCell></TableRow>}
              {(report ?? []).map((r: any) => (
                <TableRow key={r.doctor_id}>
                  <TableCell>{r.doctor}</TableCell>
                  <TableCell className="text-right">{money} {Number(r.revenue).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{money} {Number(r.commission).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{money} {Number(r.salary).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Commission rules</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Invoice type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Calc</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(local.commission_rules ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No rules</TableCell></TableRow>}
              {(local.commission_rules ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{doctors?.find((d: any) => d.id === r.doctor_id)?.full_name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.scope}</TableCell>
                  <TableCell>{r.invoice_type ?? "All"}</TableCell>
                  <TableCell>{r.service_category ?? "All"}</TableCell>
                  <TableCell>{r.service_match ?? "—"}</TableCell>
                  <TableCell>{r.calc_type === "fixed" ? `${money} ${Number(r.value).toFixed(2)} / unit` : `${Number(r.value).toFixed(2)}%`}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => updateLocal((draft) => { draft.commission_rules = (draft.commission_rules ?? []).filter((x) => x.id !== r.id); })}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LocalRuleDialog
        open={openRule}
        onOpenChange={setOpenRule}
        doctors={doctors ?? []}
        money={money}
        updateLocal={updateLocal}
      />
    </div>
  );
}

function LocalRuleDialog({
  open,
  onOpenChange,
  doctors,
  money,
  updateLocal,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doctors: any[];
  money: string;
  updateLocal: (recipe: (draft: LocalFinanceState) => void) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    doctor_id: "",
    scope: "service",
    invoice_type: "",
    service_category: "",
    service_match: "",
    calc_type: "percent",
    value: "",
  });

  const save = () => {
    if (!form.doctor_id) return toast.error("Doctor required");
    const val = Number(form.value) || 0;
    if (val <= 0) return toast.error("Value required");
    setBusy(true);
    updateLocal((draft) => {
      const rule: LocalCommissionRule = {
        id: newLocalId(),
        doctor_id: form.doctor_id,
        scope: form.scope,
        invoice_type: form.invoice_type || null,
        service_category: form.service_category || null,
        service_match: form.service_match || null,
        calc_type: form.calc_type,
        value: val,
        active: true,
      };
      draft.commission_rules = [rule, ...(draft.commission_rules ?? [])];
    });
    setBusy(false);
    toast.success("Rule added");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add commission rule</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Doctor *" className="sm:col-span-2">
            <SearchSelect
              value={form.doctor_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, doctor_id: v }))}
              placeholder="Select doctor"
              options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
            />
          </Field>
          <Field label="Scope">
            <Select value={form.scope} onValueChange={(v) => setForm((s: any) => ({ ...s, scope: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["service", "visit"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Invoice type">
            <Input value={form.invoice_type} onChange={(e) => setForm((s: any) => ({ ...s, invoice_type: e.target.value }))} placeholder="OPD / LAB (optional)" />
          </Field>
          <Field label="Service category">
            <Input value={form.service_category} onChange={(e) => setForm((s: any) => ({ ...s, service_category: e.target.value }))} placeholder="OPD / LAB (optional)" />
          </Field>
          <Field label="Service match">
            <Input value={form.service_match} onChange={(e) => setForm((s: any) => ({ ...s, service_match: e.target.value }))} placeholder="Text contains (optional)" />
          </Field>
          <Field label="Calc">
            <Select value={form.calc_type} onValueChange={(v) => setForm((s: any) => ({ ...s, calc_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Value">
            <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm((s: any) => ({ ...s, value: e.target.value }))} placeholder={form.calc_type === "fixed" ? `${money} per unit` : "Percent"} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  open,
  onOpenChange,
  doctors,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doctors: any[];
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    doctor_id: "",
    scope: "service",
    invoice_type: "",
    service_category: "",
    service_match: "",
    calc_type: "percent",
    value: "",
  });

  const save = async () => {
    if (!form.doctor_id) return toast.error("Doctor required");
    const val = Number(form.value) || 0;
    setBusy(true);
    const { error } = await supabase.from("doctor_commission_rules").insert({
      doctor_id: form.doctor_id,
      scope: form.scope,
      invoice_type: form.invoice_type || null,
      service_category: form.service_category || null,
      service_match: form.service_match || null,
      calc_type: form.calc_type,
      value: val,
      active: true,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Rule added");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add commission rule</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Doctor *" className="sm:col-span-2">
            <SearchSelect
              value={form.doctor_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, doctor_id: v }))}
              placeholder="Select doctor"
              options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
            />
          </Field>
          <Field label="Scope">
            <Select value={form.scope} onValueChange={(v) => setForm((s: any) => ({ ...s, scope: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["service", "visit"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Invoice type">
            <Input value={form.invoice_type} onChange={(e) => setForm((s: any) => ({ ...s, invoice_type: e.target.value }))} placeholder="OPD / LAB (optional)" />
          </Field>
          <Field label="Service category">
            <Input value={form.service_category} onChange={(e) => setForm((s: any) => ({ ...s, service_category: e.target.value }))} placeholder="OPD / LAB (optional)" />
          </Field>
          <Field label="Service match">
            <Input value={form.service_match} onChange={(e) => setForm((s: any) => ({ ...s, service_match: e.target.value }))} placeholder="Text contains (optional)" />
          </Field>
          <Field label="Calc">
            <Select value={form.calc_type} onValueChange={(v) => setForm((s: any) => ({ ...s, calc_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Value">
            <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm((s: any) => ({ ...s, value: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportsPanel({
  money,
  paymentsEnabled,
  expensesEnabled,
  local,
  localSig,
}: {
  money: string;
  paymentsEnabled: boolean;
  expensesEnabled: boolean;
  local: LocalFinanceState;
  localSig: string;
}) {
  const [mode, setMode] = useState<"daily" | "monthly" | "yearly" | "custom">("monthly");
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [duesQ, setDuesQ] = useState("");
  const [serviceQ, setServiceQ] = useState("");

  const computed = useMemo(() => {
    const d = new Date();
    if (mode === "daily") {
      const f = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
    }
    if (mode === "monthly") {
      const f = new Date(d.getFullYear(), d.getMonth(), 1);
      const t = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
    }
    if (mode === "yearly") {
      const f = new Date(d.getFullYear(), 0, 1);
      const t = new Date(d.getFullYear() + 1, 0, 1);
      return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
    }
    return { from, to };
  }, [mode, from, to]);

  const { data } = useQuery({
    queryKey: ["finance-reports", computed.from, computed.to, paymentsEnabled ? "p1" : "p0", expensesEnabled ? "e1" : "e0", localSig],
    queryFn: async () => {
      const [pay, exp, inv, items] = await Promise.all([
        paymentsEnabled
          ? supabase
              .from("invoice_payments")
              .select("amount, paid_at, patient_id, invoice_id")
              .gte("paid_at", computed.from)
              .lt("paid_at", computed.to)
          : Promise.resolve({ data: (local.payments ?? []).filter((p) => String(p.paid_at) >= computed.from && String(p.paid_at) < computed.to), error: null } as any),
        expensesEnabled
          ? supabase
              .from("expenses")
              .select("amount, incurred_on, category_id")
              .gte("incurred_on", computed.from)
              .lt("incurred_on", computed.to)
          : Promise.resolve({ data: (local.expenses ?? []).filter((e) => String(e.incurred_on) >= computed.from && String(e.incurred_on) < computed.to), error: null } as any),
        supabase
          .from("invoices")
          .select("id, invoice_number, patient_id, total, paid_amount")
          .gte("created_at", computed.from)
          .lt("created_at", computed.to),
        supabase
          .from("invoice_items")
          .select("id, description, category, quantity, unit_price, invoices(total, paid_amount)")
          .gte("created_at", computed.from)
          .lt("created_at", computed.to),
      ]);
      if (pay.error) throw pay.error;
      if (exp.error) throw exp.error;
      if (inv.error) throw inv.error;
      if (items.error) throw items.error;

      const revenue = (pay.data ?? []).reduce((s, p) => s + Number((p as any).amount || 0), 0);
      const fallbackRevenue = revenue > 0 ? 0 : (inv.data ?? []).reduce((s, i) => s + Number((i as any).paid_amount || 0), 0);
      const expenseTotal = (exp.data ?? []).reduce((s, e) => s + Number((e as any).amount || 0), 0);

      const outstanding = (await supabase
        .from("invoices")
        .select("invoice_number, patient_id, total, paid_amount, patients(full_name)")
        .gt("total", 0)
        .order("created_at", { ascending: false })).data ?? [];

      const dues = outstanding
        .map((i: any) => ({ ...i, due: Math.max(0, Number(i.total) - Number(i.paid_amount)) }))
        .filter((i: any) => i.due > 0);

      const serviceRevenue: Record<string, number> = {};
      (items.data ?? []).forEach((it: any) => {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unit_price || 0);
        const amt = qty * unit;
        const inv = it.invoices;
        const total = Number(inv?.total || 0);
        const paid = Number(inv?.paid_amount || 0);
        const ratio = total > 0 ? Math.min(1, paid / total) : 0;
        const realized = amt * ratio;
        const key = `${it.category || "Other"} · ${it.description}`;
        serviceRevenue[key] = (serviceRevenue[key] ?? 0) + realized;
      });
      const serviceRows = Object.entries(serviceRevenue)
        .map(([k, v]) => ({ key: k, value: v }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 30);

      return { revenue: revenue + fallbackRevenue, expenseTotal, profit: (revenue + fallbackRevenue) - expenseTotal, dues, serviceRows };
    },
  });

  const periodTo = useMemo(() => {
    const end = new Date(computed.to);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return end.toISOString().slice(0, 10);
  }, [computed.to]);

  const duesFiltered = useMemo(() => {
    const list = data?.dues ?? [];
    const q = duesQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d: any) => {
      const inv = String(d.invoice_number ?? "").toLowerCase();
      const pat = String(d.patients?.full_name ?? "").toLowerCase();
      return inv.includes(q) || pat.includes(q);
    });
  }, [data?.dues, duesQ]);

  const servicesFiltered = useMemo(() => {
    const list = data?.serviceRows ?? [];
    const q = serviceQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r: any) => String(r.key ?? "").toLowerCase().includes(q));
  }, [data?.serviceRows, serviceQ]);

  const exportExcel = () => {
    const dues = (data?.dues ?? []).map((d: any) => ({
      invoice: d.invoice_number,
      patient: d.patients?.full_name ?? "",
      due: Number(d.due ?? 0),
    }));
    const services = (data?.serviceRows ?? []).map((r: any) => ({ service: r.key, revenue: Number(r.value ?? 0) }));
    if (dues.length === 0 && services.length === 0) return toast.error("No data to export");
    const wb = XLSX.utils.book_new();
    if (dues.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dues), "Outstanding");
    if (services.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(services), "Services");
    XLSX.writeFile(wb, `finance_report_${computed.from}_to_${periodTo}.xlsx`);
    toast.success("Excel downloaded");
  };

  const exportPDF = () => {
    const settings = loadSettings();
    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(16);
    doc.text(settings.clinic_name || "KPC-MS", 14, 16);
    doc.setFontSize(10);
    doc.text(`Finance report · ${computed.from} to ${periodTo}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Revenue: ${money} ${Number(data?.revenue ?? 0).toFixed(2)}`, 14, 32);
    doc.text(`Expenses: ${money} ${Number(data?.expenseTotal ?? 0).toFixed(2)}`, 14, 38);
    doc.text(`Profit: ${money} ${Number(data?.profit ?? 0).toFixed(2)}`, 14, 44);

    const dues = (data?.dues ?? []).slice(0, 30).map((d: any) => [
      d.invoice_number,
      d.patients?.full_name ?? "—",
      `${money} ${Number(d.due ?? 0).toFixed(2)}`,
    ]);
    autoTable(doc, {
      startY: 52,
      head: [["Invoice", "Patient", "Due"]],
      body: dues.length ? dues : [["—", "—", "—"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    const nextY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : 130;
    const services = (data?.serviceRows ?? []).slice(0, 20).map((r: any) => [
      r.key,
      `${money} ${Number(r.value ?? 0).toFixed(2)}`,
    ]);
    autoTable(doc, {
      startY: nextY,
      head: [["Service", "Revenue"]],
      body: services.length ? services : [["—", "—"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`finance_report_${computed.from}_to_${periodTo}.pdf`);
    toast.success("PDF downloaded");
  };

  const overviewBars = useMemo(
    () => [
      { name: "Revenue", value: Number(data?.revenue ?? 0) },
      { name: "Expenses", value: Number(data?.expenseTotal ?? 0) },
      { name: "Profit", value: Number(data?.profit ?? 0) },
    ],
    [data?.expenseTotal, data?.profit, data?.revenue],
  );

  const pieData = useMemo(() => {
    const revenue = Number(data?.revenue ?? 0);
    const expenses = Math.max(0, Number(data?.expenseTotal ?? 0));
    const profit = Math.max(0, revenue - expenses);
    const parts = [
      { name: "Expenses", value: expenses },
      { name: "Profit", value: profit },
    ].filter((p) => p.value > 0);
    return parts.length ? parts : [{ name: "Revenue", value: revenue }];
  }, [data?.expenseTotal, data?.revenue]);

  const topServices = useMemo(() => {
    const list = (data?.serviceRows ?? []).slice(0, 10).map((r: any) => ({
      name: String(r.key || "").length > 28 ? `${String(r.key || "").slice(0, 25)}…` : String(r.key || ""),
      value: Number(r.value ?? 0),
    }));
    return list;
  }, [data?.serviceRows]);

  const PIE_COLORS = ["oklch(0.58 0.12 205)", "oklch(0.65 0.15 160)", "oklch(0.70 0.18 50)", "oklch(0.6 0.22 25)", "oklch(0.55 0.15 290)"];

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-gradient-to-br from-primary/10 via-background to-transparent">
        <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-sm font-medium">Finance reports</div>
            <div className="text-xs text-muted-foreground">{computed.from} to {periodTo}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exportExcel} disabled={!data}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={exportPDF} disabled={!data}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {mode === "custom" && (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Revenue" value={`${money} ${(data?.revenue ?? 0).toFixed(2)}`} />
        <Metric title="Expenses" value={`${money} ${(data?.expenseTotal ?? 0).toFixed(2)}`} />
        <Metric title="Profit" value={`${money} ${(data?.profit ?? 0).toFixed(2)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Overview</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground mb-2">Revenue vs Expenses</div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overviewBars}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={36} />
                    <Tooltip />
                    <Bar dataKey="value" fill="oklch(0.58 0.12 205)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground mb-2">Allocation</div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {pieData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top services</CardTitle></CardHeader>
          <CardContent>
            {topServices.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topServices} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="oklch(0.65 0.15 160)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">Outstanding dues</CardTitle>
          <div className="text-xs text-muted-foreground">{duesFiltered.length} invoice(s)</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search invoice or patient…" value={duesQ} onChange={(e) => setDuesQ(e.target.value)} />
          </div>
          <div className="p-0 overflow-auto max-h-[45vh] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duesFiltered.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No outstanding dues</TableCell></TableRow>}
                {duesFiltered.slice(0, 50).map((d: any) => (
                  <TableRow key={d.invoice_number} className="hover:bg-muted/30">
                    <TableCell>{d.invoice_number}</TableCell>
                    <TableCell>{d.patients?.full_name ?? "—"}</TableCell>
                    <TableCell className="text-right">{money} {Number(d.due).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">Service-wise revenue</CardTitle>
          <div className="text-xs text-muted-foreground">{servicesFiltered.length} item(s)</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search service…" value={serviceQ} onChange={(e) => setServiceQ(e.target.value)} />
          </div>
          <div className="p-0 overflow-auto max-h-[45vh] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicesFiltered.length === 0 && <TableRow><TableCell colSpan={2} className="text-muted-foreground">No data</TableCell></TableRow>}
                {servicesFiltered.slice(0, 80).map((r: any) => (
                  <TableRow key={r.key} className="hover:bg-muted/30">
                    <TableCell>{r.key}</TableCell>
                    <TableCell className="text-right">{money} {Number(r.value).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label className="text-xs">{label}</Label>{children}</div>;
}
