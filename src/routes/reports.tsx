import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, BarChart3, Printer, Search, CalendarDays } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";
import { loadPatientCodesLocal, patientCodeColumnAvailable } from "@/routes/settings";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — KPC-MS" }] }),
  component: () => <AppShell><ReportsPage /></AppShell>,
});

type ReportKey = "patients" | "appointments" | "invoices" | "prescriptions" | "lab_reports" | "inventory" | "medical_records";

const REPORTS: Record<ReportKey, {
  label: string;
  dateField: string | null;
  select: string;
  columns: { key: string; label: string; format?: (v: any, row: any) => string }[];
}> = {
  patients: {
    label: "Patients",
    dateField: "created_at",
    select: "id, full_name, gender, date_of_birth, phone, email, blood_type, created_at",
    columns: [
      { key: "full_name", label: "Name" },
      { key: "patient_mrn", label: "Patient ID (MRN)" },
      { key: "gender", label: "Gender" },
      { key: "date_of_birth", label: "DOB" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "blood_type", label: "Blood" },
      { key: "created_at", label: "Registered", format: (v) => v ? new Date(v).toLocaleDateString() : "" },
    ],
  },
  appointments: {
    label: "Appointments",
    dateField: "scheduled_at",
    select: "scheduled_at, duration_minutes, status, reason, patients(full_name), doctors(full_name)",
    columns: [
      { key: "scheduled_at", label: "Date", format: (v) => v ? new Date(v).toLocaleString() : "" },
      { key: "patient", label: "Patient", format: (_v, r) => r.patients?.full_name ?? "" },
      { key: "doctor", label: "Doctor", format: (_v, r) => r.doctors?.full_name ?? "" },
      { key: "duration_minutes", label: "Mins" },
      { key: "status", label: "Status" },
      { key: "reason", label: "Reason" },
    ],
  },
  invoices: {
    label: "Billing",
    dateField: "created_at",
    select: "id, invoice_number, patient_id, status, total, paid_amount, due_date, created_at, patients(full_name, phone)",
    columns: [
      { key: "invoice_number", label: "Billing #" },
      { key: "patient", label: "Patient", format: (_v, r) => r.patients?.full_name ?? "" },
      { key: "patient_phone", label: "Phone", format: (_v, r) => r.patients?.phone ?? "" },
      { key: "patient_mrn", label: "Patient ID (MRN)" },
      { key: "services", label: "Services" },
      { key: "total", label: "Total", format: (v) => Number(v ?? 0).toFixed(2) },
      { key: "paid_calc", label: "Paid", format: (v) => Number(v ?? 0).toFixed(2) },
      { key: "due_calc", label: "Due", format: (v) => Number(v ?? 0).toFixed(2) },
      { key: "payment_methods", label: "Paid by", format: (v) => String(v ?? "").toUpperCase() },
      { key: "last_paid_at", label: "Last paid", format: (v) => v ? new Date(v).toLocaleString() : "" },
      { key: "status", label: "Status" },
      { key: "due_date", label: "Due" },
      { key: "created_at", label: "Created", format: (v) => v ? new Date(v).toLocaleDateString() : "" },
    ],
  },
  prescriptions: {
    label: "Prescriptions",
    dateField: "prescribed_date",
    select: "prescribed_date, medication, dosage, frequency, duration, patients(full_name), doctors(full_name)",
    columns: [
      { key: "prescribed_date", label: "Date" },
      { key: "patient", label: "Patient", format: (_v, r) => r.patients?.full_name ?? "" },
      { key: "doctor", label: "Doctor", format: (_v, r) => r.doctors?.full_name ?? "" },
      { key: "medication", label: "Medication" },
      { key: "dosage", label: "Dosage" },
      { key: "frequency", label: "Frequency" },
      { key: "duration", label: "Duration" },
    ],
  },
  lab_reports: {
    label: "Lab",
    dateField: "ordered_date",
    select: "test_name, status, ordered_date, result_date, results, patients(full_name)",
    columns: [
      { key: "ordered_date", label: "Ordered" },
      { key: "patient", label: "Patient", format: (_v, r) => r.patients?.full_name ?? "" },
      { key: "test_name", label: "Test" },
      { key: "status", label: "Status" },
      { key: "result_date", label: "Result Date" },
      { key: "results", label: "Results" },
    ],
  },
  inventory: {
    label: "Inventory",
    dateField: null,
    select: "name, sku, category, quantity, unit, reorder_level, unit_cost, supplier, expiry_date",
    columns: [
      { key: "name", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "quantity", label: "Qty" },
      { key: "unit", label: "Unit" },
      { key: "reorder_level", label: "Reorder" },
      { key: "unit_cost", label: "Cost", format: (v) => Number(v ?? 0).toFixed(2) },
      { key: "supplier", label: "Supplier" },
      { key: "expiry_date", label: "Expiry" },
    ],
  },
  medical_records: {
    label: "Medical Records",
    dateField: "visit_date",
    select: "visit_date, chief_complaint, diagnosis, treatment, patients(full_name)",
    columns: [
      { key: "visit_date", label: "Visit" },
      { key: "patient", label: "Patient", format: (_v, r) => r.patients?.full_name ?? "" },
      { key: "chief_complaint", label: "Complaint" },
      { key: "diagnosis", label: "Diagnosis" },
      { key: "treatment", label: "Treatment" },
    ],
  },
};

