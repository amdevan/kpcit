import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarClock, FileText, Plus } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MediClinic" }] }),
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function Dashboard() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    enabled: !!user,
    queryFn: async () => {
      const [pat, rec, recent] = await Promise.all([
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase.from("medical_records").select("id", { count: "exact", head: true }),
        supabase.from("patients").select("id, full_name, created_at").order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        patients: pat.count ?? 0,
        records: rec.count ?? 0,
        recent: recent.data ?? [],
      };
    },
  });

  const stats = [
    { label: "Total patients", value: data?.patients ?? "—", icon: Users },
    { label: "Medical records", value: data?.records ?? "—", icon: FileText },
    { label: "Today", value: new Date().toLocaleDateString(), icon: CalendarClock },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your clinic activity.</p>
        </div>
        <Button asChild>
          <Link to="/patients">
            <Plus className="h-4 w-4" /> New patient
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-accent text-accent-foreground">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-xl font-semibold">{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Recently added patients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data && data.recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No patients yet. <Link to="/patients" className="text-primary hover:underline">Add your first one →</Link>
            </div>
          ) : (
            <ul className="divide-y">
              {data?.recent.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: p.id }}
                    className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition"
                  >
                    <span className="font-medium">{p.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}