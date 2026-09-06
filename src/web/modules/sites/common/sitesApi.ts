import { apiClient, authorizedFetch } from "src/common/api";
import type { Site, SiteFilesResponse } from "src/common/types";

export const sitesApi = {
  list: (params?: Record<string, string | number>) => apiClient.get<{ items: Site[]; total: number }>("/api/sites", params as Record<string, string | number | boolean | undefined>),

  get: (id: string) => apiClient.get<Site>(`/api/sites/${id}`),

  create: (body: { name: string; slug: string }) => apiClient.post<Site>("/api/sites", body),

  update: (id: string, body: Partial<{ name: string; slug: string; isPublished: boolean; publicPassword: string | null }>) => apiClient.put<Site>(`/api/sites/${id}`, body),

  remove: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/sites/${id}`),

  getFiles: (id: string, tree: "draft" | "prod" = "draft") => apiClient.get<SiteFilesResponse>(`/api/sites/${id}/files`, { tree }),

  putFile: (id: string, file: string, content: string, tree: "draft" | "prod" = "draft") => apiClient.put<{ ok: boolean; draftDirty: boolean; site: Site; depsInstalled?: boolean }>(`/api/sites/${id}/files/${encodeURIComponent(file)}`, { content, tree }),

  install: (id: string, tree: "draft" | "prod" = "draft") => apiClient.post<Site>(`/api/sites/${id}/install`, { tree }),

  preview: (id: string, opts?: { tree?: "draft" | "prod"; query?: Record<string, string> }) =>
    apiClient.post<{ html: string; data: unknown }>(`/api/sites/${id}/preview`, {
      tree: opts?.tree ?? "draft",
      ...(opts?.query && Object.keys(opts.query).length > 0 ? { query: opts.query } : {}),
    }),

  action: (id: string, formData: FormData) => apiClient.postFormData<{ result: unknown }>(`/api/sites/${id}/action`, formData),

  getThumbnail: (id: string) => apiClient.getBlob(`/api/sites/${id}/thumbnail`),

  uploadThumbnail: async (id: string, blob: Blob) => {
    const response = await authorizedFetch(`/api/sites/${id}/thumbnail`, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: blob,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Upload failed" }));
      const message = error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return response.json() as Promise<{ ok: boolean }>;
  },

  resolveSelection: (id: string, body: { sourceAnchor?: string; tagName?: string; className?: string; text?: string; outerHtml?: string }) =>
    apiClient.post<{
      sourceAnchor?: string;
      file: string;
      line?: number;
      excerpt: string;
      matchMethod: "anchor" | "fuzzy" | "none";
    }>(`/api/sites/${id}/resolve-selection`, body),

  approve: (id: string, file?: string) => apiClient.post<Site>(`/api/sites/${id}/approve`, file ? { file } : {}),

  discard: (id: string, file?: string) => apiClient.post<Site>(`/api/sites/${id}/discard`, file ? { file } : {}),
};
