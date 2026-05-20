import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Calendar as CalIcon, Trash2, Pencil } from "lucide-react";
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
import { loadSettings } from "@/routes/settings";

type Appt = {
  id?: string;
  patient_id: string;
  doctor_id?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  reason?: string | null;
  notes?: string | null;
};

const STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no-show"];

export const Route = createFileRoute("/appointments")({
  head: () => ({ meta: [{ title: "Appointments — KPC" }] }),
  component: () => <AppShell><AppointmentsPage /></AppShell>,
});

function AppointmentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Appt | undefined>();
  const [range, setRange] = useState<DateRange>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", range],
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select("*, patients(full_name), doctors(full_name)")
        .order("scheduled_at", { ascending: false });
      const start = rangeStart(range);
      if (start) q = q.gte("scheduled_at", start.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this appointment?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["appointments"] });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">Schedule and track patient visits.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New appointment
        </Button>
      </div>
      <div className="flex justify-end"><DateRangeFilter value={range} onChange={setRange} /></div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <CalIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No appointments yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((a: any) => {
                  const dt = new Date(a.scheduled_at);
                  return (
                    <li key={a.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                      <div className="text-center w-16 shrink-0">
                        <div className="text-[11px] uppercase text-muted-foreground">{dt.toLocaleString(undefined, { month: "short" })}</div>
                        <div className="text-lg font-semibold leading-tight">{dt.getDate()}</div>
                        <div className="text-[11px] text-muted-foreground">{dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {a.patients?.full_name ?? "—"}
                          {a.doctors?.full_name && <span className="text-muted-foreground font-normal"> · Dr. {a.doctors.full_name}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {a.reason || "No reason given"} · {a.duration_minutes} min
                        </div>
                      </div>
                      <span className={"text-xs px-2 py-0.5 rounded-full capitalize " + statusClass(a.status)}>
                        {a.status}
                      </span>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
        </CardContent>
      </Card>
      <ApptDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["appointments"] })} />
    </div>
  );
}

function statusClass(s: string) {
  switch (s) {
    case "completed": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "cancelled": case "no-show": return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
    case "confirmed": return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
    default: return "bg-secondary text-secondary-foreground";
  }
}

function ApptDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: Appt; onSaved?: () => void;
}) {
  const settings = loadSettings();
  const empty: Appt = {
    patient_id: "", doctor_id: null,
    scheduled_at: new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
    duration_minutes: settings.default_appointment_minutes, status: "scheduled",
  };
  const [form, setForm] = useState<Appt>(initial ? { ...initial, scheduled_at: toLocal(initial.scheduled_at) } : empty);
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestGender, setGuestGender] = useState("");
  const [guestAge, setGuestAge] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...initial, scheduled_at: toLocal(initial.scheduled_at) } : empty);
    setGuestMode(false);
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setGuestGender("");
    setGuestAge("");
    /* eslint-disable-next-line */
  }, [open, initial]);

  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors-min"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name")).data ?? [],
  });

  const save = async () => {
    if (guestMode) {
      if (!guestName.trim()) return toast.error("Guest name required");
    } else {
      if (!form.patient_id) return toast.error("Patient required");
    }
    if (!form.scheduled_at) return toast.error("Date/time required");
    setBusy(true);
    const { id, ...rest } = form as any;
    // Strip any joined relation objects coming from the select query
    delete (rest as any).patients;
    delete (rest as any).doctors;
    delete (rest as any).created_at;
    delete (rest as any).updated_at;
    let patientId = rest.patient_id;
    if (guestMode) {
      const { id: createdId, error } = await findOrCreatePatientFromGuest({
        full_name: guestName.trim(),
        phone: guestPhone.trim() || null,
        email: guestEmail.trim() || null,
        gender: guestGender.trim() || null,
        ageYears: guestAge ? Number(guestAge) : null,
      });
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
      patientId = createdId;
    }

    const payload = {
      patient_id: patientId,
      doctor_id: rest.doctor_id ?? null,
      scheduled_at: new Date(rest.scheduled_at).toISOString(),
      duration_minutes: Number(rest.duration_minutes) || 30,
      status: rest.status,
      reason: rest.reason ?? null,
      notes: rest.notes ?? null,
    };
    const { error } = id
      ? await supabase.from("appointments").update(payload).eq("id", id)
      : await supabase.from("appointments").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(id ? "Updated" : "Scheduled");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit appointment" : "New appointment"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center justify-between border rounded-md px-3 py-2">
            <span className="text-sm">Guest appointment</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={guestMode}
              onChange={(e) => {
                const v = e.target.checked;
                setGuestMode(v);
                if (v) setForm((f) => ({ ...f, patient_id: "" }));
              }}
            />
          </div>

          {guestMode ? (
            <>
              <Field label="Guest name *" className="sm:col-span-2">
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
              </Field>
              <Field label="Gender">
                <Input value={guestGender} onChange={(e) => setGuestGender(e.target.value)} />
              </Field>
              <Field label="Age (years)">
                <Input type="number" min={0} value={guestAge} onChange={(e) => setGuestAge(e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="Patient *" className="sm:col-span-2">
              <SearchSelect
                value={form.patient_id}
                onValueChange={(v) => setForm({ ...form, patient_id: v })}
                placeholder="Select patient"
                options={(patients ?? []).map((p: any) => ({ value: p.id, label: p.full_name }))}
              />
            </Field>
          )}
          <Field label="Doctor" className="sm:col-span-2">
            <Select value={form.doctor_id ?? "none"} onValueChange={(v) => setForm({ ...form, doctor_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {doctors?.map((d: any) => <SelectItem key={d.id} value={d.id}>Dr. {d.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date & time *">
            <Input type="datetime-local" value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </Field>
          <Field label="Duration (min)">
            <Input type="number" value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) || 30 })} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Reason">
            <Input value={form.reason ?? ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
        {(!patients || patients.length === 0) && (
          <p className="text-xs text-muted-foreground">
            No patients yet — <Link to="/patients" className="text-primary hover:underline">add one first</Link>.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const tzOff = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOff).toISOString().slice(0, 16);
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label className="text-xs">{label}</Label>{children}</div>;
}

async function findOrCreatePatientFromGuest(input: {
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  ageYears: number | null;
}) {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim() || null;

  if (phone) {
    const { data, error } = await supabase.from("patients").select("id").eq("phone", phone).limit(1).maybeSingle();
    if (!error && data?.id) return { id: data.id, error: null };
  }

  if (email) {
    const { data, error } = await supabase.from("patients").select("id").eq("email", email).limit(1).maybeSingle();
    if (!error && data?.id) return { id: data.id, error: null };
  }

  const date_of_birth =
    input.ageYears === null || !Number.isFinite(input.ageYears) || input.ageYears < 0 ? null : dobFromAge(input.ageYears);

  const { data, error } = await supabase
    .from("patients")
    .insert({
      full_name: input.full_name,
      phone,
      email,
      gender: input.gender,
      date_of_birth,
    })
    .select("id")
    .single();

  return { id: data?.id as string, error };
}

function dobFromAge(ageYears: number) {
  const now = new Date();
  const year = now.getFullYear() - Math.floor(ageYears);
  const month = now.getMonth();
  const day = now.getDate();
  let d = new Date(year, month, day);
  if (d.getMonth() !== month) d = new Date(year, month + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
