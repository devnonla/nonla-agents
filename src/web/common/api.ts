/**
 * API utility functions for making HTTP requests
 */

const TOKEN_KEY = "raw_agents_auth_token";
const REFRESH_KEY = "raw_agents_refresh_token";
const PROACTIVE_REFRESH_MS = 5 * 60 * 1000;

let refreshInFlight: Promise<boolean> | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setAuthToken(token: string, refreshToken?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
  scheduleProactiveRefresh();
  void reconnectWsIfNeeded();
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  clearProactiveRefresh();
}

function clearProactiveRefresh() {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function scheduleProactiveRefresh() {
  clearProactiveRefresh();
  const token = getAuthToken();
  if (!token || !getRefreshToken()) return;

  const exp = decodeJwtExp(token);
  if (!exp) return;

  const delay = exp * 1000 - Date.now() - PROACTIVE_REFRESH_MS;
  if (delay <= 0) {
    void tryRefreshTokens();
    return;
  }

  proactiveTimer = setTimeout(() => {
    void tryRefreshTokens();
  }, delay);
}

async function reconnectWsIfNeeded() {
  try {
    const { wsClient } = await import("./api/wsClient");
    if (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING) {
      wsClient.connect();
    }
  } catch {
    /* ignore — ws module may be unavailable in some contexts */
  }
}

function forceLogout() {
  clearAuthToken();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function tryRefreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const baseURL = (import.meta as any).env?.VITE_API_URL ?? "";
      const response = await fetch(`${baseURL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Another tab may have rotated — retry once with the latest stored token.
        const latest = getRefreshToken();
        if (latest && latest !== refreshToken) {
          const retry = await fetch(`${baseURL}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: latest }),
          });
          if (!retry.ok) return false;
          const retryData = (await retry.json()) as { token: string; refreshToken: string };
          if (!retryData.token || !retryData.refreshToken) return false;
          localStorage.setItem(TOKEN_KEY, retryData.token);
          localStorage.setItem(REFRESH_KEY, retryData.refreshToken);
          scheduleProactiveRefresh();
          void reconnectWsIfNeeded();
          return true;
        }
        return false;
      }

      const data = (await response.json()) as { token: string; refreshToken: string };
      if (!data.token || !data.refreshToken) return false;

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      scheduleProactiveRefresh();
      void reconnectWsIfNeeded();
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export { tryRefreshTokens };

/** fetch with Bearer auth + one refresh retry on 401 (for SSE / raw streaming). */
export async function authorizedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    const refreshed = await tryRefreshTokens();
    if (refreshed) {
      const headers2 = new Headers(init.headers);
      if (!headers2.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
        headers2.set("Content-Type", "application/json");
      }
      const next = getAuthToken();
      if (next) headers2.set("Authorization", `Bearer ${next}`);
      response = await fetch(input, { ...init, headers: headers2 });
    } else {
      forceLogout();
    }
  }
  return response;
}

function isAuthPublicPath(endpoint: string): boolean {
  return endpoint.startsWith("/api/auth/login") || endpoint.startsWith("/api/auth/refresh") || endpoint.startsWith("/api/auth/logout") || endpoint.startsWith("/api/auth/setup") || endpoint.startsWith("/api/auth/setup-status");
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const rec = body as { message?: unknown; error?: unknown };
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error;
  }
  return fallback;
}

// Base API client
export class ApiClient {
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL ?? (import.meta as any).env?.VITE_API_URL ?? "";
  }

  private getHeaders(isFormData = false): HeadersInit {
    const headers: HeadersInit = {};

    if (!isFormData) {
      headers["Content-Type"] = "application/json";
    }

    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response, endpoint: string, retry: () => Promise<Response>, didRefresh = false): Promise<T> {
    if (response.status === 401 && !isAuthPublicPath(endpoint) && !didRefresh) {
      const refreshed = await tryRefreshTokens();
      if (refreshed) {
        return this.handleResponse<T>(await retry(), endpoint, retry, true);
      }
      forceLogout();
      const error = await response.json().catch(() => ({ message: "Authentication required" }));
      throw new Error(errorMessage(error, "HTTP 401"));
    }

    if (!response.ok) {
      if (response.status === 401) {
        forceLogout();
      }
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(errorMessage(error, `HTTP ${response.status}`));
    }

    return response.json();
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = `${this.baseURL}${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(
        Object.entries(params)
          .filter(([_, value]) => value !== undefined && value !== null && value !== "")
          .map(([key, value]) => [key, String(value)]),
      ).toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const doFetch = () =>
      fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

    return this.handleResponse<T>(await doFetch(), endpoint, doFetch);
  }

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    const doFetch = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method: "POST",
        headers: this.getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
      });

    return this.handleResponse<T>(await doFetch(), endpoint, doFetch);
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const doFetch = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method: "PUT",
        headers: this.getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
      });

    return this.handleResponse<T>(await doFetch(), endpoint, doFetch);
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    const doFetch = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method: "PATCH",
        headers: this.getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
      });

    return this.handleResponse<T>(await doFetch(), endpoint, doFetch);
  }

  async delete<T>(endpoint: string): Promise<T> {
    const doFetch = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method: "DELETE",
        headers: this.getHeaders(),
      });

    return this.handleResponse<T>(await doFetch(), endpoint, doFetch);
  }

  async putFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    const doFetch = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method: "PUT",
        headers: this.getHeaders(true),
        body: formData,
      });

    return this.handleResponse<T>(await doFetch(), endpoint, doFetch);
  }

  async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    const doFetch = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method: "POST",
        headers: this.getHeaders(true),
        body: formData,
      });

    return this.handleResponse<T>(await doFetch(), endpoint, doFetch);
  }

  async postFile(endpoint: string, data?: any): Promise<Response> {
    const doFetch = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method: "POST",
        headers: this.getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
      });

    let response = await doFetch();
    if (response.status === 401 && !isAuthPublicPath(endpoint)) {
      const refreshed = await tryRefreshTokens();
      if (refreshed) {
        response = await doFetch();
      } else {
        forceLogout();
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        forceLogout();
      }
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const error = await response.json().catch(() => ({ message: "Request failed" }));
        throw new Error(errorMessage(error, `HTTP ${response.status}`));
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  async getBlob(endpoint: string, params?: Record<string, any>): Promise<Blob> {
    let url = `${this.baseURL}${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(
        Object.entries(params)
          .filter(([_, value]) => value !== undefined && value !== null && value !== "")
          .map(([key, value]) => [key, String(value)]),
      ).toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const doFetch = () =>
      fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

    let response = await doFetch();
    if (response.status === 401 && !isAuthPublicPath(endpoint)) {
      const refreshed = await tryRefreshTokens();
      if (refreshed) {
        response = await doFetch();
      } else {
        forceLogout();
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        forceLogout();
      }
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const error = await response.json().catch(() => ({ message: "Request failed" }));
        throw new Error(errorMessage(error, `HTTP ${response.status}`));
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.blob();
  }
}

// Create a default API client instance
export const apiClient = new ApiClient();

if (typeof window !== "undefined") {
  scheduleProactiveRefresh();
  window.addEventListener("storage", (event) => {
    if (event.key !== TOKEN_KEY && event.key !== REFRESH_KEY) return;
    if (event.newValue == null && event.key === TOKEN_KEY) {
      forceLogout();
      return;
    }
    if (getAuthToken() && getRefreshToken()) {
      scheduleProactiveRefresh();
      void reconnectWsIfNeeded();
    }
  });
}
