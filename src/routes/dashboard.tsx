import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users, CalendarClock, FileText, Plus, Activity, TrendingUp, Receipt, Pill,
  FlaskConical, UserCog, ArrowUpRight, Clock, HeartPulse, ClipboardList,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { DateRangeFilter, type DateRange, rangeStart } from "@/components/app/DateRangeFilter";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — KPC-MS" }] }),
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function Dashboard() {
  const { user, roles } = useAuth();
  const primaryRole = roles[0] ?? "user";
  const [range, setRange] = useState<DateRange>("month");

  const { data } = useQuery({
    queryKey: ["dashboard-stats-v3", range],
    enabled: !!user,
    queryFn: async () => {
      const start = rangeStart(range) ?? (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; })();
      const isoSince = start.toISOString();
      const dayCount = Math.max(1, Math.round((Date.now() - start.getTime()) / 86400000));
      const [pat, rec, appts, doctors, invoices, rx, labs, recent, apptList, invList, inquiriesAll, newInquiries] = await Promise.all([
        supabase.from("patients").select("id, created_at").gte("created_at", isoSince),
        supabase.from("medical_records").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id, scheduled_at, status, patient_id, doctor_id").gte("scheduled_at", isoSince),
        supabase.from("doctors").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("id, total, paid_amount, status, created_at").gte("created_at", isoSince),
        supabase.from("prescriptions").select("id", { count: "exact", head: true }),
        supabase.from("lab_reports").select("id", { count: "exact", head: true }),
        supabase.from("patients").select("id, full_name, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("appointments").select("id, scheduled_at, status, reason").gte("scheduled_at", isoSince).order("scheduled_at", { ascending: true }).limit(6),
        supabase.from("invoices").select("id, status").gte("created_at", isoSince),
        supabase.from("inquiries").select("id, status, full_name, created_at").order("created_at", { ascending: false }),
        supabase.from("inquiries").select("id, full_name, status, created_at, purpose").gte("created_at", isoSince).order("created_at", { ascending: false }).limit(5),
      ]);

      const days: { date: string; patients: number; appts: number }[] = [];
      const patBy: Record<string, number> = {};
      const apBy: Record<string, number> = {};
      (pat.data ?? []).forEach((p: any) => {
        const k = new Date(p.created_at).toISOString().slice(0, 10);
        patBy[k] = (patBy[k] ?? 0) + 1;
      });
      (appts.data ?? []).forEach((a: any) => {
        const k = new Date(a.scheduled_at).toISOString().slice(0, 10);
        apBy[k] = (apBy[k] ?? 0) + 1;
      });
      for (let i = dayCount - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        days.push({ date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), patients: patBy[k] ?? 0, appts: apBy[k] ?? 0 });
      }

      const revenue = (invoices.data ?? []).reduce((s: number, i: any) => s + Number(i.paid_amount ?? 0), 0);
      const outstanding = (invoices.data ?? []).reduce((s: number, i: any) => s + (Number(i.total ?? 0) - Number(i.paid_amount ?? 0)), 0);

      const statusCounts: Record<string, number> = {};
      (appts.data ?? []).forEach((a: any) => { statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1; });
      const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

      const allInq = inquiriesAll.data ?? [];
      const inqOpen = allInq.filter((i: any) => i.status !== "converted" && i.status !== "closed").length;
      const inqConverted = allInq.filter((i: any) => i.status === "converted").length;

      return {
        patients: pat.data?.length ?? 0,
        records: rec.count ?? 0,
        appointments: appts.data?.length ?? 0,
        doctors: doctors.count ?? 0,
        invoicesCount: invoices.data?.length ?? 0,
        prescriptions: rx.count ?? 0,
        labs: labs.count ?? 0,
        revenue,
        outstanding,
        days,
        statusData,
        recent: recent.data ?? [],
        upcoming: apptList.data ?? [],
        invList: invList.data ?? [],
        inqOpen,
        inqConverted,
        recentInquiries: newInquiries.data ?? [],
      };
    },
  });

  const tiles = [
    { label: "Inquiries (open)", value: data?.inqOpen ?? "—", icon: ClipboardList, accent: "from-cyan-500/15 to-teal-400/10", iconCls: "text-cyan-600" },
    { label: "Patients", value: data?.patients ?? "—", icon: Users, accent: "from-sky-500/15 to-cyan-400/10", iconCls: "text-sky-600" },
    { label: "Appointments", value: data?.appointments ?? "—", icon: CalendarClock, accent: "from-violet-500/15 to-fuchsia-400/10", iconCls: "text-violet-600" },
    { label: "Doctors", value: data?.doctors ?? "—", icon: UserCog, accent: "from-emerald-500/15 to-teal-400/10", iconCls: "text-emerald-600" },
    { label: "Prescriptions", value: data?.prescriptions ?? "—", icon: Pill, accent: "from-amber-500/15 to-orange-400/10", iconCls: "text-amber-600" },
    { label: "Lab", value: data?.labs ?? "—", icon: FlaskConical, accent: "from-rose-500/15 to-pink-400/10", iconCls: "text-rose-600" },
  ];

  const fmtMoney = (n: number) => `Rs ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const PIE_COLORS = ["oklch(0.58 0.12 205)", "oklch(0.72 0.13 200)", "oklch(0.65 0.15 160)", "oklch(0.70 0.18 50)", "oklch(0.6 0.22 25)", "oklch(0.55 0.15 290)"];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl p-8 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
        <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <Badge variant="secondary" className="bg-white/15 text-white border-0 backdrop-blur capitalize">{primaryRole} dashboard</Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Welcome back 👋</h1>
            <p className="mt-1 text-sm text-white/80">Here's what's happening at your clinic today.</p>
          </div>
          <div className="flex items-center gap-3">
            <DateRangeFilter value={range} onChange={setRange} className="bg-white/15 text-white border-white/20" />
            <div className="hidden md:flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <HeartPulse className="h-5 w-5" />
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-80">Revenue</div>
                <div className="text-lg font-semibold">{data ? fmtMoney(data.revenue) : "—"}</div>
              </div>
            </div>
            <Button asChild variant="secondary" className="bg-white text-foreground hover:bg-white/90">
              <Link to="/patients"><Plus className="h-4 w-4" /> New patient</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map((s) => (
          <Card key={s.label} className={`relative overflow-hidden border-border/60 bg-gradient-to-br ${s.accent}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <s.icon className={`h-5 w-5 ${s.iconCls}`} />
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/60" />
              </div>
              <div className="mt-4 text-2xl font-semibold tracking-tight">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Activity (last 30 days)</div>
                <div className="text-xs text-muted-foreground">New patients & appointments per day</div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.days ?? []}>
                  <defs>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.58 0.12 205)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="oklch(0.58 0.12 205)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.72 0.13 200)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.72 0.13 200)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="patients" stroke="oklch(0.58 0.12 205)" fill="url(#gp)" strokeWidth={2} />
                  <Area type="monotone" dataKey="appts" stroke="oklch(0.72 0.13 200)" fill="url(#ga)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="text-sm font-semibold flex items-center gap-2 mb-4"><Activity className="h-4 w-4 text-primary" /> Appointment status</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data?.statusData ?? []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {(data?.statusData ?? []).map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lists row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Recent inquiries</div>
              <Link to="/inquiries" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
            {!data?.recentInquiries.length ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No inquiries.</div>
            ) : (
              <ul className="divide-y">
                {data.recentInquiries.map((i: any) => (
                  <li key={i.id} className="py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{i.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{i.purpose || "—"}</div>
                    </div>
                    <Badge variant="secondary" className="capitalize shrink-0">{i.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Upcoming appointments</div>
              <Link to="/appointments" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
            {data?.upcoming.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No upcoming appointments.</div>
            ) : (
              <ul className="divide-y">
                {data?.upcoming.map((a: any) => (
                  <li key={a.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{a.reason || "Appointment"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(a.scheduled_at).toLocaleString()}</div>
                    </div>
                    <Badge variant="secondary" className="capitalize">{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Recently added patients</div>
              <Link to="/patients" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
            {data && data.recent.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No patients yet. <Link to="/patients" className="text-primary hover:underline">Add the first one →</Link>
              </div>
            ) : (
              <ul className="divide-y">
                {data?.recent.map((p: any) => (
                  <li key={p.id}>
                    <Link to="/patients/$patientId" params={{ patientId: p.id }} className="py-3 flex items-center justify-between hover:bg-muted/40 -mx-2 px-2 rounded-md transition">
                      <span className="text-sm font-medium">{p.full_name}</span>
                      <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Finance strip */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="border-border/60"><CardContent className="p-5"><div className="text-xs text-muted-foreground">Revenue collected</div><div className="text-2xl font-semibold mt-1">{data ? fmtMoney(data.revenue) : "—"}</div></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-5"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold mt-1 text-amber-600">{data ? fmtMoney(data.outstanding) : "—"}</div></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-5 flex items-center gap-4"><Receipt className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">Billing</div><div className="text-2xl font-semibold">{data?.invList.length ?? "—"}</div></div></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-5 flex items-center gap-4"><FileText className="h-8 w-8 text-primary" /><div><div className="text-xs text-muted-foreground">Inquiries converted</div><div className="text-2xl font-semibold">{data?.inqConverted ?? "—"}</div></div></CardContent></Card>
      </div>
    </div>
  );
}
