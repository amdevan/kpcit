import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Receipt, Trash2, Pencil, Printer } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Item = { description: string; quantity: number; unit_price: number; category: string; doctor_id?: string | null };

const CATEGORIES = ["OPD", "LAB", "Pharmacy", "Procedure", "Imaging", "Other"];

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "Invoices — MediClinic" }] }),
  component: () => <AppShell><InvoicesPage /></AppShell>,
});

function InvoicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices").select("*, patients(full_name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const printInvoice = async (inv: any) => {
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id);
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text("MediClinic", 14, 18);
    doc.setFontSize(10); doc.text(`Invoice · ${inv.invoice_type ?? "OPD"}`, 14, 25);
    doc.setFontSize(11);
    doc.text(`Invoice #: ${inv.invoice_number}`, 14, 36);
    doc.text(`Patient: ${inv.patients?.full_name ?? "—"}`, 14, 42);
    doc.text(`Date: ${new Date(inv.created_at).toLocaleDateString()}`, 14, 48);
    if (inv.due_date) doc.text(`Due: ${inv.due_date}`, 14, 54);
    doc.text(`Status: ${inv.status}`, 140, 36);
    autoTable(doc, {
      startY: 62,
      head: [["Category", "Description", "Qty", "Unit (Rs)", "Amount (Rs)"]],
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
    if (Number(inv.discount) > 0) doc.text(`Discount: Rs ${Number(inv.discount).toFixed(2)}`, 140, endY - 6);
    if (Number(inv.tax) > 0) doc.text(`Tax: Rs ${Number(inv.tax).toFixed(2)}`, 140, endY);
    doc.text(`Total: Rs ${Number(inv.total).toFixed(2)}`, 140, endY + 6);
    doc.text(`Paid:  Rs ${Number(inv.paid_amount).toFixed(2)}`, 140, endY + 12);
    doc.text(`Due:   Rs ${(Number(inv.total) - Number(inv.paid_amount)).toFixed(2)}`, 140, endY + 18);
    if (inv.notes) { doc.setFontSize(9); doc.text(`Notes: ${inv.notes}`, 14, endY + 30); }
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">Billing and payment tracking.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New invoice
        </Button>
      </div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((i: any) => (
                  <li key={i.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        <span>{i.invoice_number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wide">{i.invoice_type ?? "OPD"}</span>
                        <span className="text-muted-foreground">· {i.patients?.full_name ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {i.due_date ? `Due ${i.due_date}` : "No due date"} · Paid Rs {Number(i.paid_amount).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">Rs {Number(i.total).toFixed(2)}</div>
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
  const empty = {
    patient_id: "", invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    status: "unpaid", paid_amount: 0, due_date: "", notes: "",
    invoice_type: "OPD", doctor_id: "", discount: 0, tax: 0,
  };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, unit_price: 0, category: "OPD", doctor_id: "" }]);
  const [busy, setBusy] = useState(false);

  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors-min"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name, consultation_fee").order("full_name")).data ?? [],
  });

  const subtotal = useMemo(() => items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0), [items]);
  const total = useMemo(() => Math.max(0, subtotal - Number(form.discount || 0) + Number(form.tax || 0)), [subtotal, form.discount, form.tax]);

  useEffect(() => {
    if (!open) return;
    setForm(initial ?? empty);
    if (initial?.id) {
      supabase.from("invoice_items").select("*").eq("invoice_id", initial.id).then(({ data }) => {
        setItems(data && data.length ? data.map((d: any) => ({
          description: d.description, quantity: Number(d.quantity), unit_price: Number(d.unit_price),
          category: d.category ?? "OPD", doctor_id: d.doctor_id ?? "",
        })) : [{ description: "", quantity: 1, unit_price: 0, category: "OPD", doctor_id: "" }]);
      });
    } else {
      setItems([{ description: "", quantity: 1, unit_price: 0, category: "OPD", doctor_id: "" }]);
    }
    /* eslint-disable-next-line */
  }, [open, initial]);

  const save = async () => {
    if (!form.patient_id) return toast.error("Patient required");
    setBusy(true);
    const payload: any = {
      patient_id: form.patient_id,
      invoice_number: form.invoice_number,
      status: form.status,
      total,
      paid_amount: Number(form.paid_amount) || 0,
      due_date: form.due_date || null,
      notes: form.notes || null,
      invoice_type: form.invoice_type || "OPD",
      doctor_id: form.doctor_id || null,
      discount: Number(form.discount) || 0,
      tax: Number(form.tax) || 0,
    };
    let invoiceId = form.id;
    if (invoiceId) {
      const { error } = await supabase.from("invoices").update(payload).eq("id", invoiceId);
      if (error) { setBusy(false); return toast.error(error.message); }
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
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
          doctor_id: i.doctor_id || null,
        }))
      );
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    setBusy(false);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit invoice" : "New invoice"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice #"><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={form.invoice_type ?? "OPD"} onValueChange={(v) => setForm({ ...form, invoice_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Patient *">
            <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
              <SelectContent>{patients?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Doctor">
            <Select value={form.doctor_id ?? ""} onValueChange={(v) => setForm({ ...form, doctor_id: v })}>
              <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>{doctors?.map((d: any) => <SelectItem key={d.id} value={d.id}>Dr. {d.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["unpaid", "partial", "paid", "overdue", "cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Due date"><Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Paid amount"><Input type="number" step="0.01" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} /></Field>
          <Field label="Discount (Rs)"><Input type="number" step="0.01" value={form.discount ?? 0} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
          <Field label="Tax (Rs)"><Input type="number" step="0.01" value={form.tax ?? 0} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></Field>
        </div>

        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Line items</Label>
            <Button size="sm" variant="outline" onClick={() => setItems([...items, { description: "", quantity: 1, unit_price: 0, category: form.invoice_type || "OPD", doctor_id: "" }])}>
              <Plus className="h-3 w-3" /> Add line
            </Button>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <Select value={it.category} onValueChange={(v) => { const next = [...items]; next[idx].category = v; setItems(next); }}>
                <SelectTrigger className="col-span-2 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-4" placeholder="Description" value={it.description}
                onChange={(e) => { const next = [...items]; next[idx].description = e.target.value; setItems(next); }} />
              <Input className="col-span-1" type="number" placeholder="Qty" value={it.quantity}
                onChange={(e) => { const next = [...items]; next[idx].quantity = Number(e.target.value) || 0; setItems(next); }} />
              <Input className="col-span-2" type="number" step="0.01" placeholder="Unit" value={it.unit_price}
                onChange={(e) => { const next = [...items]; next[idx].unit_price = Number(e.target.value) || 0; setItems(next); }} />
              <Select value={it.doctor_id ?? ""} onValueChange={(v) => { const next = [...items]; next[idx].doctor_id = v; setItems(next); }}>
                <SelectTrigger className="col-span-2 h-9"><SelectValue placeholder="Doctor" /></SelectTrigger>
                <SelectContent>{doctors?.map((d: any) => <SelectItem key={d.id} value={d.id}>Dr. {d.full_name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="pt-2 text-right text-sm space-y-0.5">
            <div>Subtotal: <span className="font-medium">Rs {subtotal.toFixed(2)}</span></div>
            {Number(form.discount) > 0 && <div className="text-emerald-600">− Discount Rs {Number(form.discount).toFixed(2)}</div>}
            {Number(form.tax) > 0 && <div>+ Tax Rs {Number(form.tax).toFixed(2)}</div>}
            <div className="font-semibold text-base">Total: Rs {total.toFixed(2)}</div>
          </div>
        </div>

        <Field label="Notes"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

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