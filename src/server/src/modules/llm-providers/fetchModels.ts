/**
 * Server-side model fetcher — gọi đến API endpoint của mỗi provider
 * để lấy danh sách models. Dùng trong:
 * - POST /api/providers (verify + lưu models khi add)
 * - POST /api/providers/:id/refresh-models (refresh lại danh sách)
 */

interface ProviderInfo {
  provider: string;
  apiKey: string;
  customBaseUrl: string;
}

// ─── Per-provider meta (default base URLs) ─────────────────────────────────────

const DEFAULT_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
  google: "https://generativelanguage.googleapis.com/v1beta",
  anthropic: "https://api.anthropic.com",
};

// ─── Main export ────────────────────────────────────────────────────────────────

/**
 * Fetch model list from a provider.
 * Throws on network/auth errors so caller can return 4xx/5xx.
 */
export async function fetchModelsForProvider(p: ProviderInfo): Promise<string[]> {
  const base = p.customBaseUrl.trim();

  switch (p.provider) {
    case "openai":
    case "custom":
      return fetchOpenAiCompatibleModels(p.apiKey, base || DEFAULT_BASE.openai || "https://api.openai.com/v1");

    case "openrouter":
      return fetchOpenRouterModels(p.apiKey, base || DEFAULT_BASE.openrouter || "https://openrouter.ai/api/v1");

    case "ollama":
      return fetchOllamaModels(base || DEFAULT_BASE.ollama || "http://localhost:11434");

    case "google":
      return fetchGoogleModels(p.apiKey, base || DEFAULT_BASE.google || "https://generativelanguage.googleapis.com/v1beta");

    case "anthropic":
      return fetchAnthropicModels(p.apiKey, base || DEFAULT_BASE.anthropic || "https://api.anthropic.com");

    default:
      // Thử OpenAI-compatible nếu có base URL custom
      if (base) return fetchOpenAiCompatibleModels(p.apiKey, base);
      return [];
  }
}

// ─── Per-provider fetchers ──────────────────────────────────────────────────────

async function fetchOpenAiCompatibleModels(apiKey: string, baseUrl: string): Promise<string[]> {
  const url = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${url}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`/models: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return (json.data ?? []).map((m: { id: string }) => m.id).sort();
}

async function fetchOpenRouterModels(apiKey: string, baseUrl: string): Promise<string[]> {
  const url = baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "HTTP-Referer": "https://github.com/devnonla/nonla-agents",
    "X-Title": "Nonla Agents",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${url}/models`, { headers });
  if (!res.ok) throw new Error(`OpenRouter /models: ${res.status}`);
  const json = await res.json();
  return (json.data ?? []).map((m: { id: string }) => m.id).sort();
}

async function fetchOllamaModels(endpoint: string): Promise<string[]> {
  const base = endpoint.replace(/\/$/, "");
  const res = await fetch(`${base}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags: ${res.status}`);
  const json = await res.json();
  return (json.models ?? []).map((m: { name: string }) => m.name).sort();
}

async function fetchGoogleModels(apiKey: string, baseUrl = "https://generativelanguage.googleapis.com/v1beta"): Promise<string[]> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error(`Google /models: ${res.status}`);
  const json = await res.json();
  return (json.models ?? []).map((m: { name: string }) => m.name.replace("models/", "")).sort();
}

async function fetchAnthropicModels(apiKey: string, baseUrl = "https://api.anthropic.com"): Promise<string[]> {
  const root = baseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
    "x-api-key": apiKey,
  };

  const ids: string[] = [];
  let afterId: string | undefined;

  for (;;) {
    const params = new URLSearchParams({ limit: "1000" });
    if (afterId) params.set("after_id", afterId);
    const res = await fetch(`${root}/v1/models?${params}`, { headers });
    if (!res.ok) throw new Error(`Anthropic /v1/models: ${res.status} ${res.statusText}`);
    const json = (await res.json()) as {
      data?: { id: string }[];
      has_more?: boolean;
      last_id?: string | null;
    };
    for (const m of json.data ?? []) {
      if (m.id) ids.push(m.id);
    }
    if (!json.has_more || !json.last_id) break;
    afterId = json.last_id;
  }

  return ids.sort();
}
