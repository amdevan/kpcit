import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, BarChart3, Printer } from "lucide-react";
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
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — MediClinic" }] }),
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
    select: "full_name, gender, date_of_birth, phone, email, blood_type, created_at",
    columns: [
      { key: "full_name", label: "Name" },
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
    label: "Invoices / Billing",
    dateField: "created_at",
    select: "invoice_number, status, total, paid_amount, due_date, created_at, patients(full_name)",
    columns: [
      { key: "invoice_number", label: "Invoice #" },
      { key: "patient", label: "Patient", format: (_v, r) => r.patients?.full_name ?? "" },
      { key: "total", label: "Total", format: (v) => Number(v ?? 0).toFixed(2) },
      { key: "paid_amount", label: "Paid", format: (v) => Number(v ?? 0).toFixed(2) },
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
    label: "Lab Reports",
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

  const cfg = REPORTS[reportKey];

  const { data, isLoading } = useQuery({
    queryKey: ["report", reportKey, from, to],
    queryFn: async () => {
      let q: any = (supabase as any).from(reportKey).select(cfg.select);
      if (cfg.dateField) {
        q = q.gte(cfg.dateField, from).lte(cfg.dateField, to + (cfg.dateField === "scheduled_at" ? "T23:59:59" : ""));
      }
      const { data, error } = await q.order(cfg.dateField ?? cfg.columns[0].key, { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows: any[][] = useMemo(() => (data ?? []).map((row: any) =>
    cfg.columns.map((c) => (c.format ? c.format(row[c.key], row) : (row[c.key] ?? "")))
  ), [data, cfg]);

  const fileBase = `${cfg.label.replace(/\W+/g, "_")}_${from}_to_${to}`;

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
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Generate and export clinic reports.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5 items-end">
            <div className="space-y-1.5 md:col-span-2">
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
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!cfg.dateField} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={!cfg.dateField} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={exportExcel} className="flex-1">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={exportPDF} className="flex-1">
                <FileText className="h-4 w-4" /> PDF
              </Button>
              <Button onClick={printReport} className="flex-1">
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>
          {!cfg.dateField && (
            <p className="text-xs text-muted-foreground mt-3">This report shows the current snapshot — date filter not applicable.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">{cfg.label} · {rows.length} record{rows.length === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No records in this range.</div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {cfg.columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any[], i: number) => (
                    <TableRow key={i}>
                      {r.map((v: any, j: number) => <TableCell key={j} className="text-xs">{String(v ?? "")}</TableCell>)}
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