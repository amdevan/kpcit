import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PatientRow = {
  id?: string;
  full_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  blood_type?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
};

const empty: PatientRow = { full_name: "" };

export function PatientFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: PatientRow;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<PatientRow>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ?? empty);
  }, [open, initial]);

  const set = (k: keyof PatientRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.full_name.trim()) return toast.error("Name is required");
    setBusy(true);
    const payload: Record<string, unknown> = { ...form };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    const { error } = form.id
      ? await supabase.from("patients").update(payload).eq("id", form.id)
      : await supabase.from("patients").insert(payload as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Patient updated" : "Patient added");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit patient" : "New patient"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" className="sm:col-span-2">
            <Input value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.date_of_birth ?? ""} onChange={set("date_of_birth")} />
          </Field>
          <Field label="Gender">
            <Input value={form.gender ?? ""} onChange={set("gender")} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone ?? ""} onChange={set("phone")} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email ?? ""} onChange={set("email")} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address ?? ""} onChange={set("address")} />
          </Field>
          <Field label="Blood type">
            <Input value={form.blood_type ?? ""} onChange={set("blood_type")} placeholder="e.g. A+" />
          </Field>
          <Field label="Allergies">
            <Input value={form.allergies ?? ""} onChange={set("allergies")} />
          </Field>
          <Field label="Chronic conditions" className="sm:col-span-2">
            <Input value={form.chronic_conditions ?? ""} onChange={set("chronic_conditions")} />
          </Field>
          <Field label="Emergency contact name">
            <Input value={form.emergency_contact_name ?? ""} onChange={set("emergency_contact_name")} />
          </Field>
          <Field label="Emergency contact phone">
            <Input value={form.emergency_contact_phone ?? ""} onChange={set("emergency_contact_phone")} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={3} value={form.notes ?? ""} onChange={set("notes")} />
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
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}