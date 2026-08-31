import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "src/common/api";
import type { LlmProvider } from "src/common/types";
import { cleanObject } from "src/common/utils/objectUtils";
import { BaseReducer, type IBaseState } from "src/store/baseSlice";

// ─── Provider metadata ────────────────────────────────────────────────────────

export type ProviderMeta = {
  id: string;
  label: string;
  keyPlaceholder: string;
  defaultBase: string;
  supportsCustomBaseUrl: boolean;
};

export const PROVIDER_META: Record<string, ProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-...",
    defaultBase: "https://api.openai.com/v1",
    supportsCustomBaseUrl: true,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    keyPlaceholder: "sk-or-...",
    defaultBase: "https://openrouter.ai/api/v1",
    supportsCustomBaseUrl: false,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    keyPlaceholder: "sk-ant-...",
    defaultBase: "https://api.anthropic.com",
    supportsCustomBaseUrl: false,
  },
};

const FALLBACK_META: ProviderMeta = {
  id: "unknown",
  label: "Unknown",
  keyPlaceholder: "...",
  defaultBase: "",
  supportsCustomBaseUrl: false,
};

export function getProviderMeta(provider: string): ProviderMeta {
  return PROVIDER_META[provider] ?? { ...FALLBACK_META, id: provider, label: provider };
}

export const PROVIDER_OPTIONS = Object.entries(PROVIDER_META).map(([value, m]) => ({ value, label: m.label }));

export function generateLabel(provider: string, existingItems: LlmProvider[]): string {
  const base = PROVIDER_META[provider]?.label ?? provider;
  const taken = new Set(existingItems.map((i) => i.label));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface ILlmProvidersState extends IBaseState {
  filter: {
    page?: number;
    limit?: number;
    sorts?: string;
    search?: string;
  };
  /** List fetch lifecycle — used to dedupe GET /api/providers across ModelPickers */
  listStatus: "idle" | "loading" | "succeeded" | "failed";
  /** Provider ids currently fetching GET /models */
  modelsLoadingIds: string[];
}

const initialState: ILlmProvidersState = {
  total: 0,
  items: [] as LlmProvider[],
  selected: [],
  filter: {},
  listStatus: "idle",
  modelsLoadingIds: [],
};

type LlmProvidersRoot = { llmProviders: ILlmProvidersState };

// ─── Extra actions ────────────────────────────────────────────────────────────

/** GET /api/providers once — skip if already loaded / in flight. */
const ensureLlmProviders = createAsyncThunk(
  "llmProviders/ensureList",
  async (_, { getState, rejectWithValue }): Promise<{ total: number; items: LlmProvider[] }> => {
    try {
      const state = (getState() as LlmProvidersRoot).llmProviders;
      const params = cleanObject({ ...state.filter });
      const res = (await apiClient.get("/api/providers", params)) as { total: number; items: LlmProvider[] };
      return { total: res.total ?? 0, items: res.items ?? [] };
    } catch (err: any) {
      return rejectWithValue(err?.message ?? "Failed to fetch providers") as never;
    }
  },
  {
    condition: (_, { getState }) => {
      const { listStatus, items } = (getState() as LlmProvidersRoot).llmProviders;
      if (listStatus === "loading" || listStatus === "succeeded") return false;
      // Already hydrated by a force fetch (e.g. Settings) — don't refetch.
      if (items.length > 0) return false;
      return true;
    },
  },
);

/** GET /api/providers/:id/models — cache onto provider.models in store (once per provider). */
const fetchProviderModels = createAsyncThunk(
  "llmProviders/fetchModels",
  async (id: string, { rejectWithValue }) => {
    try {
      const models = (await apiClient.get(`/api/providers/${id}/models`)) as string[];
      return { id, models: Array.isArray(models) ? models : [] };
    } catch (err: any) {
      return rejectWithValue(err?.message ?? "Failed to fetch models");
    }
  },
  {
    condition: (id, { getState }) => {
      const state = (getState() as LlmProvidersRoot).llmProviders;
      const provider = state.items.find((item) => item.id === id) as LlmProvider | undefined;
      // List payload omits `models`; once fetched it is always an array (possibly empty).
      if (provider && Array.isArray(provider.models)) return false;
      if (state.modelsLoadingIds.includes(id)) return false;
      return true;
    },
  },
);

// refreshModels: POST /api/providers/:id/refresh-models → update item in state
const refreshModels = createAsyncThunk("llmProviders/refreshModels", async (id: string, { rejectWithValue }) => {
  try {
    const updated = (await apiClient.post(`/api/providers/${id}/refresh-models`)) as LlmProvider;
    return updated;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to refresh models");
  }
});

function mergeCachedModels(prevItems: LlmProvider[], nextItems: LlmProvider[]): LlmProvider[] {
  const prevModels = new Map<string, string[]>();
  for (const item of prevItems) {
    if (Array.isArray(item.models)) prevModels.set(item.id, item.models);
  }
  if (prevModels.size === 0) return nextItems;
  return nextItems.map((item) => {
    const models = prevModels.get(item.id);
    return models !== undefined ? { ...item, models } : item;
  });
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const llmProvidersBaseReducer = new BaseReducer<ILlmProvidersState>({
  name: "llmProviders",
  basePath: "/api/providers",
  initialState,
  extraReducers: (builder) => {
    builder
      .addCase(ensureLlmProviders.pending, (state) => {
        state.listStatus = "loading";
      })
      .addCase(ensureLlmProviders.fulfilled, (state, action) => {
        const { total, items } = action.payload;
        state.items = mergeCachedModels(state.items as LlmProvider[], items);
        state.total = total;
        state.listStatus = "succeeded";
      })
      .addCase(ensureLlmProviders.rejected, (state) => {
        state.listStatus = "failed";
      })
      .addCase(fetchProviderModels.pending, (state, action) => {
        const id = action.meta.arg;
        if (!state.modelsLoadingIds.includes(id)) state.modelsLoadingIds.push(id);
      })
      .addCase(fetchProviderModels.fulfilled, (state, action) => {
        const { id, models } = action.payload;
        state.modelsLoadingIds = state.modelsLoadingIds.filter((x) => x !== id);
        const index = state.items.findIndex((item) => item.id === id);
        if (index >= 0) {
          const item = state.items[index] as LlmProvider & { countModels?: number };
          item.models = models;
          item.countModels = models.length;
        }
      })
      .addCase(fetchProviderModels.rejected, (state, action) => {
        state.modelsLoadingIds = state.modelsLoadingIds.filter((x) => x !== action.meta.arg);
      })
      .addCase(refreshModels.fulfilled, (state, action) => {
        const updated = action.payload as LlmProvider;
        const index = state.items.findIndex((item) => item.id === updated.id);
        if (index >= 0) {
          state.items.splice(index, 1, Object.assign(state.items[index], updated));
        }
      });
  },
});

const { actions: _actions, reducer: llmProvidersReducer } = llmProvidersBaseReducer.createSlice();

export const {
  fetchItems: fetchLlmProviders,
  getItem: getLlmProvider,
  createItem: createLlmProvider,
  updateItem: updateLlmProvider,
  deleteItem: deleteLlmProvider,
  reset: resetLlmProviders,
  updateFilter: updateLlmProvidersFilter,
  updateSelected: updateLlmProvidersSelected,
  upsertLocal: upsertLlmProviderLocal,
  removeLocal: removeLlmProviderLocal,
} = _actions as any;

export { ensureLlmProviders, fetchProviderModels, refreshModels, llmProvidersReducer };
export default llmProvidersReducer;
