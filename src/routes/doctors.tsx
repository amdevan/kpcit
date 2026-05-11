import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2, UserCog } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Doctor = {
  id?: string;
  full_name: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  license_number?: string | null;
  consultation_fee?: number | null;
  notes?: string | null;
};

export const Route = createFileRoute("/doctors")({
  head: () => ({ meta: [{ title: "Doctors — MediClinic" }] }),
  component: () => <AppShell><DoctorsPage /></AppShell>,
});

function DoctorsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["doctors", q],
    queryFn: async () => {
      let query = supabase.from("doctors").select("*").order("created_at", { ascending: false });
      if (q.trim()) query = query.ilike("full_name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this doctor?")) return;
    const { error } = await supabase.from("doctors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Doctor removed");
    qc.invalidateQueries({ queryKey: ["doctors"] });
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Doctors</h1>
          <p className="text-sm text-muted-foreground">Manage clinic doctors and specialists.</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New doctor
        </Button>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            : !data || data.length === 0 ? (
              <div className="p-12 text-center">
                <UserCog className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No doctors yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.map((d: any) => (
                  <li key={d.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-medium">
                      {d.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">Dr. {d.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[d.specialty, d.phone, d.email].filter(Boolean).join(" · ") || "No details"}
                      </div>
                    </div>
                    {d.consultation_fee != null && Number(d.consultation_fee) > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                        ${Number(d.consultation_fee).toFixed(2)}
                      </span>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>
      <DoctorDialog open={open} onOpenChange={setOpen} initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["doctors"] })} />
    </div>
  );
}

function DoctorDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: Doctor; onSaved?: () => void;
}) {
  const empty: Doctor = { full_name: "" };
  const [form, setForm] = useState<Doctor>(initial ?? empty);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Doctor) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.full_name.trim()) return toast.error("Name required");
    setBusy(true);
    const { id, ...rest } = form;
    const payload = {
      ...rest,
      consultation_fee: rest.consultation_fee ? Number(rest.consultation_fee) : 0,
    };
    const { error } = id
      ? await supabase.from("doctors").update(payload).eq("id", id)
      : await supabase.from("doctors").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(id ? "Updated" : "Added");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setForm(initial ?? empty); onOpenChange(v); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit doctor" : "New doctor"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" className="sm:col-span-2"><Input value={form.full_name} onChange={set("full_name")} /></Field>
          <Field label="Specialty"><Input value={form.specialty ?? ""} onChange={set("specialty")} /></Field>
          <Field label="License #"><Input value={form.license_number ?? ""} onChange={set("license_number")} /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={set("phone")} /></Field>
          <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={set("email")} /></Field>
          <Field label="Consultation fee"><Input type="number" step="0.01" value={form.consultation_fee ?? ""} onChange={set("consultation_fee" as any)} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes ?? ""} onChange={set("notes")} /></Field>
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