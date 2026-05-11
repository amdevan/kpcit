import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function RecordFormDialog({
  open, onOpenChange, patientId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: string;
  onSaved?: () => void;
}) {
  const initial = {
    visit_date: new Date().toISOString().slice(0, 10),
    chief_complaint: "",
    diagnosis: "",
    treatment: "",
    prescriptions: "",
    notes: "",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("medical_records").insert({ patient_id: patientId, ...form });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Record added");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New medical record</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Row label="Visit date"><Input type="date" value={form.visit_date} onChange={set("visit_date")} /></Row>
          <Row label="Chief complaint"><Textarea rows={2} value={form.chief_complaint} onChange={set("chief_complaint")} /></Row>
          <Row label="Diagnosis"><Input value={form.diagnosis} onChange={set("diagnosis")} /></Row>
          <Row label="Treatment"><Textarea rows={2} value={form.treatment} onChange={set("treatment")} /></Row>
          <Row label="Prescriptions"><Textarea rows={2} value={form.prescriptions} onChange={set("prescriptions")} /></Row>
          <Row label="Notes"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Row>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}