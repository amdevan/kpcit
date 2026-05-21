import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, ClipboardList, Trash2, Pencil, UserPlus, Search } from "lucide-react";
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
import { toast } from "sonner";
import { DateRangeFilter, type DateRange, rangeStart } from "@/components/app/DateRangeFilter";

export const Route = createFileRoute("/inquiries")({
  head: () => ({ meta: [{ title: "Inquiry Register — KPC-MS" }] }),
  component: () => <AppShell><InquiriesPage /></AppShell>,
});

function InquiriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | undefined>();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [range, setRange] = useState<DateRange>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["inquiries", q, statusFilter, range],
    queryFn: async () => {
      let query = supabase.from("inquiries").select("*").order("created_at", { ascending: false });
      if (q.trim()) {
        const s = q.trim().replace(/[(),]/g, " ");
        query = query.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,purpose.ilike.%${s}%,id.ilike.%${s}%`);
      }
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const start = rangeStart(range);
      if (start) query = query.gte("created_at", start.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this inquiry?")) return;
    const { error } = await supabase.from("inquiries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["inquiries"] });
  };

  const convert = async (inq: any) => {
    if (inq.converted_patient_id) return toast.info("Already converted");
    if (!confirm(`Convert "${inq.full_name}" into a patient record?`)) return;
    let dob: string | null = null;
    if (inq.age && Number(inq.age) > 0) {
      const y = new Date().getFullYear() - Number(inq.age);
      dob = `${y}-01-01`;
    }
    const { data: pat, error } = await supabase.from("patients").insert({
      full_name: inq.full_name,
      phone: inq.phone,
      email: inq.email,
      gender: inq.gender,
      address: inq.address,
      date_of_birth: dob,
      notes: [inq.purpose && `From inquiry: ${inq.purpose}`, inq.notes].filter(Boolean).join("\n"),
    }).select("id").single();
    if (error) return toast.error(error.message);
    const { error: upErr } = await supabase.from("inquiries").update({
      status: "converted",
      converted_patient_id: pat.id,
      converted_at: new Date().toISOString(),
    }).eq("id", inq.id);
    if (upErr) return toast.error(upErr.message);
    toast.success("Converted to patient");
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    qc.invalidateQueries({ queryKey: ["patients"] });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Inquiry Register
          </h1>
          <p className="text-sm text-muted-foreground">Capture leads and walk-ins. Convert to patient when they enroll.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New inquiry
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone, email…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "new", "contacted", "follow_up", "converted", "lost"].map(s =>
              <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No inquiries yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((i: any) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{i.full_name}</span>
                        <Badge variant="secondary" className="capitalize">{i.status?.replace("_"," ")}</Badge>
                        {i.source && <Badge variant="outline">{i.source}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[i.phone, i.email, i.purpose, i.follow_up_date && `Follow-up ${i.follow_up_date}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {!i.converted_patient_id && (
                      <Button size="sm" variant="outline" onClick={() => convert(i)} title="Convert to patient">
                        <UserPlus className="h-4 w-4" /> Convert
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
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

      <InquiryDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["inquiries"] })} />
    </div>
  );
}

function InquiryDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void;
}) {
  const empty = { full_name: "", phone: "", email: "", age: "", gender: "", address: "", source: "", purpose: "", follow_up_date: "", status: "new", notes: "" };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setForm(initial ?? empty); /* eslint-disable-next-line */ }, [open, initial]);

  const save = async () => {
    if (!form.full_name?.trim()) return toast.error("Name required");
    setBusy(true);
    const payload: any = { ...form };
    payload.age = form.age ? Number(form.age) : null;
    payload.follow_up_date = form.follow_up_date || null;
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const { id, ...rest } = payload;
    const { error } = id
      ? await supabase.from("inquiries").update(rest).eq("id", id)
      : await supabase.from("inquiries").insert(rest);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit inquiry" : "New inquiry"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" className="sm:col-span-2"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Age"><Input type="number" value={form.age ?? ""} onChange={(e) => setForm({ ...form, age: e.target.value })} /></Field>
          <Field label="Gender"><Input value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Source">
            <Select value={form.source ?? ""} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {["walk-in", "phone", "referral", "website", "social", "other"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["new", "contacted", "follow_up", "converted", "lost"].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Purpose / Inquiry about" className="sm:col-span-2"><Input value={form.purpose ?? ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
          <Field label="Follow-up date"><Input type="date" value={form.follow_up_date ?? ""} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
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
