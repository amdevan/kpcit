import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, RefreshCw } from "lucide-react";
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

type PaymentMethod = "cash" | "card" | "online";
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "online"];

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

  const { data: dash } = useQuery({
    queryKey: ["finance-dash", range],
    queryFn: async () => {
      const [inv, pay, exp] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, total, paid_amount, status")
          .gte("created_at", start ? start.toISOString() : "1970-01-01T00:00:00.000Z"),
        supabase
          .from("invoice_payments")
          .select("amount, paid_at")
          .gte("paid_at", start ? start.toISOString() : "1970-01-01T00:00:00.000Z"),
        supabase
          .from("expenses")
          .select("amount, incurred_on")
          .gte("incurred_on", start ? start.toISOString().slice(0, 10) : "1970-01-01"),
      ]);
      if (inv.error) throw inv.error;
      if (pay.error) throw pay.error;
      if (exp.error) throw exp.error;
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
          <PaymentsPanel money={money} />
        </TabsContent>

        <TabsContent value="expenses">
          <ExpensesPanel money={money} />
        </TabsContent>

        <TabsContent value="commissions">
          <CommissionsPanel money={money} />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsPanel money={money} />
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
      ["Invoice #", p.invoices?.invoice_number ?? "—"],
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

function ReportsPanel({ money }: { money: string }) {
  const [mode, setMode] = useState<"daily" | "monthly" | "yearly" | "custom">("monthly");
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

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
    queryKey: ["finance-reports", computed.from, computed.to],
    queryFn: async () => {
      const [pay, exp, inv, items] = await Promise.all([
        supabase
          .from("invoice_payments")
          .select("amount, paid_at, patient_id, invoice_id")
          .gte("paid_at", computed.from)
          .lt("paid_at", computed.to),
        supabase
          .from("expenses")
          .select("amount, incurred_on, category_id")
          .gte("incurred_on", computed.from)
          .lt("incurred_on", computed.to),
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

  return (
    <div className="space-y-4">
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

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Revenue" value={`${money} ${(data?.revenue ?? 0).toFixed(2)}`} />
        <Metric title="Expenses" value={`${money} ${(data?.expenseTotal ?? 0).toFixed(2)}`} />
        <Metric title="Profit" value={`${money} ${(data?.profit ?? 0).toFixed(2)}`} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding dues</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.dues ?? []).length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No outstanding dues</TableCell></TableRow>}
              {(data?.dues ?? []).slice(0, 30).map((d: any) => (
                <TableRow key={d.invoice_number}>
                  <TableCell>{d.invoice_number}</TableCell>
                  <TableCell>{d.patients?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{money} {Number(d.due).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Service-wise revenue (Top 30)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.serviceRows ?? []).length === 0 && <TableRow><TableCell colSpan={2} className="text-muted-foreground">No data</TableCell></TableRow>}
              {(data?.serviceRows ?? []).map((r: any) => (
                <TableRow key={r.key}>
                  <TableCell>{r.key}</TableCell>
                  <TableCell className="text-right">{money} {Number(r.value).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label className="text-xs">{label}</Label>{children}</div>;
}

