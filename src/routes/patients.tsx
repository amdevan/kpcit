import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Plus, User } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PatientFormDialog } from "@/components/app/PatientFormDialog";

export const Route = createFileRoute("/patients")({
  head: () => ({ meta: [{ title: "Patients — MediClinic" }] }),
  component: () => (
    <AppShell>
      <PageOrChild />
    </AppShell>
  ),
});

function PageOrChild() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Children render their own content via <Outlet/>
  if (pathname !== "/patients") return <Outlet />;
  return <PatientList />;
}

function PatientList() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["patients", q],
    queryFn: async () => {
      let query = supabase.from("patients").select("*").order("created_at", { ascending: false });
      if (q.trim()) query = query.ilike("full_name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">Manage patient records and history.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New patient
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name…"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="p-12 text-center">
              <User className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No patients found.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: p.id }}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40 transition"
                  >
                    <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-medium">
                      {p.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[p.gender, p.date_of_birth, p.phone].filter(Boolean).join(" · ") || "No details"}
                      </div>
                    </div>
                    {p.blood_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                        {p.blood_type}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <PatientFormDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["patients"] })}
      />
    </div>
  );
}