const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3100";

export type MarketHealth =
  | "ok"
  | "running"
  | "pending"
  | "warning"
  | "error"
  | "stale";

export type MarketRun = {
  id: number;
  status: "running" | "success" | "partial" | "failed";
  trigger: string;
  phase: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  totalEstimated: number;
  productsSeen: number;
  productsUpserted: number;
  pricesChanged: number;
  errorsCount: number;
  errorMessage: string | null;
  coveragePct: number | null;
  progressPct: number | null;
};

export type MarketStoreStatus = {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  isRunning: boolean;
  health: MarketHealth;
  activeProducts: number;
  dataAgeHours: number | null;
  lastSuccessAt: string | null;
  lastRun: MarketRun | null;
};

export type MarketAlert = {
  storeId: string;
  storeName: string;
  health: MarketHealth;
  title: string;
  message: string | null;
  runId: number | null;
  startedAt: string | null;
};

export type MarketStatus = {
  generatedAt: string;
  staleDataHours: number;
  stores: MarketStoreStatus[];
  alerts: MarketAlert[];
};

export type AppNotification = {
  id: number;
  severity: "info" | "warning" | "error";
  source: string;
  storeId: string | null;
  runId: number | null;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export const marketService = {
  status(): Promise<MarketStatus> {
    return fetchJson<MarketStatus>(`${API_BASE_URL}/admin/market/status`);
  },

  runs(storeId?: string, limit = 50): Promise<MarketRun[]> {
    const params = new URLSearchParams();
    if (storeId) params.set("store", storeId);
    params.set("limit", String(limit));
    return fetchJson<MarketRun[]>(
      `${API_BASE_URL}/admin/market/runs?${params.toString()}`,
    );
  },

  notifications(unreadOnly = false, limit = 30): Promise<AppNotification[]> {
    const params = new URLSearchParams();
    if (unreadOnly) params.set("unread", "true");
    params.set("limit", String(limit));
    return fetchJson<AppNotification[]>(
      `${API_BASE_URL}/admin/market/notifications?${params.toString()}`,
    );
  },

  markRead(id: number): Promise<AppNotification> {
    return fetchJson<AppNotification>(
      `${API_BASE_URL}/admin/market/notifications/${id}/read`,
      { method: "PATCH" },
    );
  },

  markAllRead(): Promise<{ updated: number }> {
    return fetchJson<{ updated: number }>(
      `${API_BASE_URL}/admin/market/notifications/read-all`,
      { method: "PATCH" },
    );
  },

  trigger(storeId?: string): Promise<{
    started: string[];
    skipped: string[];
    alreadyRunning: string[];
  }> {
    const url = storeId
      ? `${API_BASE_URL}/admin/market/ingest/${storeId}`
      : `${API_BASE_URL}/admin/market/ingest`;
    return fetchJson(url, { method: "POST" });
  },
};
