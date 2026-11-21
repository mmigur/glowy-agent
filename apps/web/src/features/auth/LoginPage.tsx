import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ConfigMissing } from "../../components/ConfigMissing";
import { Logo } from "../../components/Logo";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginPage() {
  const { session, signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <ConfigMissing />;
  if (session) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const message = await signInWithEmail(email.trim());
    if (message) {
      setError(message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="fade-up w-full max-w-sm">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We email you a one-time link. No password to remember.
        </p>

        {status === "sent" ? (
          <div className="mt-6 rounded-md border border-border-strong p-4 text-sm" role="status">
            Check <span className="font-medium">{email}</span> for the sign-in link. You can close this tab.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
            />
            <Button type="submit" className="w-full" disabled={status === "sending" || email.trim() === ""}>
              {status === "sending" ? "Sending…" : "Continue with email"}
            </Button>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </form>
        )}

        <p className="mt-8 text-xs leading-5 text-muted-foreground">
          You connect your X and Threads accounts after signing in. Publishing needs its own authorization with
          posting permissions, so it is a separate step from signing in.
        </p>
      </div>
    </div>
  );
}
