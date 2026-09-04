import { BrainIcon } from "@solar-icons/react/dynamic/brain";
import { LockPasswordIcon } from "@solar-icons/react/dynamic/lock-password";
import type { SettingsIcon } from "@solar-icons/react/dynamic/settings";
import { SuitcaseIcon } from "@solar-icons/react/dynamic/suitcase";
import { Tuning2Icon } from "@solar-icons/react/dynamic/tuning-2";
import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";

export type SettingsTab = "general" | "default-models" | "providers" | "api-keys" | "users";

export const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  icon: typeof SettingsIcon;
}[] = [
  { key: "general", label: "General", icon: Tuning2Icon },
  { key: "default-models", label: "Default models", icon: BrainIcon },
  { key: "providers", label: "LLM Providers", icon: SuitcaseIcon },
  { key: "api-keys", label: "API Keys", icon: LockPasswordIcon },
  { key: "users", label: "Users", icon: UsersGroupTwoRoundedIcon },
];
