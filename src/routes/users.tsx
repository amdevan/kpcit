import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Plus, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, type AppRole } from "@/lib/auth";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "User Roles — KPC" }] }),
  component: () => <AppShell><UsersPage /></AppShell>,
});

const ALL_ROLES: AppRole[] = ["admin", "doctor", "receptionist"];

function UsersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Record<string, AppRole>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["users-roles"],
    enabled: hasRole("admin"),
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("id, user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const map = new Map<string, { id: string; role: AppRole }[]>();
      (roles ?? []).forEach((r: any) => {
        const arr = map.get(r.user_id) ?? [];
        arr.push({ id: r.id, role: r.role });
        map.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: map.get(p.id) ?? [] }));
    },
  });

  if (!hasRole("admin")) return <div className="text-muted-foreground">Admin access required.</div>;

  const addRole = async (userId: string) => {
    const role = pending[userId];
    if (!role) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) return toast.error(error.message);
    setPending((p) => ({ ...p, [userId]: undefined as any }));
    qc.invalidateQueries({ queryKey: ["users-roles"] });
  };
  const removeRole = async (id: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["users-roles"] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> User Roles</h1>
        <p className="text-sm text-muted-foreground">Assign or revoke roles for staff members.</p>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((u: any) => {
            const heldRoles = new Set<string>(u.roles.map((r: any) => r.role));
            const available = ALL_ROLES.filter((r) => !heldRoles.has(r));
            return (
              <Card key={u.id} className="border-border/60">
                <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-medium">{u.full_name || "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                      {u.roles.map((r: any) => (
                        <Badge key={r.id} variant="secondary" className="capitalize gap-1">
                          {r.role}
                          <button onClick={() => removeRole(r.id)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {available.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Select value={pending[u.id] ?? ""} onValueChange={(v) => setPending((p) => ({ ...p, [u.id]: v as AppRole }))}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Add role" /></SelectTrigger>
                        <SelectContent>
                          {available.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => addRole(u.id)}><Plus className="h-4 w-4" /> Add</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
