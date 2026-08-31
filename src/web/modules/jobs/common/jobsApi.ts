import { apiClient } from "src/common/api";
import type { Job, JobRun } from "src/common/types";

export const jobsApi = {
  list: (params?: Record<string, string | number>) => apiClient.get<{ items: Job[]; total: number }>("/api/jobs", params as Record<string, string | number | boolean | undefined>),

  get: (id: string) => apiClient.get<Job>(`/api/jobs/${id}`),

  create: (body: { name: string; cron: string; description?: string; code?: string; timeoutMs?: number }) => apiClient.post<Job>("/api/jobs", body),

  update: (id: string, body: Partial<{ name: string; description: string | null; code: string; cron: string; timeoutMs: number }>) => apiClient.put<Job>(`/api/jobs/${id}`, body),

  remove: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/jobs/${id}`),

  run: (id: string) => apiClient.post<JobRun>(`/api/jobs/${id}/run`, {}),

  cancelRun: (id: string, runId: string) => apiClient.post<JobRun>(`/api/jobs/${id}/runs/${runId}/cancel`, {}),

  listRuns: (id: string, params?: Record<string, string | number>) => apiClient.get<{ items: JobRun[]; total: number; page: number; limit: number }>(`/api/jobs/${id}/runs`, params as Record<string, string | number | boolean | undefined>),

  getRun: (id: string, runId: string) => apiClient.get<JobRun>(`/api/jobs/${id}/runs/${runId}`),
};
