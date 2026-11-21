import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Небольшой кэш данных с подходом «показать сохранённое, обновить в фоне».
 * Данные живут в памяти (переход между страницами не ходит в базу) и дублируются
 * в localStorage (мгновенный показ после перезагрузки). Пока данные свежее TTL, запросов нет.
 */
const STORAGE_PREFIX = "cache:v1:";
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface Entry<T> {
  data: T | undefined;
  fetchedAt: number;
  error: string | null;
  inflight: Promise<void> | null;
}

const entries = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function readStorage<T>(key: string): { data: T; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "data" in parsed && "fetchedAt" in parsed && typeof parsed.fetchedAt === "number") {
      return { data: parsed.data as T, fetchedAt: parsed.fetchedAt };
    }
  } catch {
    // хранилище недоступно или повреждено
  }
  return null;
}

function writeStorage(key: string, data: unknown, fetchedAt: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ data, fetchedAt }));
  } catch {
    // переполнено или запрещено: кэш в памяти продолжает работать
  }
}

function getEntry<T>(key: string): Entry<T> {
  let entry = entries.get(key) as Entry<T> | undefined;
  if (!entry) {
    const stored = readStorage<T>(key);
    entry = { data: stored?.data, fetchedAt: stored?.fetchedAt ?? 0, error: null, inflight: null };
    entries.set(key, entry as Entry<unknown>);
  }
  return entry;
}

function notify(key: string): void {
  listeners.get(key)?.forEach((fn) => fn());
}

/** Обновляет данные. Параллельные вызовы делят один запрос. */
export function refreshCache<T>(key: string, fetcher: () => Promise<T>): Promise<void> {
  const entry = getEntry<T>(key);
  if (entry.inflight) return entry.inflight;
  entry.inflight = (async () => {
    try {
      const data = await fetcher();
      entry.data = data;
      entry.fetchedAt = Date.now();
      entry.error = null;
      writeStorage(key, data, entry.fetchedAt);
    } catch (e) {
      entry.error = e instanceof Error ? e.message : "Request failed";
    } finally {
      entry.inflight = null;
      version.set(key, (version.get(key) ?? 0) + 1);
      notify(key);
    }
  })();
  return entry.inflight;
}

const version = new Map<string, number>();

/** Помечает ключ устаревшим: данные остаются на экране, но следующее чтение обновит их. */
export function invalidateCache(key: string): void {
  const entry = getEntry(key);
  entry.fetchedAt = 0;
  version.set(key, (version.get(key) ?? 0) + 1);
  notify(key);
}

/** Кладёт готовое значение в кэш (после сохранения не нужно перечитывать базу). */
export function setCache<T>(key: string, data: T): void {
  const entry = getEntry<T>(key);
  entry.data = data;
  entry.fetchedAt = Date.now();
  entry.error = null;
  writeStorage(key, data, entry.fetchedAt);
  version.set(key, (version.get(key) ?? 0) + 1);
  notify(key);
}

/** Текущее значение без запроса. */
export function getCached<T>(key: string): T | undefined {
  return getEntry<T>(key).data;
}

/** Очищает всё. Вызывается при выходе, чтобы следующий пользователь не увидел чужие данные. */
export function clearCache(): void {
  entries.clear();
  version.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // нет доступа к хранилищу
  }
  listeners.forEach((set) => set.forEach((fn) => fn()));
}

export interface CachedResource<T> {
  data: T | undefined;
  /** true, пока данных нет совсем. При наличии сохранённых данных всегда false. */
  loading: boolean;
  error: string | null;
  /** Принудительное обновление, данные на экране не исчезают. */
  reload: () => Promise<void>;
}

export function useCachedResource<T>(key: string | null, fetcher: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): CachedResource<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const subscribe = useCallback(
    (fn: () => void) => {
      if (!key) return () => {};
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    [key],
  );
  useSyncExternalStore(subscribe, () => (key ? (version.get(key) ?? 0) : 0));

  const entry = key ? getEntry<T>(key) : null;

  useEffect(() => {
    if (!key) return;
    const e = getEntry<T>(key);
    if (Date.now() - e.fetchedAt > ttlMs) void refreshCache(key, () => fetcherRef.current());
  }, [key, ttlMs]);

  const reload = useCallback(async () => {
    if (key) await refreshCache(key, () => fetcherRef.current());
  }, [key]);

  return {
    data: entry?.data,
    loading: key !== null && entry?.data === undefined && entry?.error === null,
    error: entry?.data === undefined ? (entry?.error ?? null) : null,
    reload,
  };
}
