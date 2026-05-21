import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Receipt, Trash2, Pencil, Printer, RefreshCw, Search } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DateRangeFilter, type DateRange, rangeStart } from "@/components/app/DateRangeFilter";
import { SearchSelect } from "@/components/app/SearchSelect";
import { loadSettings } from "@/routes/settings";

type Item = { description: string; quantity: number; unit_price: number; category: string; service_id?: string };

const CATEGORIES = ["OPD", "LAB", "Pharmacy", "Procedure", "Imaging", "Other"];
type BillingPaymentMethod = "cash" | "fonepay" | "esewa" | "card" | "online";
const BILLING_PAYMENT_METHODS: BillingPaymentMethod[] = ["cash", "fonepay", "esewa", "card", "online"];
const LOCAL_FINANCE_KEY = "kpcms.finance.local.v1";

function loadLocalFinance() {
  if (typeof window === "undefined") return { receipt_last_no: {}, payments: [] as any[] };
  try {
    const raw = localStorage.getItem(LOCAL_FINANCE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { receipt_last_no: parsed.receipt_last_no ?? {}, payments: parsed.payments ?? [] };
  } catch {
    return { receipt_last_no: {}, payments: [] as any[] };
  }
}

function saveLocalFinance(next: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_FINANCE_KEY, JSON.stringify(next));
}

function nextReceiptNoLocal(state: any) {
  const y = String(new Date().getFullYear());
  const n = (state.receipt_last_no?.[y] ?? 0) + 1;
  state.receipt_last_no = state.receipt_last_no ?? {};
  state.receipt_last_no[y] = n;
  return `RCPT-${y}-${String(n).padStart(4, "0")}`;
}

function newLocalId() {
  return (
    (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "Billing — KPC-MS" }] }),
  component: () => <AppShell><InvoicesPage /></AppShell>,
});

