import { CAPABILITIES, PLATFORMS, type Platform } from "@growth/core";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { appCopy, tError } from "../../lib/app-copy";
import { fill, useI18n } from "../../lib/i18n";
import { useSocialAccounts, type SocialAccountRow } from "./useSocialAccounts";

/** Какие платформы уже умеют подключаться. X добавится в Phase 6. */
const CONNECTABLE: Record<Platform, boolean> = { threads: true, x: false };

type Notice = { tone: "ok" | "error"; code: string };

function noticeFromParams(params: URLSearchParams): Notice | null {
  const error = params.get("connect_error");
  if (error) return { tone: "error", code: error };
  if (params.get("connected") === "threads") return { tone: "ok", code: "connected" };
  return null;
}

export function ConnectionsSection() {
  const { locale } = useI18n();
  const copy = appCopy[locale].connect;
  const { state, reload, connectThreads, disconnect } = useSocialAccounts();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<Notice | null>(() => noticeFromParams(params));
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Читаем результат возврата из Threads один раз и убираем параметры из адреса.
  useEffect(() => {
    if (params.has("connected") || params.has("connect_error")) {
      setNotice(noticeFromParams(params));
      const next = new URLSearchParams(params);
      next.delete("connected");
      next.delete("connect_error");
      setParams(next, { replace: true });
      void reload();
    }
  }, [params, setParams, reload]);

  async function onConnect(platform: Platform) {
    if (platform !== "threads") return;
    setBusy(platform);
    setNotice(null);
    const message = await connectThreads();
    // При успехе страница уходит на Threads. Сюда доходим только при ошибке.
    if (message) {
      setNotice({ tone: "error", code: message });
      setBusy(null);
    }
  }

  async function onDisconnect(account: SocialAccountRow) {
    if (confirming !== account.id) {
      setConfirming(account.id);
      return;
    }
    setBusy(account.id);
    const message = await disconnect(account.id);
    setNotice(message ? { tone: "error", code: message } : { tone: "ok", code: `disconnected:${account.username}` });
    setConfirming(null);
    setBusy(null);
  }

  const accounts = state.status === "ready" ? state.accounts : [];
  const noticeText = notice
    ? notice.code.startsWith("disconnected:")
      ? fill(copy.disconnected, { name: notice.code.slice("disconnected:".length) })
      : notice.code === "connected"
        ? copy.connectedOk
        : (copy.errors[notice.code as keyof typeof copy.errors] ?? (notice.tone === "error" ? tError(notice.code, locale) : notice.code))
    : null;
  const notes: Record<Platform, { publish: string; research: string }> = {
    threads: { publish: copy.threadsPublish, research: copy.threadsResearch },
    x: { publish: copy.xPublish, research: copy.xResearch },
  };

  return (
    <div>
      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mb-3 rounded-md border px-3 py-2 text-sm ${
            notice.tone === "error" ? "border-danger text-danger" : "border-border-strong"
          }`}
        >
          {noticeText}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {tError(state.message, locale)}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {PLATFORMS.map((platform) => {
          const cap = CAPABILITIES[platform];
          const connected = accounts.filter((a) => a.platform === platform);
          const canConnect = CONNECTABLE[platform];

          return (
            <li key={platform} className="px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{cap.displayName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{notes[platform].publish}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{copy.research}: {notes[platform].research}</p>
                </div>
                {connected.length === 0 ? (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone="muted">{state.status === "loading" ? copy.loading : copy.notConnected}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canConnect || state.status === "loading" || busy === platform}
                      title={canConnect ? undefined : copy.xLater}
                      onClick={() => void onConnect(platform)}
                    >
                      {busy === platform ? copy.redirecting : copy.connect}
                    </Button>
                  </div>
                ) : null}
              </div>

              {connected.map((account) => (
                <div
                  key={account.id}
                  className="mt-3 flex items-center justify-between gap-4 rounded-md border border-border bg-muted px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">@{account.username}</p>
                    {account.display_name ? (
                      <p className="truncate text-xs text-muted-foreground">{account.display_name}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {account.status === "active" ? (
                      <Badge tone="solid">{copy.connected}</Badge>
                    ) : (
                      <Badge tone="outline">{copy.needsReconnect}</Badge>
                    )}
                    {account.status !== "active" && canConnect ? (
                      <Button size="sm" variant="outline" disabled={busy === platform} onClick={() => void onConnect(platform)}>
                        {copy.reconnect}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === account.id}
                      onClick={() => void onDisconnect(account)}
                      onBlur={() => setConfirming(null)}
                    >
                      {confirming === account.id ? copy.confirmDisconnect : copy.disconnect}
                    </Button>
                  </div>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
