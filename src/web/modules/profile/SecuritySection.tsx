import { Button, EFormItemType, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { apiClient } from "src/common/api";
import { SectionRow } from "src/components/SectionRow";

type SecurityValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const EMPTY: SecurityValues = { oldPassword: "", newPassword: "", confirmPassword: "" };

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "oldPassword",
    label: "Current Password",
    colSpan: 12,
    rules: { required: "Current password is required" },
    options: { type: "password" },
  },
  {
    type: EFormItemType.Input,
    name: "newPassword",
    label: "New Password",
    colSpan: 12,
    rules: {
      required: "New password is required",
      minLength: { value: 6, message: "Password must be at least 6 characters" },
    },
    options: { type: "password" },
  },
  {
    type: EFormItemType.Input,
    name: "confirmPassword",
    label: "Confirm New Password",
    colSpan: 12,
    rules: {
      required: "Please confirm your password",
      validate: (value, values) => value === (values as SecurityValues).newPassword || "Passwords do not match",
    },
    options: { type: "password" },
  },
];

export function SecuritySection() {
  const [saving, setSaving] = useState(false);
  const form = useForm<SecurityValues>({ defaultValues: EMPTY, mode: "onSubmit" });

  const onSubmit = form.handleSubmit(async ({ oldPassword, newPassword }) => {
    setSaving(true);
    try {
      await apiClient.post("/api/auth/change-password", { oldPassword, newPassword });
      message.success("Password changed successfully");
      form.reset(EMPTY);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  });

  return (
    <SectionRow title="Security" description="Update your password to keep your account secure">
      <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
        <SchemaForm form={form} items={ITEMS} />
        <Button htmlType="submit" type="default" loading={saving} className="self-start">
          Update Password
        </Button>
      </form>
    </SectionRow>
  );
}