function InvoicesPage() {
  const qc = useQueryClient();
  const settings = loadSettings();
  const money = settings.currency === "NPR" ? "Rs" : settings.currency;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | undefined>();
  const [range, setRange] = useState<DateRange>("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", range],
    queryFn: async () => {
      let q = supabase.from("invoices").select("*, patients(full_name)").order("created_at", { ascending: false });
      const start = rangeStart(range);
      if (start) q = q.gte("created_at", start.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((i: any) => {
      const id = String(i.invoice_number ?? "").toLowerCase();
      const pat = String(i.patients?.full_name ?? "").toLowerCase();
      return id.includes(qq) || pat.includes(qq);
    });
  }, [data, q]);

  const remove = async (id: string) => {
    if (!confirm("Delete this bill?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const printInvoice = async (inv: any) => {
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id);
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text(settings.clinic_name || "KPC-MS", 14, 18);
    doc.setFontSize(10); doc.text(`Billing · ${inv.invoice_type ?? "OPD"}`, 14, 25);
    const contact = [settings.clinic_phone, settings.clinic_email].filter(Boolean).join(" · ");
    if (settings.clinic_address || contact) {
      doc.setFontSize(9);
      if (settings.clinic_address) doc.text(settings.clinic_address, 14, 30);
      if (contact) doc.text(contact, 14, settings.clinic_address ? 34 : 30);
    }
    doc.setFontSize(11);
    doc.text(`Billing #: ${inv.invoice_number}`, 14, 36);
    doc.text(`Patient: ${inv.patients?.full_name ?? "—"}`, 14, 42);
    doc.text(`Date: ${new Date(inv.created_at).toLocaleDateString()}`, 14, 48);
    if (inv.due_date) doc.text(`Due: ${inv.due_date}`, 14, 54);
    doc.text(`Status: ${inv.status}`, 140, 36);
    autoTable(doc, {
      startY: 62,
      head: [["Category", "Description", "Qty", `Unit (${money})`, `Amount (${money})`]],
      body: (items ?? []).map((it: any) => [
        it.category ?? "OPD",
        it.description,
        Number(it.quantity),
        Number(it.unit_price).toFixed(2),
        (Number(it.quantity) * Number(it.unit_price)).toFixed(2),
      ]),
      headStyles: { fillColor: [37, 99, 235] },
    });
    const endY = (doc as any).lastAutoTable.finalY + 8;
    if (Number(inv.discount) > 0) doc.text(`Discount: ${money} ${Number(inv.discount).toFixed(2)}`, 140, endY - 6);
    if (Number(inv.tax) > 0) doc.text(`Tax: ${money} ${Number(inv.tax).toFixed(2)}`, 140, endY);
    doc.text(`Total: ${money} ${Number(inv.total).toFixed(2)}`, 140, endY + 6);
    doc.text(`Paid:  ${money} ${Number(inv.paid_amount).toFixed(2)}`, 140, endY + 12);
    doc.text(`Due:   ${money} ${(Number(inv.total) - Number(inv.paid_amount)).toFixed(2)}`, 140, endY + 18);
    if (inv.notes) { doc.setFontSize(9); doc.text(`Notes: ${inv.notes}`, 14, endY + 30); }
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">Create bills and track payments.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New bill
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search billing # / patient…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No bills yet.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No matching bills.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((i: any) => (
                  <li key={i.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        <span>{i.invoice_number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wide">{i.invoice_type ?? "OPD"}</span>
                        <span className="text-muted-foreground">· {i.patients?.full_name ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                      {i.due_date ? `Due ${i.due_date}` : "No due date"} · Paid {money} {Number(i.paid_amount).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                    <div className="font-semibold">{money} {Number(i.total).toFixed(2)}</div>
                      <span className={"text-[11px] px-2 py-0.5 rounded-full capitalize " + statusClass(i.status)}>{i.status}</span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => printInvoice(i)} title="Print">
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(i.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>
      <InvoiceDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["invoices"] })} />
    </div>
  );
}

function statusClass(s: string) {
  if (s === "paid") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (s === "overdue") return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
  if (s === "partial") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-secondary text-secondary-foreground";
}

function InvoiceDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void;
}) {
  const settings = loadSettings();
  const money = settings.currency === "NPR" ? "Rs" : settings.currency;
  const prefix = (settings.invoice_prefix || "INV").trim() || "INV";
  const services = settings.billable_services ?? [];
  const paymentMethods = (settings as any).billing_payment_methods?.length ? (settings as any).billing_payment_methods : BILLING_PAYMENT_METHODS;
  const defaultPaymentMethod: BillingPaymentMethod = (paymentMethods.includes((settings as any).billing_default_payment_method)
    ? (settings as any).billing_default_payment_method
    : paymentMethods[0] ?? "cash") as any;
  const generateBillingNo = (p: string) => {
    const t = Date.now().toString().slice(-6);
    const r = Math.random().toString(16).slice(2, 4).toUpperCase();
    return `${p}-${t}${r}`;
  };
  const buildEmpty = () => {
    const dueDays = Number((settings as any).billing_default_due_days || 0) || 0;
    const due = dueDays > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + dueDays); return d.toISOString().slice(0, 10); })() : "";
    return {
      patient_id: "",
      invoice_number: generateBillingNo(prefix),
      status: "unpaid",
      paid_amount: 0,
      due_date: due,
      notes: "",
      invoice_type: "OPD",
      doctor_id: "",
      discount: Number((settings as any).billing_default_discount || 0) || 0,
      tax: Number((settings as any).billing_default_tax || 0) || 0,
    };
  };
  const [form, setForm] = useState<any>(initial ?? buildEmpty());
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, unit_price: 0, category: "OPD" }]);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<{ received: string; method: BillingPaymentMethod }>({ received: "", method: defaultPaymentMethod });

  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });

  const { data: doctors } = useQuery({
    queryKey: ["doctors-min"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name")).data ?? [],
  });

  const subtotal = useMemo(() => items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0), [items]);
  const total = useMemo(() => Math.max(0, subtotal - Number(form.discount || 0) + Number(form.tax || 0)), [subtotal, form.discount, form.tax]);
  const received = useMemo(() => Number(payment.received) || 0, [payment.received]);
  const currentPaid = useMemo(() => Number(form.paid_amount) || 0, [form.paid_amount]);
  const dueNow = useMemo(() => Math.max(0, total - currentPaid), [total, currentPaid]);
  const appliedNow = useMemo(() => Math.min(received, dueNow), [received, dueNow]);
  const returnAmount = useMemo(() => Math.max(0, received - appliedNow), [received, appliedNow]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const clean = { ...initial };
      delete clean.patients;
      setForm(clean);
    } else setForm(buildEmpty());
    setPayment({ received: "", method: defaultPaymentMethod });
    if (initial?.id) {
      supabase.from("invoice_items").select("*").eq("invoice_id", initial.id).then(({ data }) => {
        setItems(data && data.length ? data.map((d: any) => ({
          description: d.description, quantity: Number(d.quantity), unit_price: Number(d.unit_price),
          category: d.category ?? "OPD", service_id: "",
        })) : [{ description: "", quantity: 1, unit_price: 0, category: "OPD" }]);
      });
    } else {
      setItems([{ description: "", quantity: 1, unit_price: 0, category: "OPD" }]);
    }
  }, [open, initial]);

  const recordPayment = async (invoiceId: string, patientId: string, amount: number) => {
    if (amount <= 0) return;
    const paidAt = new Date().toISOString();
    const notes =
      returnAmount > 0
        ? `Received ${money} ${received.toFixed(2)} · Return ${money} ${returnAmount.toFixed(2)}`
        : null;
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoiceId,
      patient_id: patientId,
      amount,
      method: payment.method,
      paid_at: paidAt,
      notes,
    } as any);
    if (!error) return;
    const msg = String((error as any).message || "").toLowerCase();
    if (!msg.includes("could not find the table")) throw error;

    const local = loadLocalFinance();
    const receipt = nextReceiptNoLocal(local);
    const entry = {
      id: newLocalId(),
      receipt_no: receipt,
      invoice_id: invoiceId,
      patient_id: patientId,
      amount,
      method: payment.method,
      paid_at: paidAt,
      reference: null,
      notes,
    };
    local.payments = [entry, ...(local.payments ?? [])];
    saveLocalFinance(local);

    const sum = (local.payments ?? []).filter((p: any) => p.invoice_id === invoiceId).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const status = total > 0 ? (sum >= total ? "paid" : sum > 0 ? "partial" : "unpaid") : "unpaid";
    await supabase.from("invoices").update({ paid_amount: sum, status } as any).eq("id", invoiceId);
  };

  const save = async () => {
    if (!form.patient_id) return toast.error("Patient required");
    setBusy(true);
    const billNo = String(form.invoice_number || "").trim() || generateBillingNo(prefix);
    const payload: any = {
      patient_id: form.patient_id,
      invoice_number: billNo,
      total,
      due_date: form.due_date || null,
      invoice_type: form.invoice_type || "OPD",
      doctor_id: form.doctor_id || null,
      discount: Number(form.discount) || 0,
      tax: Number(form.tax) || 0,
      notes: form.notes?.trim() || null,
    };
    let invoiceId = form.id;
    if (invoiceId) {
      const { error } = await supabase.from("invoices").update(payload).eq("id", invoiceId);
      if (error) { setBusy(false); return toast.error(error.message); }
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      const recalc = await supabase.rpc("recalc_invoice_payments", { p_invoice_id: invoiceId } as any);
      if (recalc.error && !String(recalc.error.message || "").toLowerCase().includes("could not find the function")) {
        setBusy(false);
        return toast.error(recalc.error.message);
      }
    } else {
      const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
      if (error) { setBusy(false); return toast.error(error.message); }
      invoiceId = data.id;
    }
    const cleanItems = items.filter((i) => i.description.trim());
    if (cleanItems.length) {
      const { error } = await supabase.from("invoice_items").insert(
        cleanItems.map((i) => ({
          invoice_id: invoiceId,
          description: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          category: i.category || "OPD",
          doctor_id: form.doctor_id || null,
        }))
      );
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    try {
      await recordPayment(invoiceId, form.patient_id, appliedNow);
      if (appliedNow > 0) {
        const recalc = await supabase.rpc("recalc_invoice_payments", { p_invoice_id: invoiceId } as any);
        if (recalc.error && !String(recalc.error.message || "").toLowerCase().includes("could not find the function")) {
          setBusy(false);
          return toast.error(recalc.error.message);
        }
      }
    } catch (e: any) {
      setBusy(false);
      return toast.error(e?.message ?? "Payment failed");
    }
    setBusy(false);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit bill" : "New bill"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Billing details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Field label="Billing #" className="sm:col-span-1">
                  <div className="flex gap-2">
                    <Input value={form.invoice_number ?? ""} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setForm({ ...form, invoice_number: generateBillingNo(prefix) })}
                      title="Generate"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>
                <Field label="Type" className="sm:col-span-1">
                  <Select value={form.invoice_type ?? "OPD"} onValueChange={(v) => setForm({ ...form, invoice_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Due date" className="sm:col-span-1">
                  <Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </Field>
                <Field label="Patient *" className="sm:col-span-3">
                  <SearchSelect
                    value={form.patient_id}
                    onValueChange={(v) => setForm({ ...form, patient_id: v })}
                    placeholder="Select patient"
                    options={(patients ?? []).map((p: any) => ({ value: p.id, label: p.full_name }))}
                  />
                </Field>
                <Field label="Doctor" className="sm:col-span-3">
                  <SearchSelect
                    value={form.doctor_id || ""}
                    onValueChange={(v) => setForm({ ...form, doctor_id: v })}
                    placeholder="Optional (used for commission reports)"
                    options={(doctors ?? []).map((d: any) => ({ value: d.id, label: d.full_name }))}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-base">Services</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setItems([...items, { description: "", quantity: 1, unit_price: 0, category: form.invoice_type || "OPD" }])}
                >
                  <Plus className="h-3 w-3" /> Add line
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[11px] text-muted-foreground px-1">
                  <div className="col-span-2">Category</div>
                  <div className="col-span-3">Service</div>
                  <div className="col-span-3">Description</div>
                  <div className="col-span-1">Qty</div>
                  <div className="col-span-2">Unit</div>
                  <div className="col-span-1 text-right"> </div>
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <Select value={it.category} onValueChange={(v) => { const next = [...items]; next[idx].category = v; setItems(next); }}>
                      <SelectTrigger className="col-span-2 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <SearchSelect
                      value={it.service_id ?? ""}
                      onValueChange={(v) => {
                        const next = [...items];
                        next[idx].service_id = v;
                        const svc = services.find((s: any) => s.id === v);
                        if (svc) {
                          next[idx].description = svc.name;
                          next[idx].unit_price = Number(svc.unit_price) || 0;
                          next[idx].category = svc.category || next[idx].category;
                        }
                        setItems(next);
                      }}
                      placeholder="Service"
                      options={services.map((s: any) => ({ value: s.id, label: s.name, keywords: [s.category, String(s.unit_price)].join(" ") }))}
                      className="col-span-3"
                    />
                    <Input
                      className="col-span-3"
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => { const next = [...items]; next[idx].description = e.target.value; setItems(next); }}
                    />
                    <Input
                      className="col-span-1"
                      type="number"
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) => { const next = [...items]; next[idx].quantity = Number(e.target.value) || 0; setItems(next); }}
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      step="0.01"
                      placeholder={`Unit ${money}`}
                      value={it.unit_price}
                      onChange={(e) => { const next = [...items]; next[idx].unit_price = Number(e.target.value) || 0; setItems(next); }}
                    />
                    <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…" />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3">
                  <Field label={`Discount (${money})`}>
                    <Input type="number" step="0.01" value={form.discount ?? 0} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
                  </Field>
                  <Field label={`Tax (${money})`}>
                    <Input type="number" step="0.01" value={form.tax ?? 0} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
                  </Field>
                  <Field label={`Already paid (${money})`}>
                    <Input type="number" step="0.01" value={form.paid_amount} readOnly className="bg-muted/40" />
                  </Field>
                  <Field label="Paid by">
                    <Select value={payment.method} onValueChange={(v) => setPayment((s) => ({ ...s, method: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((m: any) => <SelectItem key={m} value={m}>{String(m).toUpperCase()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={`Paid amount (${money})`}>
                    <Input type="number" step="0.01" value={payment.received} onChange={(e) => setPayment((s) => ({ ...s, received: e.target.value }))} />
                    <div className="text-xs text-muted-foreground mt-1">
                      Applied: {money} {appliedNow.toFixed(2)} · Return: {money} {returnAmount.toFixed(2)}
                    </div>
                  </Field>
                </div>
                <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>{money} {subtotal.toFixed(2)}</span></div>
                  {Number(form.discount) > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>− {money} {Number(form.discount).toFixed(2)}</span></div>}
                  {Number(form.tax) > 0 && <div className="flex justify-between"><span>Tax</span><span>+ {money} {Number(form.tax).toFixed(2)}</span></div>}
                  <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{money} {total.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Balance due</span><span>{money} {dueNow.toFixed(2)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label className="text-xs">{label}</Label>{children}</div>;
}
