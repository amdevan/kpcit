import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/user-logs")({
  head: () => ({ meta: [{ title: "User Logs — KPC-MS" }] }),
  component: () => (
    <AppShell>
      <UserLogsPage />
    </AppShell>
  ),
});

type Range = "all" | "today" | "yesterday";

function UserLogsPage() {
  const { hasRole } = useAuth();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("yesterday");

  const { startIso, endIso } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (range === "today") {
      const tomorrow = new Date(start.getTime() + 86400000);
      return { startIso: start.toISOString(), endIso: tomorrow.toISOString() };
    }
    if (range === "yesterday") {
      const yStart = new Date(start.getTime() - 86400000);
      return { startIso: yStart.toISOString(), endIso: start.toISOString() };
    }
    return { startIso: null as any, endIso: null as any };
  }, [range]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["user-audit-logs", range],
    enabled: hasRole("admin"),
    retry: false,
    queryFn: async () => {
      let query = (supabase as any)
        .from("user_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (range !== "all") {
        query = query.gte("created_at", startIso).lt("created_at", endIso);
      }

      const res = await query;
      if (res.error) throw res.error;
      return (res.data ?? []) as any[];
    },
  });

  if (!hasRole("admin")) return <div className="text-muted-foreground">Admin access required.</div>;

  const missingTable =
    !!error && String((error as any)?.message ?? "").toLowerCase().includes("could not find the table");

  const list = data ?? [];
  const filtered = (() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((r) => {
      const hay = [
        r.action,
        r.entity,
        r.entity_id,
        r.route,
        r.actor_user_id,
        r.target_user_id,
        JSON.stringify(r.details ?? {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  })();

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> User Logs
          </h1>
          <p className="text-sm text-muted-foreground">Audit trail (today / yesterday / all).</p>
        </div>
      </div>

      {missingTable && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Apply migration:{" "}
            <span className="font-mono">supabase/migrations/20260608090000_user_audit_logs.sql</span>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <Button variant={range === "today" ? "default" : "outline"} size="sm" onClick={() => setRange("today")}>
            Today
          </Button>
          <Button variant={range === "yesterday" ? "default" : "outline"} size="sm" onClick={() => setRange("yesterday")}>
            Yesterday
          </Button>
          <Button variant={range === "all" ? "default" : "outline"} size="sm" onClick={() => setRange("all")}>
            All
          </Button>
        </div>
        <div className="relative w-full sm:w-[420px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs (action, route, entity, user id)…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No logs.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => (
                <li key={r.id} className="px-5 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="font-medium flex items-center gap-2">
                      <Badge variant="secondary">{String(r.action ?? "event")}</Badge>
                      {r.entity ? <span className="text-xs text-muted-foreground">{r.entity}</span> : null}
                      {r.entity_id ? <span className="text-xs text-muted-foreground font-mono">#{r.entity_id}</span> : null}
                      {r.route ? <span className="text-xs text-muted-foreground">{r.route}</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    actor: <span className="font-mono">{String(r.actor_user_id ?? "—")}</span>
                    {r.target_user_id ? (
                      <>
                        {" "}
                        • target: <span className="font-mono">{String(r.target_user_id)}</span>
                      </>
                    ) : null}
                  </div>
                  {r.details && Object.keys(r.details).length > 0 ? (
                    <pre className="text-[11px] bg-muted/30 rounded-md p-2 overflow-auto">
                      {JSON.stringify(r.details, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

