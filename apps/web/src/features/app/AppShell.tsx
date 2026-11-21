import { BarChart3, CalendarDays, FileText, LogOut, Settings } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

const NAV = [
  { to: "/app", label: "Today", icon: FileText, end: true },
  { to: "/app/calendar", label: "Calendar", icon: CalendarDays, end: false },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, end: false },
  { to: "/app/settings", label: "Settings", icon: Settings, end: false },
] as const;

export function AppShell() {
  const { session, signOut } = useAuth();

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <aside className="flex flex-col border-r border-border px-3 py-4">
        <Link to="/app" className="px-2 pb-6" aria-label="Home">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                  isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-border pt-3">
          <p className="truncate px-2 text-xs text-muted-foreground" title={session?.user.email ?? ""}>
            {session?.user.email}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="flex-1 justify-start" onClick={() => void signOut()}>
              <LogOut className="size-4" aria-hidden /> Sign out
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-10 py-8">
        <div className="mx-auto max-w-[960px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
