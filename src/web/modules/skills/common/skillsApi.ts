import { apiClient } from "src/common/api";
import type { Skill, SkillReference } from "src/common/types";

export const skillsApi = {
  list: (params?: Record<string, string | number>) => apiClient.get<{ items: Skill[]; total: number }>("/api/skills", params as Record<string, string | number | boolean | undefined>),

  get: (id: string) => apiClient.get<Skill>(`/api/skills/${id}`),

  create: (body: { name: string; description: string; content?: string }) => apiClient.post<Skill>("/api/skills", body),

  update: (id: string, body: Partial<{ name: string; description: string; content: string; draftContent: string | null }>) => apiClient.put<Skill>(`/api/skills/${id}`, body),

  remove: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/skills/${id}`),

  listReferences: (skillId: string) => apiClient.get<SkillReference[]>(`/api/skills/${skillId}/references`),

  createReference: (skillId: string, body: { name: string; title: string; content?: string }) => apiClient.post<SkillReference>(`/api/skills/${skillId}/references`, body),

  updateReference: (skillId: string, refId: string, body: Partial<{ name: string; title: string; content: string; draftContent: string | null }>) => apiClient.put<SkillReference>(`/api/skills/${skillId}/references/${refId}`, body),

  deleteReference: (skillId: string, refId: string) => apiClient.delete<{ ok: boolean }>(`/api/skills/${skillId}/references/${refId}`),
};