function ReportsPage() {
  const [reportKey, setReportKey] = useState<ReportKey>("appointments");
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState("");

  const cfg = REPORTS[reportKey];

  const { data, isLoading } = useQuery({
    queryKey: ["report", reportKey, from, to],
    queryFn: async () => {
      let q: any = (supabase as any).from(reportKey).select(cfg.select);
      if (cfg.dateField) {
        if (cfg.dateField.endsWith("_at")) {
          const end = new Date(to);
          end.setDate(end.getDate() + 1);
          q = q.gte(cfg.dateField, from + "T00:00:00").lt(cfg.dateField, end.toISOString().slice(0, 10) + "T00:00:00");
        } else {
          q = q.gte(cfg.dateField, from).lte(cfg.dateField, to);
        }
      }
      const { data, error } = await q.order(cfg.dateField ?? cfg.columns[0].key, { ascending: false }).limit(1000);
      if (error) throw error;
      const base = data ?? [];
      if (base.length === 0) return base;

      const localPatientCodes = loadPatientCodesLocal();

      const missingTableOrColumn = (err: any) => {
        const code = String((err as any)?.code || "");
        if (code === "42P01" || code === "42703") return true;
        const msg = [
          String((err as any)?.message || ""),
          String((err as any)?.details || ""),
          String((err as any)?.hint || ""),
        ].join(" ").toLowerCase();
        if (msg.includes("could not find the table")) return true;
        if (msg.includes("schema cache") && (msg.includes("table") || msg.includes("column"))) return true;
        if (msg.includes("does not exist") && (msg.includes("table") || msg.includes("column"))) return true;
        return false;
      };

      const dbPatientCodesFor = async (ids: string[]) => {
        const supports = await patientCodeColumnAvailable().catch(() => false);
        if (!supports || ids.length === 0) return {} as Record<string, string>;
        const res = await supabase.from("patients").select("id, patient_code").in("id", ids).limit(10000);
        if (res.error) {
          if (missingTableOrColumn(res.error)) return {} as Record<string, string>;
          throw res.error;
        }
        return Object.fromEntries((res.data ?? []).map((p: any) => [p.id, String(p.patient_code ?? "")]));
      };

      if (reportKey === "patients") {
        const ids = base.map((p: any) => p.id).filter(Boolean);
        const dbCodes = await dbPatientCodesFor(ids);
        return base.map((p: any) => ({
          ...p,
          patient_mrn: dbCodes[p.id] || localPatientCodes[p.id] || "",
        }));
      }

      if (reportKey !== "invoices") return base;

      const ids = base.map((i: any) => i.id).filter(Boolean);
      const itemsRes = await supabase
        .from("invoice_items")
        .select("invoice_id, description, category, quantity")
        .in("invoice_id", ids);
      if (itemsRes.error) throw itemsRes.error;
      const byInv: Record<string, string[]> = {};
      (itemsRes.data ?? []).forEach((it: any) => {
        const invId = it.invoice_id;
        const qty = Number(it.quantity ?? 1);
        const label = `${it.category || "Other"} · ${it.description}${qty > 1 ? ` x${qty}` : ""}`;
        if (!byInv[invId]) byInv[invId] = [];
        byInv[invId].push(label);
      });

      const patientIds = Array.from(new Set(base.map((i: any) => i.patient_id).filter(Boolean)));
      const dbPatientCodes = await dbPatientCodesFor(patientIds);

      const loadLocalFinance = () => {
        if (typeof window === "undefined") return { payments: [] as any[] };
        try {
          const raw = localStorage.getItem("kpcms.finance.local.v1");
          const parsed = raw ? JSON.parse(raw) : {};
          return { payments: parsed.payments ?? [] };
        } catch {
          return { payments: [] as any[] };
        }
      };

      let payments: any[] = [];
      try {
        const payRes = await supabase
          .from("invoice_payments")
          .select("invoice_id, amount, method, paid_at, receipt_no")
          .in("invoice_id", ids)
          .limit(10000);
        if (payRes.error) {
          if (missingTableOrColumn(payRes.error)) {
            payments = loadLocalFinance().payments.filter((p: any) => ids.includes(p.invoice_id));
          } else {
            throw payRes.error;
          }
        } else {
          payments = payRes.data ?? [];
        }
      } catch (e: any) {
        if (missingTableOrColumn(e)) {
          payments = loadLocalFinance().payments.filter((p: any) => ids.includes(p.invoice_id));
        } else {
          throw e;
        }
      }

      const payAgg: Record<string, { paid: number; last_paid_at: string | null; methods: Set<string>; receipts: Set<string> }> = {};
      payments.forEach((p: any) => {
        const invId = String(p.invoice_id || "");
        if (!invId) return;
        if (!payAgg[invId]) payAgg[invId] = { paid: 0, last_paid_at: null, methods: new Set(), receipts: new Set() };
        payAgg[invId].paid += Number(p.amount || 0);
        if (p.method) payAgg[invId].methods.add(String(p.method));
        if (p.receipt_no) payAgg[invId].receipts.add(String(p.receipt_no));
        const ts = p.paid_at ? String(p.paid_at) : "";
        if (ts && (!payAgg[invId].last_paid_at || ts > String(payAgg[invId].last_paid_at))) {
          payAgg[invId].last_paid_at = ts;
        }
      });

      return base.map((inv: any) => {
        const a = payAgg[inv.id];
        const paidCalc = a ? a.paid : Number(inv.paid_amount ?? 0);
        const dueCalc = Math.max(0, Number(inv.total ?? 0) - Number(paidCalc ?? 0));
        const method = a ? Array.from(a.methods).join(", ") : "";
        const mrn = dbPatientCodes[inv.patient_id] || localPatientCodes[inv.patient_id] || "";
        return {
          ...inv,
          services: (byInv[inv.id] ?? []).join(", "),
          patient_mrn: mrn,
          paid_calc: paidCalc,
          due_calc: dueCalc,
          payment_methods: method,
          last_paid_at: a?.last_paid_at ?? null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row: any) =>
      cfg.columns.some((c) => {
        const v = c.format ? c.format(row[c.key], row) : (row[c.key] ?? "");
        return String(v ?? "").toLowerCase().includes(q);
      }),
    );
  }, [data, cfg, search]);

  const rows: any[][] = useMemo(
    () =>
      (filtered ?? []).map((row: any) =>
        cfg.columns.map((c) => (c.format ? c.format(row[c.key], row) : (row[c.key] ?? ""))),
      ),
    [filtered, cfg],
  );

  const fileBase = `${cfg.label.replace(/\W+/g, "_")}_${from}_to_${to}`;

  const preset = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 86400000);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  const summary = useMemo(() => {
    const list: any[] = filtered ?? [];
    if (reportKey === "invoices") {
      const total = list.reduce((s, r: any) => s + Number(r.total ?? 0), 0);
      const paid = list.reduce((s, r: any) => s + Number(r.paid_calc ?? r.paid_amount ?? 0), 0);
      const due = list.reduce((s, r: any) => s + Math.max(0, Number(r.due_calc ?? (Number(r.total ?? 0) - Number(r.paid_calc ?? r.paid_amount ?? 0)))), 0);
      const partial = list.filter((r: any) => String(r.status || "").toLowerCase() === "partial").length;
      return [
        { title: "Bills", value: String(list.length), sub: partial ? `${partial} partial` : undefined },
        { title: "Billed", value: total.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
        { title: "Paid", value: paid.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
        { title: "Due", value: due.toLocaleString("en-IN", { maximumFractionDigits: 2 }) },
      ];
    }
    if (reportKey === "appointments") {
      const by: Record<string, number> = {};
      list.forEach((r: any) => {
        const k = String(r.status || "unknown");
        by[k] = (by[k] ?? 0) + 1;
      });
      const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
      return [
        { title: "Appointments", value: String(list.length), sub: top ? `${top[0]}: ${top[1]}` : undefined },
      ];
    }
    if (reportKey === "patients") {
      const by: Record<string, number> = {};
      list.forEach((r: any) => {
        const k = String(r.gender || "unknown");
        by[k] = (by[k] ?? 0) + 1;
      });
      const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
      return [{ title: "Patients", value: String(list.length), sub: top ? `${top[0]}: ${top[1]}` : undefined }];
    }
    if (reportKey === "inventory") {
      const low = list.filter((r: any) => Number(r.quantity ?? 0) <= Number(r.reorder_level ?? 0)).length;
      const soon = list.filter((r: any) => {
        if (!r.expiry_date) return false;
        const d = new Date(r.expiry_date);
        return d.getTime() <= Date.now() + 30 * 86400000;
      }).length;
      return [
        { title: "Items", value: String(list.length) },
        { title: "Low stock", value: String(low) },
        { title: "Expiring (30d)", value: String(soon) },
      ];
    }
    return [{ title: "Records", value: String(list.length) }];
  }, [filtered, reportKey]);

  const trend = useMemo(() => {
    if (!cfg.dateField) return [];
    const start = new Date(from);
    const end = new Date(to);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const by: Record<string, number> = {};
    (filtered ?? []).forEach((r: any) => {
      const v = r[cfg.dateField as any];
      if (!v) return;
      const k = new Date(v).toISOString().slice(0, 10);
      by[k] = (by[k] ?? 0) + 1;
    });
    const out: { day: string; count: number }[] = [];
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      out.push({
        day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count: by[k] ?? 0,
      });
      if (out.length > 120) break;
    }
    return out;
  }, [cfg.dateField, filtered, from, to]);

  const breakdown = useMemo(() => {
    const list: any[] = filtered ?? [];
    if (reportKey === "appointments") {
      const by: Record<string, number> = {};
      list.forEach((r: any) => {
        const k = String(r.status || "unknown");
        by[k] = (by[k] ?? 0) + 1;
      });
      return Object.entries(by).map(([name, value]) => ({ name, value }));
    }
    if (reportKey === "patients") {
      const by: Record<string, number> = {};
      list.forEach((r: any) => {
        const k = String(r.gender || "unknown");
        by[k] = (by[k] ?? 0) + 1;
      });
      return Object.entries(by).map(([name, value]) => ({ name, value }));
    }
    if (reportKey === "invoices") {
      const by: Record<string, number> = {};
      list.forEach((r: any) => {
        const k = String(r.status || "unknown");
        by[k] = (by[k] ?? 0) + 1;
      });
      return Object.entries(by).map(([name, value]) => ({ name, value }));
    }
    return [];
  }, [filtered, reportKey]);

  const PIE_COLORS = ["oklch(0.58 0.12 205)", "oklch(0.72 0.13 200)", "oklch(0.65 0.15 160)", "oklch(0.70 0.18 50)", "oklch(0.6 0.22 25)", "oklch(0.55 0.15 290)"];

  const exportExcel = () => {
    if (!rows.length) return toast.error("No data to export");
    const headers = cfg.columns.map((c) => c.label);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.label.slice(0, 30));
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
    toast.success("Excel downloaded");
  };

  const exportPDF = () => {
    if (!rows.length) return toast.error("No data to export");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`${cfg.label} Report`, 14, 14);
    doc.setFontSize(10);
    doc.text(cfg.dateField ? `Period: ${from} to ${to}` : `Generated: ${today}`, 14, 20);
    autoTable(doc, {
      head: [cfg.columns.map((c) => c.label)],
      body: rows.map((r: any[]) => r.map((v: any) => String(v ?? ""))),
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`${fileBase}.pdf`);
    toast.success("PDF downloaded");
  };

  const printReport = () => {
    if (!rows.length) return toast.error("No data to print");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`${cfg.label} Report`, 14, 14);
    doc.setFontSize(10);
    doc.text(cfg.dateField ? `Period: ${from} to ${to}` : `Generated: ${today}`, 14, 20);
    autoTable(doc, {
      head: [cfg.columns.map((c) => c.label)],
      body: rows.map((r: any[]) => r.map((v: any) => String(v ?? ""))),
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <Card className="border-border/60 bg-gradient-to-br from-primary/10 via-background to-transparent">
        <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
              <p className="text-sm text-muted-foreground">Modern clinic reporting with export and print.</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exportExcel} disabled={!rows.length}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={exportPDF} disabled={!rows.length}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button onClick={printReport} disabled={!rows.length}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Report type</Label>
              <Select value={reportKey} onValueChange={(v) => setReportKey(v as ReportKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORTS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search in results…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quick range</Label>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => preset(1)} disabled={!cfg.dateField}>
                  <CalendarDays className="h-4 w-4" /> Today
                </Button>
                <Button size="sm" variant="outline" onClick={() => preset(7)} disabled={!cfg.dateField}>7 days</Button>
                <Button size="sm" variant="outline" onClick={() => preset(30)} disabled={!cfg.dateField}>30 days</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!cfg.dateField} />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={!cfg.dateField} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground flex items-end">
              {cfg.dateField ? `Filtering by ${cfg.dateField} · Showing ${rows.length} result(s)` : `Snapshot report · Showing ${rows.length} result(s)`}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">At a glance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {summary.map((m) => (
                <div key={m.title} className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{m.title}</div>
                  <div className="text-lg font-semibold">{m.value}</div>
                  {m.sub && <div className="text-xs text-muted-foreground mt-1">{m.sub}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Insights</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground mb-2">Trend</div>
              {!cfg.dateField || trend.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No time trend for this report.</div>
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis width={32} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="count" stroke="oklch(0.58 0.12 205)" fill="oklch(0.58 0.12 205 / 0.18)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground mb-2">Breakdown</div>
              {breakdown.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No breakdown for this report.</div>
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {breakdown.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">{cfg.label}</CardTitle>
          <div className="text-xs text-muted-foreground">{rows.length} result(s)</div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No records in this range.</div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {cfg.columns.map((c) => <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any[], i: number) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      {r.map((v: any, j: number) => (
                        <TableCell
                          key={j}
                          className={
                            "text-xs " +
                            (cfg.columns[j]?.key === "services"
                              ? "whitespace-normal max-w-[420px]"
                              : "whitespace-nowrap")
                          }
                        >
                          {String(v ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
