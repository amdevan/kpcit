import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, BellRing, Trash2, Pencil, CheckCircle2, Send } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/follow-ups")({
  head: () => ({ meta: [{ title: "Follow-ups — MediClinic" }] }),
  component: () => <AppShell><FollowUpsPage /></AppShell>,
});

function FollowUpsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | undefined>();
  const [filter, setFilter] = useState<string>("pending");

  const { data, isLoading } = useQuery({
    queryKey: ["follow_ups", filter],
    queryFn: async () => {
      let q = supabase.from("follow_ups").select("*, patients(full_name, phone, email), inquiries(full_name, phone, email)").order("due_date", { ascending: true });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    const { error } = await supabase.from("follow_ups").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["follow_ups"] });
  };

  const complete = async (id: string) => {
    const { error } = await supabase.from("follow_ups").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked completed");
    qc.invalidateQueries({ queryKey: ["follow_ups"] });
  };

  const notifyPatient = async (f: any) => {
    const contact = f.patients ?? f.inquiries;
    if (!contact) return toast.error("No linked patient/inquiry");
    const channel = f.channel === "email" ? "email" : "SMS/call";
    const dest = f.channel === "email" ? contact.email : contact.phone;
    if (!dest) return toast.error(`Missing ${channel} contact`);
    await supabase.from("follow_ups").update({ patient_notified_at: new Date().toISOString() }).eq("id", f.id);
    toast.success(`Reminder logged via ${channel} → ${dest}`);
    qc.invalidateQueries({ queryKey: ["follow_ups"] });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BellRing className="h-6 w-6" /> Follow-up Management
          </h1>
          <p className="text-sm text-muted-foreground">Schedule reminders, alert staff, and notify patients automatically.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["pending", "completed", "cancelled", "all"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
            <Plus className="h-4 w-4" /> New follow-up
          </Button>
        </div>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <BellRing className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No follow-ups.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((f: any) => {
                  const overdue = f.status === "pending" && f.due_date < today;
                  const dueToday = f.due_date === today;
                  const who = f.patients?.full_name ?? f.inquiries?.full_name ?? "—";
                  return (
                    <li key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{f.title}</span>
                          <Badge variant="outline">{f.channel}</Badge>
                          {f.priority && f.priority !== "normal" && (
                            <Badge className={
                              f.priority === "urgent" ? "bg-rose-600 text-white" :
                              f.priority === "high" ? "bg-amber-500 text-white" :
                              "bg-slate-200 text-slate-800"
                            }>{f.priority}</Badge>
                          )}
                          {overdue && <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">Overdue</Badge>}
                          {dueToday && f.status === "pending" && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Today</Badge>}
                          {f.status !== "pending" && <Badge variant="secondary" className="capitalize">{f.status}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {who} · Due {f.due_date}{f.notes ? ` · ${f.notes}` : ""}
                        </div>
                      </div>
                      {f.status === "pending" && (
                        <>
                          {f.notify_patient && (
                            <Button size="sm" variant="outline" onClick={() => notifyPatient(f)} title="Send patient reminder">
                              <Send className="h-4 w-4" /> Notify
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => complete(f.id)}>
                            <CheckCircle2 className="h-4 w-4" /> Done
                          </Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(f); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(f.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
        </CardContent>
      </Card>

      <FollowUpDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["follow_ups"] })} />
    </div>
  );
}

function FollowUpDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void;
}) {
  const empty = { title: "", patient_id: "", inquiry_id: "", due_date: "", channel: "call", status: "pending", notes: "", notify_staff: true, notify_patient: false, priority: "normal", reminder_days_before: 0 };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setForm(initial ?? empty); /* eslint-disable-next-line */ }, [open, initial]);

  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });
  const { data: inquiries } = useQuery({
    queryKey: ["inquiries-min"],
    queryFn: async () => (await supabase.from("inquiries").select("id, full_name").neq("status", "converted").order("created_at", { ascending: false })).data ?? [],
  });

  const save = async () => {
    if (!form.title?.trim()) return toast.error("Title required");
    if (!form.due_date) return toast.error("Due date required");
    if (!form.patient_id && !form.inquiry_id) return toast.error("Pick a patient or inquiry");
    setBusy(true);
    const payload: any = { ...form };
    payload.patient_id = form.patient_id || null;
    payload.inquiry_id = form.inquiry_id || null;
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const { id, ...rest } = payload;
    const { error } = id
      ? await supabase.from("follow_ups").update(rest).eq("id", id)
      : await supabase.from("follow_ups").insert(rest);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit follow-up" : "New follow-up"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title *" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Patient">
            <Select value={form.patient_id ?? ""} onValueChange={(v) => setForm({ ...form, patient_id: v, inquiry_id: "" })}>
              <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>{patients?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Or Inquiry">
            <Select value={form.inquiry_id ?? ""} onValueChange={(v) => setForm({ ...form, inquiry_id: v, patient_id: "" })}>
              <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>{inquiries?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Due date *"><Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Channel">
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["call", "sms", "email", "visit"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["pending","completed","cancelled"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority ?? "normal"} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["low","normal","high","urgent"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Remind days before">
            <Input type="number" min={0} value={form.reminder_days_before ?? 0} onChange={(e) => setForm({ ...form, reminder_days_before: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!form.notify_staff} onCheckedChange={(v) => setForm({ ...form, notify_staff: !!v })} />
            Notify internal staff
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!form.notify_patient} onCheckedChange={(v) => setForm({ ...form, notify_patient: !!v })} />
            Notify patient
          </label>
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