import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ConfigMissing } from "../../components/ConfigMissing";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (!isSupabaseConfigured) return <ConfigMissing />;

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground" role="status">
        Loading…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
