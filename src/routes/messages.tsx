import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Trash2, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/messages")({
  head: () => ({ meta: [{ title: "Messages — KPC" }] }),
  component: () => <AppShell><MessagesPage /></AppShell>,
});

function MessagesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["contact_messages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_messages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (!hasRole("admin")) return <div className="text-muted-foreground">Admin access required.</div>;

  const mark = async (id: string, status: string) => {
    const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["contact_messages"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("contact_messages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["contact_messages"] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Mail className="h-6 w-6" /> Contact Messages</h1>
        <p className="text-sm text-muted-foreground">Inquiries submitted from the public contact page.</p>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No messages yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.map((m: any) => (
            <Card key={m.id} className="border-border/60">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{m.name}</span>
                      <Badge variant={m.status === "new" ? "default" : "secondary"} className="capitalize">{m.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}{m.phone ? ` · ${m.phone}` : ""} · {new Date(m.created_at).toLocaleString()}</div>
                    {m.subject && <div className="mt-2 text-sm font-medium">{m.subject}</div>}
                  </div>
                  <div className="flex gap-2">
                    {m.status !== "resolved" && (
                      <Button size="sm" variant="outline" onClick={() => mark(m.id, "resolved")}><CheckCircle2 className="h-4 w-4" /> Resolve</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
