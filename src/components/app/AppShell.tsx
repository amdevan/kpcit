import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Users, LogOut, Calendar, UserCog, Receipt, Pill, FlaskConical, Package, BarChart3, ShieldCheck, Mail, ClipboardList, BellRing, Bell, Settings, Wallet, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth, type AppRole } from "@/lib/auth";
import { loadSettings } from "@/routes/settings";
import logoUrl from "@/assets/logo.png";

type Item = { title: string; url: string; icon: typeof Users; roles: AppRole[] };
const items: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Inquiry Register", url: "/inquiries", icon: ClipboardList, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Patients", url: "/patients", icon: Users, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Appointments", url: "/appointments", icon: Calendar, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Follow-ups", url: "/follow-ups", icon: BellRing, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Doctors", url: "/doctors", icon: UserCog, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Billing", url: "/invoices", icon: Receipt, roles: ["admin","receptionist"] },
  { title: "Finance", url: "/finance", icon: Wallet, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Prescriptions", url: "/prescriptions", icon: Pill, roles: ["admin","doctor"] },
  { title: "Lab", url: "/lab-reports", icon: FlaskConical, roles: ["admin","doctor","receptionist","staff"] },
  { title: "Inventory", url: "/inventory", icon: Package, roles: ["admin"] },
  { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin"] },
  { title: "Messages", url: "/messages", icon: Mail, roles: ["admin"] },
  { title: "User Roles", url: "/users", icon: ShieldCheck, roles: ["admin"] },
  { title: "User Logs", url: "/user-logs", icon: ScrollText, roles: ["admin"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["admin","doctor","receptionist","staff"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [clinicName, setClinicName] = useState(() => loadSettings().clinic_name);
  const [clinicLogo, setClinicLogo] = useState(() => loadSettings().clinic_logo_url || logoUrl);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    const apply = () => {
      const s = loadSettings();
      setClinicName(s.clinic_name);
      setClinicLogo(s.clinic_logo_url || logoUrl);
    };
    apply();
    const handler = () => apply();
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const visible = items.filter((it) => it.roles.some((r) => roles.includes(r)));
  const primaryRole = roles[0] ?? "user";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <img src={clinicLogo} alt="KPC-MS" className="h-[2.6rem] w-[2.6rem] shrink-0 object-cover rounded-md" />
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold">{clinicName || "KPC-MS"}</span>
                <span className="text-[10px] text-muted-foreground">Clinic management system by I T Relevant</span>
                <span className="text-[11px] text-muted-foreground capitalize">{primaryRole}</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((it) => {
                    const active = pathname === it.url || pathname.startsWith(it.url + "/");
                    return (
                      <SidebarMenuItem key={it.url}>
                        <SidebarMenuButton asChild isActive={active}>
                          <Link to={it.url}>
                            <it.icon />
                            <span>{it.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border">
            <div className="px-2 py-1.5 text-xs text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
              {user.email}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center px-4 gap-2">
            <SidebarTrigger />
            <div className="flex-1" />
            <NotificationBell />
          </header>
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function NotificationBell() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["followup-bell", today],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data: joined, error: joinedError } = await supabase
        .from("follow_ups")
        .select("id, title, due_date, channel, patients(full_name), inquiries(full_name)")
        .eq("status", "pending")
        .lte("due_date", today)
        .order("due_date", { ascending: true })
        .limit(20);
      if (!joinedError) return joined ?? [];

      const message = joinedError.message ?? "Failed to load follow-ups";
      const isRelationshipError = message.includes("Could not find a relationship between");
      if (!isRelationshipError) return [];

      const { data: base, error: baseError } = await supabase
        .from("follow_ups")
        .select("id, title, due_date, channel, patient_id, inquiry_id")
        .eq("status", "pending")
        .lte("due_date", today)
        .order("due_date", { ascending: true })
        .limit(20);

      if (baseError) return [];

      const patientIds = Array.from(new Set((base ?? []).map((f: any) => f.patient_id).filter(Boolean)));
      const inquiryIds = Array.from(new Set((base ?? []).map((f: any) => f.inquiry_id).filter(Boolean)));

      const [{ data: patients }, { data: inquiries }] = await Promise.all([
        patientIds.length
          ? supabase.from("patients").select("id, full_name").in("id", patientIds)
          : Promise.resolve({ data: [] } as any),
        inquiryIds.length
          ? supabase.from("inquiries").select("id, full_name").in("id", inquiryIds)
          : Promise.resolve({ data: [] } as any),
      ]);

      const patientById = new Map((patients ?? []).map((p: any) => [p.id, p]));
      const inquiryById = new Map((inquiries ?? []).map((i: any) => [i.id, i]));

      return (base ?? []).map((f: any) => ({
        ...f,
        patients: f.patient_id ? patientById.get(f.patient_id) ?? null : null,
        inquiries: f.inquiry_id ? inquiryById.get(f.inquiry_id) ?? null : null,
      }));
    },
  });
  const count = data?.length ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <div className="font-medium text-sm">Follow-up alerts</div>
          <div className="text-xs text-muted-foreground">Due today or overdue</div>
        </div>
        <div className="max-h-80 overflow-auto">
          {count === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">All caught up</div>
          ) : data!.map((f: any) => {
            const overdue = f.due_date < today;
            const who = f.patients?.full_name ?? f.inquiries?.full_name ?? "";
            return (
              <Link key={f.id} to="/follow-ups" className="block px-4 py-2.5 hover:bg-muted/50 border-b last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{f.title}</span>
                  {overdue && <Badge className="bg-rose-100 text-rose-800 text-[10px]">Overdue</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{who} · {f.due_date} · {f.channel}</div>
              </Link>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t">
          <Link to="/follow-ups" className="text-xs text-primary hover:underline">View all follow-ups →</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
