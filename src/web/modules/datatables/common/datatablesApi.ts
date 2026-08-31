import { apiClient } from "src/common/api";
import type { DatatableColumn, DatatableColumnType, DatatableProject, DatatableRow, DatatableTable } from "src/common/types";

const BASE = "/api/datatables";

export const datatablesApi = {
  listProjects: () => apiClient.get<Array<DatatableProject & { tableCount: number; tableNames: string[] }>>(`${BASE}/projects`),
  createProject: (name: string) => apiClient.post<DatatableProject>(`${BASE}/projects`, { name }),
  updateProject: (id: string, name: string) => apiClient.put<DatatableProject>(`${BASE}/projects/${id}`, { name }),
  deleteProject: (id: string) => apiClient.delete(`${BASE}/projects/${id}`),
  getProject: (id: string) => apiClient.get<DatatableProject>(`${BASE}/projects/${id}`),

  listTables: (projectId: string) => apiClient.get<DatatableTable[]>(`${BASE}/projects/${projectId}/tables`),
  getProjectSchema: (projectId: string) => apiClient.get<{ project: DatatableProject; tables: Array<DatatableTable & { columns: DatatableColumn[] }> }>(`${BASE}/projects/${projectId}/schema`),
  createTable: (projectId: string, name: string) => apiClient.post<DatatableTable>(`${BASE}/projects/${projectId}/tables`, { name }),
  updateTable: (id: string, name: string) => apiClient.put<DatatableTable>(`${BASE}/tables/${id}`, { name }),
  deleteTable: (id: string) => apiClient.delete(`${BASE}/tables/${id}`),
  getTable: (id: string) => apiClient.get<DatatableTable>(`${BASE}/tables/${id}`),

  listColumns: (tableId: string) => apiClient.get<DatatableColumn[]>(`${BASE}/tables/${tableId}/columns`),
  createColumn: (tableId: string, body: { name: string; type: DatatableColumnType; options?: string[]; required?: boolean }) => apiClient.post<DatatableColumn>(`${BASE}/tables/${tableId}/columns`, body),
  updateColumn: (id: string, body: Partial<{ name: string; type: DatatableColumnType; options: string[] | null; required: boolean }>) => apiClient.put<DatatableColumn>(`${BASE}/columns/${id}`, body),
  deleteColumn: (id: string) => apiClient.delete(`${BASE}/columns/${id}`),

  queryRows: (tableId: string, opts?: { where?: Record<string, unknown> | Record<string, unknown>[]; limit?: number; offset?: number }) => apiClient.post<{ items: DatatableRow[]; total: number; limit: number; offset: number }>(`${BASE}/tables/${tableId}/rows/query`, opts ?? {}),
  insertRows: (tableId: string, rows: Record<string, unknown>[]) => apiClient.post<DatatableRow[]>(`${BASE}/tables/${tableId}/rows`, { rows }),
  updateRow: (rowId: string, data: Record<string, unknown>) => apiClient.put<DatatableRow>(`${BASE}/rows/${rowId}`, { data }),
  deleteRow: (rowId: string) => apiClient.delete(`${BASE}/rows/${rowId}`),
  bulkDeleteRows: (tableId: string, rowIds: string[]) => apiClient.post<{ deleted: number }>(`${BASE}/tables/${tableId}/rows/bulk-delete`, { rowIds }),
};
