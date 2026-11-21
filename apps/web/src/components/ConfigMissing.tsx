export function ConfigMissing() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-lg font-semibold tracking-tight">Supabase is not configured</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create <code className="font-mono text-foreground">apps/web/.env.local</code> and set the two public values
        from your Supabase project (Project Settings, API), then restart the dev server.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-xs leading-5">
        {`VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co\nVITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY`}
      </pre>
    </div>
  );
}
