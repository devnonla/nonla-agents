/** Tất cả các key hợp lệ của AppSettings. Dùng khi get/set để tránh typo. */
export enum SettingKey {
  // General
  Timezone = "timezone",

  // AI Providers
  OpenAIKey = "openaiKey",
  OpenAIBaseUrl = "openaiBaseUrl",
  AnthropicKey = "anthropicKey",
  GoogleKey = "googleKey",
  GoogleBaseUrl = "googleBaseUrl",
  OpenRouterKey = "openrouterKey",
  OllamaEndpoint = "ollamaEndpoint",

  // Tool Code Assistant
  ToolAssistantProvider = "toolAssistantProvider",
  ToolAssistantModel = "toolAssistantModel",

  // Job Code Assistant
  JobAssistantProvider = "jobAssistantProvider",
  JobAssistantModel = "jobAssistantModel",

  // Site Code Assistant
  SiteAssistantProvider = "siteAssistantProvider",
  SiteAssistantModel = "siteAssistantModel",

  // Datatable Schema Assistant
  DatatableAssistantProvider = "datatableAssistantProvider",
  DatatableAssistantModel = "datatableAssistantModel",

  // Prompt Assistant
  PromptAssistantProvider = "prompt_assistant_provider",
  PromptAssistantModel = "prompt_assistant_model",

  // Skill Assistant
  SkillAssistantProvider = "skillAssistantProvider",
  SkillAssistantModel = "skillAssistantModel",

  // Object Creator
  ObjectCreatorProviderId = "objectCreatorProviderId",
  ObjectCreatorModel = "objectCreatorModel",

  // Memory / Embedding
  MemoryProviderId = "memoryProviderId",
  MemoryModel = "memoryModel",
}
