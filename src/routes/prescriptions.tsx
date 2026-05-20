import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pill, Trash2, Pencil } from "lucide-react";
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

export const Route = createFileRoute("/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — KPC-MS" }] }),
  component: () => <AppShell><RxPage /></AppShell>,
});

function RxPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [range, setRange] = useState<DateRange>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["prescriptions", range],
    queryFn: async () => {
      let q = supabase
        .from("prescriptions").select("*, patients(full_name), doctors(full_name)")
        .order("prescribed_date", { ascending: false });
      const start = rangeStart(range);
      if (start) q = q.gte("prescribed_date", start.toISOString().slice(0, 10));
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this prescription?")) return;
    const { error } = await supabase.from("prescriptions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["prescriptions"] });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prescriptions</h1>
          <p className="text-sm text-muted-foreground">Track prescribed medications.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New prescription
        </Button>
      </div>
      <div className="flex justify-end"><DateRangeFilter value={range} onChange={setRange} /></div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <Pill className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No prescriptions yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((r: any) => (
                  <li key={r.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                      <Pill className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.medication} <span className="text-xs text-muted-foreground">{r.dosage}</span></div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.patients?.full_name ?? "—"}{r.doctors?.full_name ? ` · Dr. ${r.doctors.full_name}` : ""} · {r.prescribed_date}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground hidden sm:block">{[r.frequency, r.duration].filter(Boolean).join(" · ")}</div>
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
      <RxDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["prescriptions"] })} />
    </div>
  );
}

function RxDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void;
}) {
  const empty = {
    patient_id: "", doctor_id: null as string | null,
    medication: "", dosage: "", frequency: "", duration: "", instructions: "",
    prescribed_date: new Date().toISOString().slice(0, 10),
  };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setForm(initial ?? empty); /* eslint-disable-next-line */ }, [open, initial]);

  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors-min"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name")).data ?? [],
  });

  const save = async () => {
    if (!form.patient_id) return toast.error("Patient required");
    if (!form.medication.trim()) return toast.error("Medication required");
    setBusy(true);
    const { id, patients: _p, doctors: _d, ...rest } = form;
    const { error } = id
      ? await supabase.from("prescriptions").update(rest).eq("id", id)
      : await supabase.from("prescriptions").insert(rest);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit prescription" : "New prescription"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Patient *" className="sm:col-span-2">
            <SearchSelect
              value={form.patient_id}
              onValueChange={(v) => setForm({ ...form, patient_id: v })}
              placeholder="Select patient"
              options={(patients ?? []).map((p: any) => ({ value: p.id, label: p.full_name }))}
            />
          </Field>
          <Field label="Doctor" className="sm:col-span-2">
            <Select value={form.doctor_id ?? "none"} onValueChange={(v) => setForm({ ...form, doctor_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {doctors?.map((d: any) => <SelectItem key={d.id} value={d.id}>Dr. {d.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Medication *" className="sm:col-span-2">
            <Input value={form.medication} onChange={(e) => setForm({ ...form, medication: e.target.value })} />
          </Field>
          <Field label="Dosage"><Input placeholder="e.g. 500mg" value={form.dosage ?? ""} onChange={(e) => setForm({ ...form, dosage: e.target.value })} /></Field>
          <Field label="Frequency"><Input placeholder="e.g. 2x daily" value={form.frequency ?? ""} onChange={(e) => setForm({ ...form, frequency: e.target.value })} /></Field>
          <Field label="Duration"><Input placeholder="e.g. 7 days" value={form.duration ?? ""} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={form.prescribed_date} onChange={(e) => setForm({ ...form, prescribed_date: e.target.value })} /></Field>
          <Field label="Instructions" className="sm:col-span-2">
            <Textarea rows={2} value={form.instructions ?? ""} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
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
