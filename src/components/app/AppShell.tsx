import { ReactNode, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, LogOut, Stethoscope, Calendar, UserCog, Receipt, Pill, FlaskConical, Package, BarChart3, ShieldCheck, Mail } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

type Item = { title: string; url: string; icon: typeof Users; roles: AppRole[] };
const items: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin","doctor","receptionist"] },
  { title: "Patients", url: "/patients", icon: Users, roles: ["admin","doctor","receptionist"] },
  { title: "Appointments", url: "/appointments", icon: Calendar, roles: ["admin","doctor","receptionist"] },
  { title: "Doctors", url: "/doctors", icon: UserCog, roles: ["admin","doctor","receptionist"] },
  { title: "Invoices", url: "/invoices", icon: Receipt, roles: ["admin","receptionist"] },
  { title: "Prescriptions", url: "/prescriptions", icon: Pill, roles: ["admin","doctor"] },
  { title: "Lab Reports", url: "/lab-reports", icon: FlaskConical, roles: ["admin","doctor"] },
  { title: "Inventory", url: "/inventory", icon: Package, roles: ["admin"] },
  { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin"] },
  { title: "Messages", url: "/messages", icon: Mail, roles: ["admin"] },
  { title: "User Roles", url: "/users", icon: ShieldCheck, roles: ["admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

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
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
                <Stethoscope className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold">MediClinic</span>
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
          </header>
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}