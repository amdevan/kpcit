import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Package, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — MediClinic" }] }),
  component: () => <AppShell><InventoryPage /></AppShell>,
});

function InventoryPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();

  const { data, isLoading } = useQuery({
    queryKey: ["inventory", q],
    queryFn: async () => {
      let query = supabase.from("inventory_items").select("*").order("name");
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">Medicines and supplies stock.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New item
        </Button>
      </div>
      <Input placeholder="Search items…" className="max-w-md" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No items yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((it: any) => {
                  const low = Number(it.quantity) <= Number(it.reorder_level);
                  return (
                    <li key={it.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {it.name}
                          {low && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[it.category, it.sku, it.supplier].filter(Boolean).join(" · ") || "—"}
                          {it.expiry_date ? ` · exp ${it.expiry_date}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={"font-semibold " + (low ? "text-amber-600" : "")}>{Number(it.quantity)} {it.unit}</div>
                        <div className="text-[11px] text-muted-foreground">reorder ≤ {Number(it.reorder_level)}</div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(it.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
        </CardContent>
      </Card>
      <ItemDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["inventory"] })} />
    </div>
  );
}

function ItemDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void;
}) {
  const empty = {
    name: "", category: "", sku: "", unit: "unit",
    quantity: 0, reorder_level: 0, unit_cost: 0,
    expiry_date: "", supplier: "", notes: "",
  };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    const { id, ...rest } = form;
    const payload = {
      ...rest,
      quantity: Number(rest.quantity) || 0,
      reorder_level: Number(rest.reorder_level) || 0,
      unit_cost: Number(rest.unit_cost) || 0,
      expiry_date: rest.expiry_date || null,
    };
    const { error } = id
      ? await supabase.from("inventory_items").update(payload).eq("id", id)
      : await supabase.from("inventory_items").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setForm(initial ?? empty); onOpenChange(v); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit item" : "New item"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category"><Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Antibiotic" /></Field>
          <Field label="SKU"><Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="Unit"><Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="box, tablet…" /></Field>
          <Field label="Quantity"><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
          <Field label="Reorder level"><Input type="number" step="0.01" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></Field>
          <Field label="Unit cost"><Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></Field>
          <Field label="Expiry date"><Input type="date" value={form.expiry_date ?? ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
          <Field label="Supplier" className="sm:col-span-2"><Input value={form.supplier ?? ""} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
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