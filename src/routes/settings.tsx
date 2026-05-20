import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";
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

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — MediClinic" }] }),
  component: () => <AppShell><SettingsPage /></AppShell>,
});

type Settings = {
  clinic_name: string;
  clinic_address: string;
  clinic_phone: string;
  clinic_email: string;
  currency: string;
  invoice_prefix: string;
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
  clinic_name: "MediClinic",
  clinic_address: "",
  clinic_phone: "",
  clinic_email: "",
  currency: "NPR",
  invoice_prefix: "INV",
  billable_services: [],
  default_appointment_minutes: 30,
  default_follow_up_channel: "call",
  notify_staff_default: true,
  notify_patient_default: false,
  reminder_days_before: 1,
};

const KEY = "mediclinic.settings";
export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; }
  catch { return DEFAULTS; }
}

function SettingsPage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [s, setS] = useState<Settings>(DEFAULTS);

  useEffect(() => { setS(loadSettings()); }, []);

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(s));
    toast.success("Settings saved");
  };
  const reset = () => { setS(DEFAULTS); localStorage.removeItem(KEY); toast.message("Restored defaults"); };

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
          <Button variant="outline" onClick={reset}>Restore defaults</Button>
          <Button onClick={save}><Save className="h-4 w-4" /> Save changes</Button>
        </div>
      </div>

      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="appointments">Scheduling</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic">
          <Card><CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <Field label="Clinic name"><Input value={s.clinic_name} onChange={(e) => setS({ ...s, clinic_name: e.target.value })} /></Field>
            <Field label="Phone"><Input value={s.clinic_phone} onChange={(e) => setS({ ...s, clinic_phone: e.target.value })} /></Field>
            <Field label="Email" className="sm:col-span-1"><Input type="email" value={s.clinic_email} onChange={(e) => setS({ ...s, clinic_email: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={s.clinic_address} onChange={(e) => setS({ ...s, clinic_address: e.target.value })} /></Field>
          </CardContent></Card>
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
            <Field label="Invoice prefix"><Input value={s.invoice_prefix} onChange={(e) => setS({ ...s, invoice_prefix: e.target.value })} /></Field>
            <div className="sm:col-span-2 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Billable services</div>
                  <div className="text-xs text-muted-foreground">Use these in invoices as quick selectable items.</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
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
      </Tabs>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={"space-y-1.5 " + (className ?? "")}><Label className="text-xs">{label}</Label>{children}</div>;
}
