import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { consumeNextPatientCode, loadPatientCodesLocal, loadSettings, patientCodeColumnAvailable, previewNextPatientCode, setPatientCodeLocal } from "@/routes/settings";

export type PatientRow = {
  id?: string;
  patient_code?: string | null;
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

const empty: PatientRow = { full_name: "", patient_code: "" };
const GENDERS = ["male", "female", "other", "prefer_not_to_say"];

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
  const [age, setAge] = useState<string>("");
  const [genderChoice, setGenderChoice] = useState<string>("");
  const [customGender, setCustomGender] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [supportsPatientCode, setSupportsPatientCode] = useState<boolean | null>(null);
  const settings = useMemo(() => loadSettings(), []);
  const preview = useMemo(() => previewNextPatientCode(settings as any), [settings]);

  useEffect(() => {
    if (!open) return;
    const localCodes = loadPatientCodesLocal();
    const next =
      initial
        ? { ...initial, patient_code: initial.patient_code ?? (initial.id ? (localCodes[initial.id] ?? "") : "") }
        : { ...empty, patient_code: previewNextPatientCode(loadSettings() as any) };
    setForm(next);
    patientCodeColumnAvailable().then((v) => setSupportsPatientCode(v)).catch(() => setSupportsPatientCode(false));

    if (next.date_of_birth) {
      setAge(String(ageFromDob(next.date_of_birth)));
    } else {
      setAge("");
    }

    const g = (next.gender ?? "").trim();
    const gNorm = normalizeGender(g);
    if (gNorm && GENDERS.includes(gNorm)) {
      setGenderChoice(gNorm);
      setCustomGender("");
    } else if (g) {
      setGenderChoice("custom");
      setCustomGender(g);
    } else {
      setGenderChoice("");
      setCustomGender("");
    }
  }, [open, initial]);

  const set = (k: keyof PatientRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.full_name.trim()) return toast.error("Name is required");
    setBusy(true);
    const { id, patient_code, ...rest } = form;
    const codeRaw = String(patient_code ?? "").trim();
    const autoPreview = previewNextPatientCode(loadSettings() as any);
    const patientCode =
      !id && (!codeRaw || codeRaw === autoPreview)
        ? consumeNextPatientCode()
        : (codeRaw || null);
    const insertable = Object.fromEntries(
      Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v])
    ) as Omit<PatientRow, "id">;
    const supported = supportsPatientCode ?? (await patientCodeColumnAvailable().catch(() => false));
    let usedPatientCodeColumn = supported;
    const withCode = supported ? ({ ...(insertable as any), patient_code: patientCode } as any) : (insertable as any);

    let error: any = null;
    let newId: string | null = id ?? null;
    if (id) {
      const res = await supabase.from("patients").update(withCode).eq("id", id);
      error = (res as any).error;
      if (error && String(error.message || "").toLowerCase().includes("patient_code")) {
        setSupportsPatientCode(false);
        usedPatientCodeColumn = false;
        const retry = await supabase.from("patients").update(insertable as any).eq("id", id);
        error = (retry as any).error;
      }
    } else {
      const res = await supabase.from("patients").insert(withCode as any).select("id").single();
      error = (res as any).error;
      newId = (res as any).data?.id ?? null;
      if (error && String(error.message || "").toLowerCase().includes("patient_code")) {
        setSupportsPatientCode(false);
        usedPatientCodeColumn = false;
        const retry = await supabase.from("patients").insert(insertable as any).select("id").single();
        error = (retry as any).error;
        newId = (retry as any).data?.id ?? null;
      }
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    if (patientCode && newId && !usedPatientCodeColumn) {
      setPatientCodeLocal(newId, patientCode);
    }
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
          <Field label="Patient ID (MRN)" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input value={form.patient_code ?? ""} onChange={set("patient_code")} placeholder={preview} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm((f) => ({ ...f, patient_code: previewNextPatientCode(loadSettings() as any) }))}
              >
                Generate
              </Button>
            </div>
          </Field>
          <Field label="Age (years)">
            <Input
              type="number"
              min={0}
              value={age}
              onChange={(e) => {
                const v = e.target.value;
                setAge(v);
                const n = Number(v);
                if (!Number.isFinite(n) || n < 0) return;
                setForm((f) => ({ ...f, date_of_birth: dobFromAge(n) }));
              }}
            />
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              value={form.date_of_birth ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, date_of_birth: v }));
                setAge(v ? String(ageFromDob(v)) : "");
              }}
            />
          </Field>
          <Field label="Gender">
            <div className="space-y-2">
              <Select
                value={genderChoice}
                onValueChange={(v) => {
                  setGenderChoice(v);
                  if (!v) return setForm((f) => ({ ...f, gender: "" }));
                  if (v === "custom") return setForm((f) => ({ ...f, gender: customGender }));
                  setCustomGender("");
                  setForm((f) => ({ ...f, gender: v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {genderChoice === "custom" && (
                <Input
                  value={customGender}
                  placeholder="Enter gender"
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomGender(v);
                    setForm((f) => ({ ...f, gender: v }));
                  }}
                />
              )}
            </div>
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

function normalizeGender(v: string) {
  const s = v.trim().toLowerCase();
  if (!s) return "";
  if (s === "m" || s === "male") return "male";
  if (s === "f" || s === "female") return "female";
  if (s === "other") return "other";
  if (s === "prefer not to say" || s === "prefer_not_to_say" || s === "na") return "prefer_not_to_say";
  return s;
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

function ageFromDob(dob: string) {
  const [y, m, d] = dob.split("-").map((x) => Number(x));
  if (!y || !m || !d) return 0;
  const now = new Date();
  let age = now.getFullYear() - y;
  const bdayThisYear = new Date(now.getFullYear(), m - 1, d);
  if (now < bdayThisYear) age -= 1;
  return Math.max(0, age);
}
