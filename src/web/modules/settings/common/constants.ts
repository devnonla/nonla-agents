export type SettingsTab = "general" | "default-models" | "providers" | "api-keys" | "users";

export const SETTINGS_TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: "general", label: "General", icon: "options-24" },
  { key: "default-models", label: "Default models", icon: "lightbulb-filament-24" },
  { key: "providers", label: "LLM Providers", icon: "briefcase-24" },
  { key: "api-keys", label: "API Keys", icon: "lock-closed-24" },
  { key: "users", label: "Users", icon: "people-community-24" },
];
