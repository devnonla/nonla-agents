export interface PublicAgent {
  id: string;
  name: string;
  description: string;
  startMessage: string;
  requiresPassword: boolean;
  model?: string;
  providerLabel?: string;
  tools?: { name: string; label: string; icon?: string | null }[];
}

export interface ConvMeta {
  id: string;
  title: string;
  createdAt: string | Date;
  isEmpty: boolean;
  status?: "running" | "done" | "failed";
}
