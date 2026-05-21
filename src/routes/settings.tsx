import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Download, Upload, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — KPC-MS" }] }),
  component: () => <AppShell><SettingsPage /></AppShell>,
});

type Settings = {
  clinic_name: string;
  clinic_address: string;
  clinic_phone: string;
  clinic_email: string;
  clinic_logo_url: string;
  timezone: string;
  patient_id_prefix: string;
  patient_id_padding: number;
  patient_id_next_no: number;
  currency: string;
  invoice_prefix: string;
  billing_default_due_days: number;
  billing_default_tax: number;
  billing_default_discount: number;
  billing_payment_methods: string[];
  billing_default_payment_method: string;
  billing_receipt_note: string;
  billable_services: BillableService[];
  default_appointment_minutes: number;
  default_follow_up_channel: "call" | "sms" | "email" | "visit";
  notify_staff_default: boolean;
  notify_patient_default: boolean;
  reminder_days_before: number;
};

export type BillableService = {
  id: string;
  name: string;
  category: string;
  unit_price: number;
};

const DEFAULTS: Settings = {
  clinic_name: "KPC-MS",
  clinic_address: "",
  clinic_phone: "",
  clinic_email: "",
  clinic_logo_url: "",
  timezone: "Asia/Katmandu",
  patient_id_prefix: "PAT",
  patient_id_padding: 6,
  patient_id_next_no: 1,
  currency: "NPR",
  invoice_prefix: "INV",
  billing_default_due_days: 0,
  billing_default_tax: 0,
  billing_default_discount: 0,
  billing_payment_methods: ["cash", "fonepay", "esewa", "card", "online"],
  billing_default_payment_method: "cash",
  billing_receipt_note: "",
  billable_services: [],
  default_appointment_minutes: 30,
  default_follow_up_channel: "call",
  notify_staff_default: true,
  notify_patient_default: false,
  reminder_days_before: 1,
};

const KEY = "mediclinic.settings";
const FINANCE_LOCAL_KEY = "kpcms.finance.local.v1";
const PATIENT_CODES_LOCAL_KEY = "kpcms.patient_codes.local.v1";
export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; }
  catch { return DEFAULTS; }
}

