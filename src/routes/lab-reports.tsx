import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, FlaskConical, Trash2, Pencil } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DateRangeFilter, type DateRange, rangeStart } from "@/components/app/DateRangeFilter";
import { SearchSelect } from "@/components/app/SearchSelect";

export const Route = createFileRoute("/lab-reports")({
  head: () => ({ meta: [{ title: "Lab Reports — KPC-MS" }] }),
  component: () => <AppShell><LabsPage /></AppShell>,
});

function LabsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [range, setRange] = useState<DateRange>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["lab-reports", range],
    queryFn: async () => {
      let q = supabase.from("lab_reports").select("*, patients(full_name)").order("ordered_date", { ascending: false });
      const start = rangeStart(range);
      if (start) q = q.gte("ordered_date", start.toISOString().slice(0, 10));
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this report?")) return;
    const { error } = await supabase.from("lab_reports").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["lab-reports"] });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lab Reports</h1>
          <p className="text-sm text-muted-foreground">Diagnostic tests and results.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New report
        </Button>
      </div>
      <div className="flex justify-end"><DateRangeFilter value={range} onChange={setRange} /></div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <FlaskConical className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No lab reports yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((r: any) => (
                  <li key={r.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.test_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.patients?.full_name ?? "—"} · ordered {r.ordered_date}{r.result_date ? ` · result ${r.result_date}` : ""}
                      </div>
                    </div>
                    <span className={"text-[11px] px-2 py-0.5 rounded-full capitalize " + statusClass(r.status)}>{r.status}</span>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>
      <LabDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["lab-reports"] })} />
    </div>
  );
}

function statusClass(s: string) {
  if (s === "completed") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (s === "cancelled") return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
  if (s === "in-progress") return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
  return "bg-secondary text-secondary-foreground";
}

function LabDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void;
}) {
  const empty = {
    patient_id: "", test_name: "", ordered_date: new Date().toISOString().slice(0, 10),
    result_date: "", status: "pending", results: "", file_url: "", notes: "",
  };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setForm(initial ?? empty); /* eslint-disable-next-line */ }, [open, initial]);

  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });

  const save = async () => {
    if (!form.patient_id) return toast.error("Patient required");
    if (!form.test_name.trim()) return toast.error("Test name required");
    setBusy(true);
    const { id, patients: _p, ...rest } = form;
    const payload = { ...rest, result_date: rest.result_date || null };
    const { error } = id
      ? await supabase.from("lab_reports").update(payload).eq("id", id)
      : await supabase.from("lab_reports").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit lab report" : "New lab report"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Patient *" className="sm:col-span-2">
            <SearchSelect
              value={form.patient_id}
              onValueChange={(v) => setForm({ ...form, patient_id: v })}
              placeholder="Select patient"
              options={(patients ?? []).map((p: any) => ({ value: p.id, label: p.full_name }))}
            />
          </Field>
          <Field label="Test name *" className="sm:col-span-2">
            <Input value={form.test_name} onChange={(e) => setForm({ ...form, test_name: e.target.value })} />
          </Field>
          <Field label="Ordered date"><Input type="date" value={form.ordered_date} onChange={(e) => setForm({ ...form, ordered_date: e.target.value })} /></Field>
          <Field label="Result date"><Input type="date" value={form.result_date ?? ""} onChange={(e) => setForm({ ...form, result_date: e.target.value })} /></Field>
          <Field label="Status" className="sm:col-span-2">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["pending", "in-progress", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Results" className="sm:col-span-2">
            <Textarea rows={3} value={form.results ?? ""} onChange={(e) => setForm({ ...form, results: e.target.value })} />
          </Field>
          <Field label="File URL" className="sm:col-span-2">
            <Input value={form.file_url ?? ""} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label className="text-xs">{label}</Label>{children}</div>;
}
