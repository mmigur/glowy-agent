import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ConfigMissing } from "../../components/ConfigMissing";
import { Logo } from "../../components/Logo";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { appCopy, tError } from "../../lib/app-copy";
import { fill, useI18n } from "../../lib/i18n";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginPage() {
  const { locale } = useI18n();
  const copy = appCopy[locale].login;
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
          <ArrowLeft className="size-3.5" /> {copy.back}
        </Link>
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.body}</p>

        {status === "sent" ? (
          <div className="mt-6 rounded-md border border-border-strong p-4 text-sm" role="status">
            {fill(copy.sent, { email })}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <label htmlFor="email" className="sr-only">
              {copy.email}
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
              {status === "sending" ? copy.sending : copy.continue}
            </Button>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {tError(error, locale)}
              </p>
            ) : null}
          </form>
        )}

        <p className="mt-8 text-xs leading-5 text-muted-foreground">{copy.note}</p>
      </div>
    </div>
  );
}