export function loadPatientCodesLocal(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PATIENT_CODES_LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setPatientCodeLocal(patientId: string, code: string) {
  if (typeof window === "undefined") return;
  const map = loadPatientCodesLocal();
  map[patientId] = code;
  localStorage.setItem(PATIENT_CODES_LOCAL_KEY, JSON.stringify(map));
}

export async function patientCodeColumnAvailable() {
  const { error } = await supabase.from("patients").select("patient_code").limit(1);
  if (!error) return true;
  const code = String((error as any).code || "");
  if (code === "42703") return false;
  const msg = [
    String((error as any).message || ""),
    String((error as any).details || ""),
    String((error as any).hint || ""),
  ].join(" ").toLowerCase();
  if (msg.includes("patient_code") && (msg.includes("column") || msg.includes("does not exist") || msg.includes("schema cache"))) {
    return false;
  }
  return true;
}

export function previewNextPatientCode(s: Settings = loadSettings()) {
  const prefix = String((s as any).patient_id_prefix ?? "PAT").trim() || "PAT";
  const padRaw = Number((s as any).patient_id_padding ?? 6) || 6;
  const pad = Math.max(3, Math.min(12, Math.floor(padRaw)));
  const next = Math.max(1, Math.floor(Number((s as any).patient_id_next_no ?? 1) || 1));
  return `${prefix}-${String(next).padStart(pad, "0")}`;
}

export function consumeNextPatientCode() {
  if (typeof window === "undefined") return "";
  const s = loadSettings();
  const code = previewNextPatientCode(s);
  const next = Math.max(1, Math.floor(Number((s as any).patient_id_next_no ?? 1) || 1)) + 1;
  const updated = { ...s, patient_id_next_no: next };
  localStorage.setItem(KEY, JSON.stringify(updated));
  return code;
}

function SettingsPage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [initialRaw, setInitialRaw] = useState("");
  const [assigningPatients, setAssigningPatients] = useState(false);

  useEffect(() => {
    const loaded = loadSettings();
    setS(loaded);
    setInitialRaw(JSON.stringify(loaded));
  }, []);

  const save = () => {
    if (!isAdmin) return toast.error("Admin access required");
    if ((Number(s.default_appointment_minutes) || 0) < 5) return toast.error("Appointment duration must be at least 5 minutes");
    if ((Number(s.reminder_days_before) || 0) < 0) return toast.error("Reminder days cannot be negative");
    if ((Number(s.billing_default_due_days) || 0) < 0) return toast.error("Default due days cannot be negative");
    if ((Number(s.billing_default_tax) || 0) < 0) return toast.error("Default tax cannot be negative");
    if ((Number(s.billing_default_discount) || 0) < 0) return toast.error("Default discount cannot be negative");
    if ((Number(s.patient_id_padding) || 0) < 3) return toast.error("Patient ID padding must be at least 3");
    if ((Number(s.patient_id_next_no) || 0) < 1) return toast.error("Patient next number must be at least 1");
    localStorage.setItem(KEY, JSON.stringify(s));
    setInitialRaw(JSON.stringify(s));
    toast.success("Settings saved");
  };
  const reset = () => {
    if (!isAdmin) return toast.error("Admin access required");
    setS(DEFAULTS);
    localStorage.removeItem(KEY);
    setInitialRaw(JSON.stringify(DEFAULTS));
    toast.message("Restored defaults");
  };

  const dirty = initialRaw ? JSON.stringify(s) !== initialRaw : false;

  const downloadJson = (name: string, obj: any) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportSettings = () => {
    downloadJson("kpcms_settings.json", s);
    toast.success("Settings exported");
  };

  const importSettings = async (file: File) => {
    if (!isAdmin) return toast.error("Admin access required");
    const text = await file.text();
    const parsed = JSON.parse(text);
    const merged = { ...DEFAULTS, ...(parsed ?? {}) };
    setS(merged);
    toast.success("Settings imported");
  };

  const exportFinanceLocal = () => {
    const raw = localStorage.getItem(FINANCE_LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : { receipt_last_no: {}, payments: [], expenses: [], recurring: [], commission_rules: [], expense_categories: [] };
    downloadJson("kpcms_finance_local.json", parsed);
    toast.success("Finance data exported");
  };

  const clearFinanceLocal = () => {
    if (!isAdmin) return toast.error("Admin access required");
    localStorage.removeItem(FINANCE_LOCAL_KEY);
    toast.message("Local finance data cleared");
  };

  const assignPatientIds = async () => {
    if (!isAdmin) return toast.error("Admin access required");
    setAssigningPatients(true);
    const supports = await patientCodeColumnAvailable();
    const select = supports ? "id, created_at, patient_code" : "id, created_at";
    const { data, error } = await supabase.from("patients").select(select).order("created_at", { ascending: true }).limit(10000);
    if (error) {
      setAssigningPatients(false);
      return toast.error(error.message);
    }
    let nextNo = Math.max(1, Math.floor(Number((s as any).patient_id_next_no ?? 1) || 1));
    const prefix = String((s as any).patient_id_prefix ?? "PAT").trim() || "PAT";
    const pad = Math.max(3, Math.min(12, Math.floor(Number((s as any).patient_id_padding ?? 6) || 6)));
    const localMap = loadPatientCodesLocal();
    let assigned = 0;
    for (const p of (data ?? []) as any[]) {
      const existing = supports ? String(p.patient_code ?? "") : (localMap[p.id] ?? "");
      if (existing) continue;
      const code = `${prefix}-${String(nextNo).padStart(pad, "0")}`;
      nextNo += 1;
      assigned += 1;
      if (supports) {
        const up = await supabase.from("patients").update({ patient_code: code } as any).eq("id", p.id);
        if (up.error) {
          const errCode = String((up.error as any).code || "");
          const msg = [
            String((up.error as any).message || ""),
            String((up.error as any).details || ""),
            String((up.error as any).hint || ""),
          ].join(" ").toLowerCase();
          if (errCode === "42703" || (msg.includes("patient_code") && (msg.includes("column") || msg.includes("does not exist") || msg.includes("schema cache")))) {
            setPatientCodeLocal(p.id, code);
          } else {
            setAssigningPatients(false);
            return toast.error(up.error.message);
          }
        }
      } else {
        setPatientCodeLocal(p.id, code);
      }
    }
    const updated = { ...s, patient_id_next_no: nextNo };
    setS(updated);
    localStorage.setItem(KEY, JSON.stringify(updated));
    setInitialRaw(JSON.stringify(updated));
    setAssigningPatients(false);
    toast.success(`Assigned ${assigned} patient ID(s)`);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-6 w-6" /> Settings
          </h1>
          <p className="text-sm text-muted-foreground">Configure clinic profile, currency, invoices and notifications.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} disabled={!isAdmin}>Restore defaults</Button>
          <Button onClick={save} disabled={!isAdmin || !dirty}><Save className="h-4 w-4" /> Save changes</Button>
        </div>
      </div>

      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="appointments">Scheduling</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic">
          <Card><CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <Field label="Clinic name"><Input value={s.clinic_name} onChange={(e) => setS({ ...s, clinic_name: e.target.value })} /></Field>
            <Field label="Phone"><Input value={s.clinic_phone} onChange={(e) => setS({ ...s, clinic_phone: e.target.value })} /></Field>
            <Field label="Email" className="sm:col-span-1"><Input type="email" value={s.clinic_email} onChange={(e) => setS({ ...s, clinic_email: e.target.value })} /></Field>
            <Field label="Logo URL" className="sm:col-span-1"><Input value={s.clinic_logo_url} onChange={(e) => setS({ ...s, clinic_logo_url: e.target.value })} placeholder="https://..." /></Field>
            <Field label="Timezone" className="sm:col-span-2"><Input value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} placeholder="Asia/Katmandu" /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={s.clinic_address} onChange={(e) => setS({ ...s, clinic_address: e.target.value })} /></Field>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="patients">
          <Card>
            <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
              <Field label="Patient ID prefix">
                <Input value={s.patient_id_prefix} disabled={!isAdmin} onChange={(e) => setS({ ...s, patient_id_prefix: e.target.value })} placeholder="PAT" />
              </Field>
              <Field label="Number padding">
                <Input type="number" min={3} max={12} value={s.patient_id_padding} disabled={!isAdmin} onChange={(e) => setS({ ...s, patient_id_padding: Number(e.target.value) || 6 })} />
              </Field>
              <Field label="Next patient number">
                <Input type="number" min={1} value={s.patient_id_next_no} disabled={!isAdmin} onChange={(e) => setS({ ...s, patient_id_next_no: Number(e.target.value) || 1 })} />
              </Field>
              <div className="sm:col-span-2">
                <div className="text-sm font-medium">Preview</div>
                <div className="text-xs text-muted-foreground">Next ID: {previewNextPatientCode(s)}</div>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-muted-foreground">
                  To store IDs in Supabase, apply migration `20260521100000_patient_code.sql` and refresh schema cache.
                </div>
                <Button variant="outline" onClick={assignPatientIds} disabled={!isAdmin || assigningPatients}>
                  {assigningPatients ? "Assigning…" : "Assign IDs to existing"}
                </Button>
              </div>
              {!isAdmin && <div className="sm:col-span-2 text-xs text-muted-foreground">Admin-only settings.</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card><CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <Field label="Currency">
              <Select value={s.currency} onValueChange={(v) => setS({ ...s, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["NPR", "INR", "USD", "EUR", "GBP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Billing prefix"><Input value={s.invoice_prefix} onChange={(e) => setS({ ...s, invoice_prefix: e.target.value })} /></Field>
            <Field label="Default due days">
              <Input type="number" min={0} value={s.billing_default_due_days} onChange={(e) => setS({ ...s, billing_default_due_days: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Default tax (amount)">
              <Input type="number" step="0.01" min={0} value={s.billing_default_tax} onChange={(e) => setS({ ...s, billing_default_tax: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Default discount (amount)">
              <Input type="number" step="0.01" min={0} value={s.billing_default_discount} onChange={(e) => setS({ ...s, billing_default_discount: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Default payment method">
              <Select value={s.billing_default_payment_method} onValueChange={(v) => setS({ ...s, billing_default_payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(s.billing_payment_methods.length ? s.billing_payment_methods : ["cash"]).map((m) => (
                    <SelectItem key={m} value={m}>{String(m).toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <div className="text-sm font-medium">Payment methods</div>
              <div className="text-xs text-muted-foreground">Enable the payment options shown in Billing and Finance.</div>
              <div className="grid gap-2 mt-3 sm:grid-cols-2">
                {["cash", "fonepay", "esewa", "card", "online"].map((m) => {
                  const checked = s.billing_payment_methods.includes(m);
                  return (
                    <label key={m} className="flex items-center justify-between border rounded-md px-3 py-2">
                      <span className="text-sm uppercase">{m}</span>
                      <Switch
                        checked={checked}
                        onCheckedChange={(v) => {
                          setS((cur) => {
                            const set = new Set(cur.billing_payment_methods);
                            if (v) set.add(m); else set.delete(m);
                            const next = Array.from(set);
                            const def = next.includes(cur.billing_default_payment_method) ? cur.billing_default_payment_method : (next[0] ?? "cash");
                            return { ...cur, billing_payment_methods: next, billing_default_payment_method: def };
                          });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            <Field label="Receipt note" className="sm:col-span-2">
              <Textarea rows={2} value={s.billing_receipt_note} onChange={(e) => setS({ ...s, billing_receipt_note: e.target.value })} placeholder="Thank you / terms / refund policy…" />
            </Field>
            <div className="sm:col-span-2 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Billable services</div>
                  <div className="text-xs text-muted-foreground">Use these in invoices as quick selectable items.</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isAdmin}
                  onClick={() => {
                    const next: BillableService = {
                      id: (globalThis.crypto as any)?.randomUUID?.() ?? `svc_${Date.now()}`,
                      name: "",
                      category: "OPD",
                      unit_price: 0,
                    };
                    setS((cur) => ({ ...cur, billable_services: [...cur.billable_services, next] }));
                  }}
                >
                  Add service
                </Button>
              </div>
              {s.billable_services.length === 0 ? (
                <div className="mt-3 text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
                  No services configured yet.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {s.billable_services.map((svc, idx) => (
                    <div key={svc.id} className="grid grid-cols-12 gap-2 items-center">
                      <Input
                        className="col-span-5"
                        placeholder="Service name"
                        value={svc.name}
                        disabled={!isAdmin}
                        onChange={(e) => {
                          const v = e.target.value;
                          setS((cur) => {
                            const next = [...cur.billable_services];
                            next[idx] = { ...next[idx], name: v };
                            return { ...cur, billable_services: next };
                          });
                        }}
                      />
                      <Select
                        value={svc.category}
                        disabled={!isAdmin}
                        onValueChange={(v) => {
                          setS((cur) => {
                            const next = [...cur.billable_services];
                            next[idx] = { ...next[idx], category: v };
                            return { ...cur, billable_services: next };
                          });
                        }}
                      >
                        <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["OPD", "LAB", "Pharmacy", "Procedure", "Imaging", "Other"].map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="col-span-3"
                        type="number"
                        step="0.01"
                        placeholder="Unit price"
                        value={svc.unit_price}
                        disabled={!isAdmin}
                        onChange={(e) => {
                          const n = Number(e.target.value) || 0;
                          setS((cur) => {
                            const next = [...cur.billable_services];
                            next[idx] = { ...next[idx], unit_price: n };
                            return { ...cur, billable_services: next };
                          });
                        }}
                      />
                      <Button
                        className="col-span-1"
                        size="icon"
                        variant="ghost"
                        disabled={!isAdmin}
                        onClick={() => {
                          setS((cur) => ({ ...cur, billable_services: cur.billable_services.filter((x) => x.id !== svc.id) }));
                        }}
                        title="Remove"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="appointments">
          <Card><CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <Field label="Default appointment duration (min)">
              <Input type="number" value={s.default_appointment_minutes}
                onChange={(e) => setS({ ...s, default_appointment_minutes: Number(e.target.value) || 30 })} />
            </Field>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card><CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <Field label="Default follow-up channel">
              <Select value={s.default_follow_up_channel} onValueChange={(v: any) => setS({ ...s, default_follow_up_channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["call","sms","email","visit"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Default reminder days before">
              <Input type="number" min={0} value={s.reminder_days_before}
                onChange={(e) => setS({ ...s, reminder_days_before: Number(e.target.value) || 0 })} />
            </Field>
            <label className="flex items-center justify-between border rounded-md px-3 py-2">
              <span className="text-sm">Notify staff by default</span>
              <Switch checked={s.notify_staff_default} onCheckedChange={(v) => setS({ ...s, notify_staff_default: v })} />
            </label>
            <label className="flex items-center justify-between border rounded-md px-3 py-2">
              <span className="text-sm">Notify patient by default</span>
              <Switch checked={s.notify_patient_default} onCheckedChange={(v) => setS({ ...s, notify_patient_default: v })} />
            </label>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="account">
          <Card><CardContent className="p-6 space-y-2">
            <div className="text-sm"><span className="text-muted-foreground">Signed in as:</span> {user?.email}</div>
            <div className="text-sm"><span className="text-muted-foreground">Role:</span> <span className="capitalize">{roles.join(", ") || "user"}</span></div>
            {!isAdmin && <p className="text-xs text-muted-foreground pt-2">Some configurations may be admin-only.</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium">Backup & restore</div>
                  <div className="text-xs text-muted-foreground">Export settings (and local finance data) or restore from a file.</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={exportSettings}>
                    <Download className="h-4 w-4" /> Export settings
                  </Button>
                  <Button variant="outline" onClick={exportFinanceLocal}>
                    <Download className="h-4 w-4" /> Export finance (local)
                  </Button>
                </div>
              </div>

              <div className="border rounded-md p-4 space-y-2">
                <div className="text-sm font-medium">Import settings</div>
                <div className="text-xs text-muted-foreground">Admin only. Imports JSON and does not auto-save until you click “Save changes”.</div>
                <label className={"relative inline-flex items-center gap-2 text-sm " + (!isAdmin ? "opacity-60 pointer-events-none" : "")}>
                  <Upload className="h-4 w-4" />
                  <span>Choose file</span>
                  <input
                    type="file"
                    accept="application/json"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      importSettings(file).catch((err) => toast.error(err?.message ?? "Import failed"));
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="border rounded-md p-4 space-y-2">
                <div className="text-sm font-medium text-destructive">Danger zone</div>
                <div className="text-xs text-muted-foreground">Admin only. Clearing local finance affects fallback-mode records on this device.</div>
                <Button variant="outline" className="text-destructive" onClick={clearFinanceLocal} disabled={!isAdmin}>
                  <Trash2 className="h-4 w-4" /> Clear finance (local)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label className="text-xs">{label}</Label>{children}</div>;
}
