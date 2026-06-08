import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, FlaskConical, Trash2, Pencil, FileText, Printer, Search } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DateRangeFilter, type DateRange, rangeStart } from "@/components/app/DateRangeFilter";
import { SearchSelect } from "@/components/app/SearchSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { logAuditEvent } from "@/lib/audit";

export const Route = createFileRoute("/lab-reports")({
  head: () => ({ meta: [{ title: "Lab — KPC-MS" }] }),
  component: () => <AppShell><LabsPage /></AppShell>,
});

function LabsPage() {
  const [tab, setTab] = useState("requests");

  const { data: caps } = useQuery({
    queryKey: ["lab-caps"],
    retry: false,
    queryFn: async () => {
      const exists = async (table: string) => {
        const { error } = await (supabase as any).from(table).select("*").limit(1);
        if (!error) return true;
        if (String((error as any).message || "").toLowerCase().includes("could not find the table")) return false;
        return true;
      };
      const [tests, packages, packageItems, orders, orderItems, samples, results] = await Promise.all([
        exists("lab_tests"),
        exists("lab_test_packages"),
        exists("lab_test_package_items"),
        exists("lab_orders"),
        exists("lab_order_items"),
        exists("lab_samples"),
        exists("lab_results"),
      ]);
      return { tests, packages, packageItems, orders, orderItems, samples, results };
    },
  });

  const ready =
    !!caps?.tests &&
    !!caps?.packages &&
    !!caps?.packageItems &&
    !!caps?.orders &&
    !!caps?.orderItems &&
    !!caps?.samples &&
    !!caps?.results;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lab</h1>
          <p className="text-sm text-muted-foreground">Diagnostic tests and results.</p>
        </div>
      </div>

      {!ready && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lab database not set up</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apply the Supabase migration: supabase/migrations/20260521160000_lab_module.sql
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="requests">Test requests</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="results">Result entry</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="tests">Test management</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="legacy">Legacy</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          {ready ? <RequestsPanel /> : <LegacyPanel />}
        </TabsContent>
        <TabsContent value="samples">
          {ready ? <SamplesPanel /> : <LegacyPanel />}
        </TabsContent>
        <TabsContent value="results">
          {ready ? <ResultsPanel /> : <LegacyPanel />}
        </TabsContent>
        <TabsContent value="reports">
          {ready ? <ReportsPanel /> : <LegacyPanel />}
        </TabsContent>
        <TabsContent value="tests">
          {caps?.tests ? <TestsPanel /> : <LegacyPanel />}
        </TabsContent>
        <TabsContent value="packages">
          {caps?.packages && caps?.packageItems && caps?.tests ? <PackagesPanel /> : <LegacyPanel />}
        </TabsContent>
        <TabsContent value="legacy">
          <LegacyPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function statusClass(s: string) {
  const v = String(s || "").replaceAll("_", "-");
  if (v === "completed") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (v === "cancelled") return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
  if (v === "in-progress") return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
  return "bg-secondary text-secondary-foreground";
}

const DEPARTMENTS = ["Hematology", "Biochemistry", "Microbiology", "Pathology", "General"];
const PRIORITIES = ["normal", "urgent"];
const SAMPLE_STATUSES = ["pending", "collected", "received", "rejected"];

function TestsPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();

  const { data, isLoading } = useQuery({
    queryKey: ["lab-tests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lab_tests")
        .select("*")
        .order("department", { ascending: true })
        .order("name", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const qq = q.trim().toLowerCase();
    return list.filter((t: any) => {
      if (dept !== "all" && String(t.department || "") !== dept) return false;
      if (!qq) return true;
      return (
        String(t.name || "").toLowerCase().includes(qq) ||
        String(t.code || "").toLowerCase().includes(qq) ||
        String(t.department || "").toLowerCase().includes(qq)
      );
    });
  }, [data, dept, q]);

  const remove = async (id: string) => {
    if (!confirm("Delete this test?")) return;
    const { error } = await (supabase as any).from("lab_tests").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["lab-tests"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search tests…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New test
        </Button>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0 overflow-auto">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FlaskConical className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No tests found.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left font-medium px-4 py-3">Test</th>
                  <th className="text-left font-medium px-4 py-3">Department</th>
                  <th className="text-left font-medium px-4 py-3">Ref</th>
                  <th className="text-right font-medium px-4 py-3">Price</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.code || "—"}{t.unit ? ` · ${t.unit}` : ""}</div>
                    </td>
                    <td className="px-4 py-3">{t.department || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.ref_low != null || t.ref_high != null
                        ? `${t.ref_low ?? "—"} – ${t.ref_high ?? "—"}${t.ref_text ? ` (${t.ref_text})` : ""}`
                        : (t.ref_text ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-right">{Number(t.price ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <TestDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["lab-tests"] })}
      />
    </div>
  );
}

function TestDialog({ open, onOpenChange, initial, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void }) {
  const empty = {
    code: "",
    name: "",
    department: "Hematology",
    specimen: "",
    unit: "",
    ref_low: "",
    ref_high: "",
    ref_text: "",
    price: "0",
    active: true,
  };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? {
      ...initial,
      code: initial.code ?? "",
      specimen: initial.specimen ?? "",
      unit: initial.unit ?? "",
      ref_low: initial.ref_low ?? "",
      ref_high: initial.ref_high ?? "",
      ref_text: initial.ref_text ?? "",
      price: String(initial.price ?? 0),
      active: initial.active ?? true,
    } : empty);
  }, [open, initial]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Test name required");
    setBusy(true);
    const payload = {
      code: String(form.code || "").trim() || null,
      name: String(form.name || "").trim(),
      department: String(form.department || "General"),
      specimen: String(form.specimen || "").trim() || null,
      unit: String(form.unit || "").trim() || null,
      ref_low: form.ref_low === "" ? null : Number(form.ref_low),
      ref_high: form.ref_high === "" ? null : Number(form.ref_high),
      ref_text: String(form.ref_text || "").trim() || null,
      price: Number(form.price || 0) || 0,
      active: !!form.active,
    };
    const { error } = form.id
      ? await (supabase as any).from("lab_tests").update(payload).eq("id", form.id)
      : await (supabase as any).from("lab_tests").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit test" : "New test"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code">
            <Input value={form.code} onChange={(e) => setForm((s: any) => ({ ...s, code: e.target.value }))} placeholder="HB, CBC…" />
          </Field>
          <Field label="Department">
            <Select value={form.department} onValueChange={(v) => setForm((s: any) => ({ ...s, department: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Test name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm((s: any) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Field label="Specimen">
            <Input value={form.specimen} onChange={(e) => setForm((s: any) => ({ ...s, specimen: e.target.value }))} placeholder="Blood, Urine…" />
          </Field>
          <Field label="Unit">
            <Input value={form.unit} onChange={(e) => setForm((s: any) => ({ ...s, unit: e.target.value }))} placeholder="mg/dL…" />
          </Field>
          <Field label="Ref low">
            <Input type="number" value={form.ref_low} onChange={(e) => setForm((s: any) => ({ ...s, ref_low: e.target.value }))} />
          </Field>
          <Field label="Ref high">
            <Input type="number" value={form.ref_high} onChange={(e) => setForm((s: any) => ({ ...s, ref_high: e.target.value }))} />
          </Field>
          <Field label="Ref note" className="sm:col-span-2">
            <Input value={form.ref_text} onChange={(e) => setForm((s: any) => ({ ...s, ref_text: e.target.value }))} placeholder="Adult male, fasting…" />
          </Field>
          <Field label="Price">
            <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm((s: any) => ({ ...s, price: e.target.value }))} />
          </Field>
          <Field label="Active" className="flex items-center gap-2 pt-6">
            <Checkbox checked={!!form.active} onCheckedChange={(v) => setForm((s: any) => ({ ...s, active: !!v }))} />
            <span className="text-sm">Available</span>
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

function PackagesPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();

  const { data: tests } = useQuery({
    queryKey: ["lab-tests-min"],
    queryFn: async () => (await (supabase as any).from("lab_tests").select("id, name, department, price, unit, ref_low, ref_high, ref_text").order("name")).data ?? [],
  });

  const { data: packages, isLoading } = useQuery({
    queryKey: ["lab-packages"],
    queryFn: async () => {
      const [p, items] = await Promise.all([
        (supabase as any).from("lab_test_packages").select("*").order("name").limit(2000),
        (supabase as any).from("lab_test_package_items").select("package_id, test_id").limit(20000),
      ]);
      if (p.error) throw p.error;
      if (items.error) throw items.error;
      const byPkg: Record<string, string[]> = {};
      (items.data ?? []).forEach((it: any) => {
        if (!byPkg[it.package_id]) byPkg[it.package_id] = [];
        byPkg[it.package_id].push(it.test_id);
      });
      return (p.data ?? []).map((pkg: any) => ({ ...pkg, test_ids: byPkg[pkg.id] ?? [] }));
    },
  });

  const filtered = useMemo(() => {
    const list = packages ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((p: any) => String(p.name || "").toLowerCase().includes(qq));
  }, [packages, q]);

  const remove = async (id: string) => {
    if (!confirm("Delete this package?")) return;
    const { error } = await (supabase as any).from("lab_test_packages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["lab-packages"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search packages…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New package
        </Button>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0 overflow-auto">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No packages</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((p: any) => {
                const names =
                  (p.test_ids ?? [])
                    .map((id: string) => tests?.find((t: any) => t.id === id)?.name)
                    .filter(Boolean)
                    .slice(0, 4)
                    .join(", ") || "—";
                const extra = Math.max(0, (p.test_ids ?? []).length - 4);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{names}{extra ? ` +${extra}` : ""}</div>
                    </div>
                    <div className="text-sm">{Number(p.price ?? 0).toFixed(2)}</div>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <PackageDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        tests={tests ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["lab-packages"] })}
      />
    </div>
  );
}

function PackageDialog({ open, onOpenChange, initial, tests, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: any; tests: any[]; onSaved?: () => void }) {
  const empty = { name: "", department: "", price: "0", active: true, test_ids: [] as string[] };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...initial, price: String(initial.price ?? 0), test_ids: initial.test_ids ?? [] } : empty);
    setQ("");
  }, [open, initial]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return tests;
    return tests.filter((t: any) => String(t.name || "").toLowerCase().includes(qq) || String(t.department || "").toLowerCase().includes(qq));
  }, [q, tests]);

  const toggle = (id: string) => {
    setForm((s: any) => {
      const set = new Set<string>(s.test_ids ?? []);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...s, test_ids: Array.from(set) };
    });
  };

  const save = async () => {
    if (!String(form.name || "").trim()) return toast.error("Package name required");
    if ((form.test_ids ?? []).length === 0) return toast.error("Select at least one test");
    setBusy(true);
    const payload = {
      name: String(form.name || "").trim(),
      department: String(form.department || "").trim() || null,
      price: Number(form.price || 0) || 0,
      active: !!form.active,
    };
    let pkgId = form.id as string | undefined;
    const res = pkgId
      ? await (supabase as any).from("lab_test_packages").update(payload).eq("id", pkgId).select("id").single()
      : await (supabase as any).from("lab_test_packages").insert(payload).select("id").single();
    if (res.error) {
      setBusy(false);
      return toast.error(res.error.message);
    }
    pkgId = res.data?.id ?? pkgId;
    await (supabase as any).from("lab_test_package_items").delete().eq("package_id", pkgId);
    const rows = Array.from(new Set<string>(form.test_ids ?? [])).map((tid) => ({ package_id: pkgId, test_id: tid }));
    const ins = await (supabase as any).from("lab_test_package_items").insert(rows);
    setBusy(false);
    if (ins.error) return toast.error(ins.error.message);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit package" : "New package"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm((s: any) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Field label="Department">
            <Input value={form.department ?? ""} onChange={(e) => setForm((s: any) => ({ ...s, department: e.target.value }))} placeholder="Optional" />
          </Field>
          <Field label="Price">
            <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm((s: any) => ({ ...s, price: e.target.value }))} />
          </Field>
          <Field label="Tests *" className="sm:col-span-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search tests…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="mt-2 border rounded-md max-h-[45vh] overflow-auto">
              <ul className="divide-y">
                {filtered.map((t: any) => {
                  const checked = (form.test_ids ?? []).includes(t.id);
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                      <Checkbox checked={checked} onCheckedChange={() => toggle(t.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{t.department || "—"}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{Number(t.price ?? 0).toFixed(2)}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
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

function RequestsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");

  const { data: tests } = useQuery({
    queryKey: ["lab-tests-min-req"],
    queryFn: async () => (await (supabase as any).from("lab_tests").select("id, name, department, unit, ref_low, ref_high, ref_text, price, active").eq("active", true).order("name").limit(5000)).data ?? [],
  });

  const { data: packages } = useQuery({
    queryKey: ["lab-packages-min-req"],
    queryFn: async () => (await (supabase as any).from("lab_test_packages").select("id, name, price, active").eq("active", true).order("name").limit(2000)).data ?? [],
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["lab-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lab_orders")
        .select("*, patients(full_name, phone), doctors(full_name), lab_samples(id, barcode, status, collected_at)")
        .order("ordered_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = orders ?? [];
    const qq = q.trim().toLowerCase();
    return list.filter((o: any) => {
      if (status !== "all" && String(o.status || "") !== status) return false;
      if (priority !== "all" && String(o.priority || "") !== priority) return false;
      if (!qq) return true;
      const pat = String(o.patients?.full_name ?? "").toLowerCase();
      const phone = String(o.patients?.phone ?? "").toLowerCase();
      const doc = String(o.doctors?.full_name ?? "").toLowerCase();
      const barcode = String(o.lab_samples?.barcode ?? "").toLowerCase();
      return pat.includes(qq) || phone.includes(qq) || doc.includes(qq) || barcode.includes(qq) || String(o.id ?? "").toLowerCase().includes(qq);
    });
  }, [orders, priority, q, status]);

  const cancelOrder = async (id: string) => {
    if (!confirm("Cancel this request?")) return;
    const { error } = await (supabase as any).from("lab_orders").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled");
    qc.invalidateQueries({ queryKey: ["lab-orders"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search patient, phone, barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {["requested", "collected", "in_progress", "verified", "completed", "cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New request
        </Button>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No requests</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((o: any) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {o.patients?.full_name ?? "—"}{" "}
                      <span className={"ml-2 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase " + (o.priority === "urgent" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" : "bg-secondary text-secondary-foreground")}>
                        {o.priority ?? "normal"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {o.patients?.phone ?? "—"} · {new Date(o.ordered_at).toLocaleString()} · {o.doctors?.full_name ?? "—"}
                      {o.lab_samples?.barcode ? ` · ${o.lab_samples.barcode}` : ""}
                    </div>
                  </div>
                  <span className={"text-[11px] px-2 py-0.5 rounded-full capitalize " + statusClass(String(o.status || ""))}>
                    {String(o.status || "").replace("_", "-")}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)} disabled={o.status === "cancelled" || o.status === "completed"}>
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RequestDialog
        open={open}
        onOpenChange={setOpen}
        tests={tests ?? []}
        packages={packages ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["lab-orders"] });
          qc.invalidateQueries({ queryKey: ["lab-order-items"] });
          qc.invalidateQueries({ queryKey: ["lab-samples"] });
        }}
      />
    </div>
  );
}

function RequestDialog({ open, onOpenChange, tests, packages, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; tests: any[]; packages: any[]; onSaved?: () => void }) {
  const empty = { patient_id: "", doctor_id: "", priority: "normal", notes: "", test_ids: [] as string[], package_ids: [] as string[] };
  const [form, setForm] = useState<any>(empty);
  const [qTest, setQTest] = useState("");
  const [qPkg, setQPkg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(empty);
  }, [open]);

  const { data: patients } = useQuery({
    queryKey: ["patients-min-lab"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name, phone").order("full_name").limit(5000)).data ?? [],
  });

  const { data: doctors } = useQuery({
    queryKey: ["doctors-min-lab"],
    queryFn: async () => (await supabase.from("doctors").select("id, full_name").order("full_name").limit(2000)).data ?? [],
  });

  const testsFiltered = useMemo(() => {
    const qq = qTest.trim().toLowerCase();
    if (!qq) return tests;
    return tests.filter((t: any) => String(t.name || "").toLowerCase().includes(qq) || String(t.department || "").toLowerCase().includes(qq));
  }, [qTest, tests]);

  const pkgsFiltered = useMemo(() => {
    const qq = qPkg.trim().toLowerCase();
    if (!qq) return packages;
    return packages.filter((p: any) => String(p.name || "").toLowerCase().includes(qq));
  }, [packages, qPkg]);

  const toggleId = (k: "test_ids" | "package_ids", id: string) => {
    setForm((s: any) => {
      const set = new Set<string>(s[k] ?? []);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...s, [k]: Array.from(set) };
    });
  };

  const save = async () => {
    if (!form.patient_id) return toast.error("Patient required");
    if ((form.test_ids ?? []).length === 0 && (form.package_ids ?? []).length === 0) return toast.error("Select at least one test or package");
    setBusy(true);
    const orderRes = await (supabase as any).from("lab_orders").insert({
      patient_id: form.patient_id,
      doctor_id: form.doctor_id || null,
      priority: form.priority || "normal",
      status: "requested",
      notes: String(form.notes || "").trim() || null,
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    }).select("id").single();
    if (orderRes.error) {
      setBusy(false);
      return toast.error(orderRes.error.message);
    }
    const orderId = orderRes.data.id as string;

    const pkgTestsRes =
      (form.package_ids ?? []).length
        ? await (supabase as any)
            .from("lab_test_package_items")
            .select("test_id, lab_tests(id, name, department, unit, ref_low, ref_high, ref_text, price)")
            .in("package_id", form.package_ids)
            .limit(20000)
        : ({ data: [], error: null } as any);
    if (pkgTestsRes.error) {
      setBusy(false);
      return toast.error(pkgTestsRes.error.message);
    }

    const byId = new Map<string, any>();
    tests.forEach((t: any) => byId.set(t.id, t));
    (pkgTestsRes.data ?? []).forEach((r: any) => {
      if (r.lab_tests?.id) byId.set(r.lab_tests.id, r.lab_tests);
    });

    const allIds = Array.from(new Set<string>([...(form.test_ids ?? []), ...(pkgTestsRes.data ?? []).map((r: any) => r.test_id)].filter(Boolean)));
    const rows = allIds
      .map((id: string) => byId.get(id))
      .filter(Boolean)
      .map((t: any) => ({
        order_id: orderId,
        test_id: t.id ?? null,
        test_name: t.name,
        department: t.department ?? null,
        unit: t.unit ?? null,
        ref_low: t.ref_low ?? null,
        ref_high: t.ref_high ?? null,
        ref_text: t.ref_text ?? null,
        price: Number(t.price ?? 0) || 0,
        status: "pending",
      }));
    const itemsRes = await (supabase as any).from("lab_order_items").insert(rows);
    if (itemsRes.error) {
      setBusy(false);
      return toast.error(itemsRes.error.message);
    }
    const sampleRes = await (supabase as any).from("lab_samples").insert({ order_id: orderId, status: "pending" });
    setBusy(false);
    if (sampleRes.error) return toast.error(sampleRes.error.message);
    toast.success("Request created");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New lab test request</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Patient *" className="sm:col-span-2">
            <SearchSelect
              value={form.patient_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, patient_id: v }))}
              placeholder="Select patient"
              options={(patients ?? []).map((p: any) => ({ value: p.id, label: `${p.full_name}${p.phone ? ` · ${p.phone}` : ""}` }))}
            />
          </Field>
          <Field label="Doctor">
            <SearchSelect
              value={form.doctor_id}
              onValueChange={(v) => setForm((s: any) => ({ ...s, doctor_id: v }))}
              placeholder="Optional"
              options={(doctors ?? []).map((d: any) => ({ value: d.id, label: d.full_name }))}
            />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onValueChange={(v) => setForm((s: any) => ({ ...s, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Packages" className="sm:col-span-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search packages…" value={qPkg} onChange={(e) => setQPkg(e.target.value)} />
            </div>
            <div className="mt-2 border rounded-md max-h-44 overflow-auto">
              <ul className="divide-y">
                {pkgsFiltered.map((p: any) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                    <Checkbox checked={(form.package_ids ?? []).includes(p.id)} onCheckedChange={() => toggleId("package_ids", p.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{Number(p.price ?? 0).toFixed(2)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </Field>
          <Field label="Tests" className="sm:col-span-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search tests…" value={qTest} onChange={(e) => setQTest(e.target.value)} />
            </div>
            <div className="mt-2 border rounded-md max-h-64 overflow-auto">
              <ul className="divide-y">
                {testsFiltered.map((t: any) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                    <Checkbox checked={(form.test_ids ?? []).includes(t.id)} onCheckedChange={() => toggleId("test_ids", t.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.department || "—"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{Number(t.price ?? 0).toFixed(2)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Create request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SamplesPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>();

  const { data, isLoading } = useQuery({
    queryKey: ["lab-samples"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lab_samples")
        .select("*, lab_orders(priority, status, ordered_at, patients(full_name, phone))")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((s: any) => {
      const pat = String(s.lab_orders?.patients?.full_name ?? "").toLowerCase();
      const phone = String(s.lab_orders?.patients?.phone ?? "").toLowerCase();
      const bc = String(s.barcode ?? "").toLowerCase();
      return pat.includes(qq) || phone.includes(qq) || bc.includes(qq) || String(s.order_id ?? "").toLowerCase().includes(qq);
    });
  }, [data, q]);

  const genBarcode = () => `LAB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  const ensureBarcode = async (row: any) => {
    if (row.barcode) return row.barcode as string;
    const code = genBarcode();
    const { error } = await (supabase as any).from("lab_samples").update({ barcode: code }).eq("id", row.id);
    if (error) throw error;
    return code;
  };

  const updateStatus = async (row: any, next: string) => {
    try {
      const barcode = await ensureBarcode(row);
      const patch: any = { status: next, barcode };
      if (next === "collected") patch.collected_at = new Date().toISOString();
      const { error } = await (supabase as any).from("lab_samples").update(patch).eq("id", row.id);
      if (error) return toast.error(error.message);
      const orderStatus = next === "collected" ? "collected" : next === "received" ? "in_progress" : undefined;
      if (orderStatus) await (supabase as any).from("lab_orders").update({ status: orderStatus }).eq("id", row.order_id);
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["lab-samples"] });
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
    } catch (e: any) {
      toast.error(String(e?.message || e));
    }
  };

  const openLabel = async (row: any) => {
    try {
      const barcode = await ensureBarcode(row);
      setSelected({ ...row, barcode });
      setOpen(true);
      qc.invalidateQueries({ queryKey: ["lab-samples"] });
    } catch (e: any) {
      toast.error(String(e?.message || e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search barcode, patient, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No samples</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((s: any) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.lab_orders?.patients?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.lab_orders?.patients?.phone ?? "—"} · {s.barcode ? s.barcode : "No barcode"} · {String(s.status || "pending")}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openLabel(s)}>Label</Button>
                  <Select value={String(s.status || "pending")} onValueChange={(v) => updateStatus(s, v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SAMPLE_STATUSES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <LabelDialog open={open} onOpenChange={setOpen} sample={selected} />
    </div>
  );
}

function LabelDialog({ open, onOpenChange, sample }: { open: boolean; onOpenChange: (v: boolean) => void; sample?: any }) {
  const print = () => {
    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(16);
    doc.text("Lab sample label", 14, 16);
    doc.setFontSize(10);
    autoTable(doc, {
      startY: 24,
      head: [["Field", "Value"]],
      body: [
        ["Barcode", sample?.barcode ?? "—"],
        ["Patient", sample?.lab_orders?.patients?.full_name ?? "—"],
        ["Phone", sample?.lab_orders?.patients?.phone ?? "—"],
        ["Priority", String(sample?.lab_orders?.priority ?? "normal").toUpperCase()],
        ["Status", String(sample?.status ?? "pending")],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Label</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="text-sm font-medium">Barcode</div>
          <div className="font-mono text-lg tracking-wider">{sample?.barcode ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            {sample?.lab_orders?.patients?.full_name ?? "—"}{sample?.lab_orders?.patients?.phone ? ` · ${sample.lab_orders.patients.phone}` : ""}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={print}><Printer className="h-4 w-4" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultsPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<any>();

  const { data, isLoading } = useQuery({
    queryKey: ["lab-order-items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lab_order_items")
        .select("*, lab_orders(id, patient_id, ordered_at, priority, status, patients(full_name, phone)), lab_results(value_text, value_numeric, flag, remarks, entered_at)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((r: any) => {
      const pat = String(r.lab_orders?.patients?.full_name ?? "").toLowerCase();
      const phone = String(r.lab_orders?.patients?.phone ?? "").toLowerCase();
      const test = String(r.test_name ?? "").toLowerCase();
      return pat.includes(qq) || phone.includes(qq) || test.includes(qq) || String(r.order_id ?? "").toLowerCase().includes(qq);
    });
  }, [data, q]);

  const badge = (flag: string) => {
    const f = String(flag || "").toLowerCase();
    if (f === "high") return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
    if (f === "low") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    if (f === "critical") return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
    if (f === "normal") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    return "bg-secondary text-secondary-foreground";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search patient, phone, test…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No items</div>
          ) : (
            <ul className="divide-y">
              {filtered.slice(0, 150).map((r: any) => {
                const val = r.lab_results?.value_numeric ?? r.lab_results?.value_text ?? "";
                const flag = r.lab_results?.flag ?? "";
                return (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.test_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.lab_orders?.patients?.full_name ?? "—"} · {r.lab_orders?.patients?.phone ?? "—"}
                      </div>
                    </div>
                    <div className="text-sm font-mono">{val !== "" ? String(val) : "—"}{r.unit ? ` ${r.unit}` : ""}</div>
                    <span className={"text-[11px] px-2 py-0.5 rounded-full capitalize " + badge(flag)}>{flag || "pending"}</span>
                    <Button size="sm" variant="outline" onClick={() => { setItem(r); setOpen(true); }}>
                      {r.lab_results ? "Edit" : "Enter"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ResultDialog
        open={open}
        onOpenChange={setOpen}
        item={item}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["lab-order-items"] });
          qc.invalidateQueries({ queryKey: ["lab-orders"] });
        }}
      />
    </div>
  );
}

function ResultDialog({ open, onOpenChange, item, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; item?: any; onSaved?: () => void }) {
  const [num, setNum] = useState("");
  const [txt, setTxt] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = item?.lab_results;
    setNum(r?.value_numeric != null ? String(r.value_numeric) : "");
    setTxt(r?.value_text ?? "");
    setRemarks(r?.remarks ?? "");
  }, [open, item]);

  const patientId = item?.lab_orders?.patient_id ?? null;
  const testName = item?.test_name ?? "";

  const { data: history } = useQuery({
    queryKey: ["lab-history", patientId, testName],
    enabled: !!open && !!patientId && !!testName,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lab_order_items")
        .select("test_name, lab_orders(patient_id, ordered_at), lab_results(value_text, value_numeric, flag, entered_at)")
        .eq("test_name", testName)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.lab_orders?.patient_id === patientId && r.lab_results).slice(0, 5);
    },
  });

  const calcFlag = (n: number) => {
    const low = item?.ref_low;
    const high = item?.ref_high;
    if (low != null && Number.isFinite(Number(low)) && n < Number(low)) return "low";
    if (high != null && Number.isFinite(Number(high)) && n > Number(high)) return "high";
    return "normal";
  };

  const save = async () => {
    if (!item?.id) return;
    if (!num.trim() && !txt.trim()) return toast.error("Enter result value");
    setBusy(true);
    const numeric = num.trim() ? Number(num) : null;
    const value_text = numeric == null ? (txt.trim() || null) : null;
    const value_numeric = numeric == null || Number.isNaN(numeric) ? null : numeric;
    const flag = value_numeric != null ? calcFlag(value_numeric) : null;
    const payload = {
      order_item_id: item.id,
      value_text,
      value_numeric,
      flag,
      remarks: remarks.trim() || null,
      entered_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      entered_at: new Date().toISOString(),
    };
    const existing = item.lab_results ? await (supabase as any).from("lab_results").update(payload).eq("order_item_id", item.id) : await (supabase as any).from("lab_results").insert(payload);
    if (existing.error) {
      setBusy(false);
      return toast.error(existing.error.message);
    }
    await (supabase as any).from("lab_order_items").update({ status: "entered" }).eq("id", item.id);
    setBusy(false);
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  const ref =
    item?.ref_low != null || item?.ref_high != null
      ? `${item?.ref_low ?? "—"} – ${item?.ref_high ?? "—"}${item?.ref_text ? ` (${item.ref_text})` : ""}`
      : (item?.ref_text ?? "—");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Result entry</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="text-sm font-medium">{item?.test_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{item?.lab_orders?.patients?.full_name ?? "—"}{item?.lab_orders?.patients?.phone ? ` · ${item.lab_orders.patients.phone}` : ""}</div>
              <div className="text-xs text-muted-foreground">Ref: {ref}</div>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Numeric value${item?.unit ? ` (${item.unit})` : ""}`}>
              <Input type="number" value={num} onChange={(e) => { setNum(e.target.value); if (e.target.value) setTxt(""); }} />
            </Field>
            <Field label="Text value">
              <Input value={txt} onChange={(e) => { setTxt(e.target.value); if (e.target.value) setNum(""); }} placeholder="Positive / Negative / …" />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>
          {!!history?.length && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Previous results</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {history.map((h: any, i: number) => {
                  const v = h.lab_results?.value_numeric ?? h.lab_results?.value_text ?? "";
                  const f = h.lab_results?.flag ?? "";
                  return (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">{h.lab_results?.entered_at ? new Date(h.lab_results.entered_at).toLocaleString() : "—"}</div>
                      <div className="font-mono">{String(v)}{item?.unit ? ` ${item.unit}` : ""}</div>
                      <div className="text-xs uppercase text-muted-foreground">{String(f || "—")}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportsPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<any>();

  const { data, isLoading } = useQuery({
    queryKey: ["lab-orders-reports"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lab_orders")
        .select("*, patients(full_name, phone), doctors(full_name), lab_samples(barcode, status)")
        .in("status", ["in_progress", "verified", "completed"])
        .order("ordered_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((o: any) => {
      const pat = String(o.patients?.full_name ?? "").toLowerCase();
      const phone = String(o.patients?.phone ?? "").toLowerCase();
      const bc = String(o.lab_samples?.barcode ?? "").toLowerCase();
      return pat.includes(qq) || phone.includes(qq) || bc.includes(qq) || String(o.id ?? "").toLowerCase().includes(qq);
    });
  }, [data, q]);

  const loadOrderDetails = async (orderId: string) => {
    const [items, sample] = await Promise.all([
      (supabase as any)
        .from("lab_order_items")
        .select("*, lab_results(value_text, value_numeric, flag, remarks)")
        .eq("order_id", orderId)
        .order("department", { ascending: true })
        .order("test_name", { ascending: true }),
      (supabase as any).from("lab_samples").select("barcode, status, collected_at").eq("order_id", orderId).maybeSingle(),
    ]);
    if (items.error) throw items.error;
    return { items: items.data ?? [], sample: sample.data ?? null };
  };

  const exportPDF = async (o: any) => {
    try {
      const details = await loadOrderDetails(o.id);
      const doc = new jsPDF({ orientation: "portrait" });
      doc.setFontSize(16);
      doc.text("Lab report", 14, 16);
      doc.setFontSize(10);
      const meta = [
        ["Patient", o.patients?.full_name ?? "—"],
        ["Phone", o.patients?.phone ?? "—"],
        ["Doctor", o.doctors?.full_name ?? "—"],
        ["Priority", String(o.priority || "normal").toUpperCase()],
        ["Ordered at", o.ordered_at ? new Date(o.ordered_at).toLocaleString() : "—"],
        ["Barcode", details.sample?.barcode ?? "—"],
        ["Verified by", o.verified_by_name ?? "—"],
      ];
      autoTable(doc, { startY: 22, head: [["Field", "Value"]], body: meta, styles: { fontSize: 9 }, headStyles: { fillColor: [37, 99, 235] } });
      const startY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 70;
      const rows = details.items.map((it: any) => {
        const v = it.lab_results?.value_numeric ?? it.lab_results?.value_text ?? "";
        const ref =
          it.ref_low != null || it.ref_high != null
            ? `${it.ref_low ?? "—"} – ${it.ref_high ?? "—"}`
            : (it.ref_text ?? "");
        const flag = it.lab_results?.flag ?? "";
        return [it.department ?? "—", it.test_name ?? "—", String(v ?? ""), it.unit ?? "", ref, String(flag ?? "").toUpperCase()];
      });
      autoTable(doc, {
        startY,
        head: [["Dept", "Test", "Result", "Unit", "Ref", "Flag"]],
        body: rows.length ? rows : [["—", "—", "—", "—", "—", "—"]],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
        didParseCell: (d: any) => {
          if (d.section !== "body") return;
          if (d.column.index !== 5) return;
          const v = String(d.cell.raw || "").toLowerCase();
          if (v === "HIGH".toLowerCase() || v === "LOW".toLowerCase() || v === "CRITICAL".toLowerCase()) {
            d.cell.styles.textColor = [185, 28, 28];
            d.cell.styles.fontStyle = "bold";
          }
        },
      });
      doc.save(`lab_report_${String(details.sample?.barcode ?? o.id).replace(/\W+/g, "_")}.pdf`);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(String(e?.message || e));
    }
  };

  const verify = async (orderId: string, name: string) => {
    const { error } = await (supabase as any).from("lab_orders").update({
      status: "verified",
      verified_by_name: name.trim() || null,
      verified_at: new Date().toISOString(),
    }).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("Verified");
    qc.invalidateQueries({ queryKey: ["lab-orders-reports"] });
    qc.invalidateQueries({ queryKey: ["lab-orders"] });
  };

  const shareLinks = (o: any) => {
    const text = `Lab report: ${o.patients?.full_name ?? "Patient"} · ${o.lab_samples?.barcode ?? o.id}`;
    const mail = `mailto:?subject=${encodeURIComponent("Lab report")}&body=${encodeURIComponent(text)}`;
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    return { mail, wa };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search patient, phone, barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No reports yet</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((o: any) => {
                const links = shareLinks(o);
                return (
                  <li key={o.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{o.patients?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {o.patients?.phone ?? "—"} · {o.lab_samples?.barcode ?? "—"} · {String(o.status || "").replace("_", " ")}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => exportPDF(o)}>
                      <FileText className="h-4 w-4" /> PDF
                    </Button>
                    <Button size="icon" variant="ghost" asChild>
                      <a href={links.mail}><span className="sr-only">Email</span>@</a>
                    </Button>
                    <Button size="icon" variant="ghost" asChild>
                      <a href={links.wa} target="_blank" rel="noreferrer"><span className="sr-only">WhatsApp</span>W</a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setCurrent(o); setOpen(true); }} disabled={o.status === "verified" || o.status === "completed"}>
                      Verify
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <VerifyDialog open={open} onOpenChange={setOpen} order={current} onVerify={(name) => current?.id && verify(current.id, name)} />
    </div>
  );
}

function VerifyDialog({ open, onOpenChange, order, onVerify }: { open: boolean; onOpenChange: (v: boolean) => void; order?: any; onVerify: (name: string) => void }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName(order?.verified_by_name ?? "");
  }, [open, order]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Verify report</DialogTitle></DialogHeader>
        <Field label="Pathologist / Verified by">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onVerify(name); onOpenChange(false); }}>Verify</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LegacyPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [range, setRange] = useState<DateRange>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["lab-reports", range],
    queryFn: async () => {
      let q = supabase.from("lab_reports").select("*, patients(full_name)").order("ordered_date", { ascending: false });
      const start = rangeStart(range);
      if (start) q = q.gte("ordered_date", start.toISOString().slice(0, 10));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this report?")) return;
    const { error } = await supabase.from("lab_reports").delete().eq("id", id);
    if (error) return toast.error(error.message);
    logAuditEvent({ action: "delete", entity: "lab_reports", entity_id: id, route: "/lab-reports" });
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["lab-reports"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">Legacy lab reports (single-test entries)</div>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <Button onClick={() => { setEditing(undefined); setOpen(true); }}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>
      </div>
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-12 text-center">
              <FlaskConical className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No lab reports yet.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {(data ?? []).map((r: any) => (
                <li key={r.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.test_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.patients?.full_name ?? "—"} · ordered {r.ordered_date}{r.result_date ? ` · result ${r.result_date}` : ""}
                    </div>
                  </div>
                  <span className={"text-[11px] px-2 py-0.5 rounded-full capitalize " + statusClass(r.status)}>{r.status}</span>
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
      <LegacyLabDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["lab-reports"] })}
      />
    </div>
  );
}

function LegacyLabDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved?: () => void;
}) {
  const empty = {
    patient_id: "", test_name: "", ordered_date: new Date().toISOString().slice(0, 10),
    result_date: "", status: "pending", results: "", file_url: "", notes: "",
  };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setForm(initial ?? empty); }, [open, initial]);

  const { data: patients } = useQuery({
    queryKey: ["patients-min"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name")).data ?? [],
  });

  const save = async () => {
    if (!form.patient_id) return toast.error("Patient required");
    if (!form.test_name.trim()) return toast.error("Test name required");
    setBusy(true);
    const { id, patients: _p, ...rest } = form;
    const payload = { ...rest, result_date: rest.result_date || null };
    const { data, error } = id
      ? await supabase.from("lab_reports").update(payload).eq("id", id).select("id").single()
      : await supabase.from("lab_reports").insert(payload).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    logAuditEvent({
      action: id ? "update" : "create",
      entity: "lab_reports",
      entity_id: String((data as any)?.id ?? id ?? ""),
      route: "/lab-reports",
      details: { patient_id: form.patient_id, test_name: form.test_name ?? null, status: form.status },
    });
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? "Edit legacy lab report" : "New legacy lab report"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Patient *" className="sm:col-span-2">
            <SearchSelect
              value={form.patient_id}
              onValueChange={(v) => setForm({ ...form, patient_id: v })}
              placeholder="Select patient"
              options={(patients ?? []).map((p: any) => ({ value: p.id, label: p.full_name }))}
            />
          </Field>
          <Field label="Test name *" className="sm:col-span-2">
            <Input value={form.test_name} onChange={(e) => setForm({ ...form, test_name: e.target.value })} />
          </Field>
          <Field label="Ordered date"><Input type="date" value={form.ordered_date} onChange={(e) => setForm({ ...form, ordered_date: e.target.value })} /></Field>
          <Field label="Result date"><Input type="date" value={form.result_date ?? ""} onChange={(e) => setForm({ ...form, result_date: e.target.value })} /></Field>
          <Field label="Status" className="sm:col-span-2">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["pending", "in-progress", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Results" className="sm:col-span-2">
            <Textarea rows={3} value={form.results ?? ""} onChange={(e) => setForm({ ...form, results: e.target.value })} />
          </Field>
          <Field label="File URL" className="sm:col-span-2">
            <Input value={form.file_url ?? ""} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
