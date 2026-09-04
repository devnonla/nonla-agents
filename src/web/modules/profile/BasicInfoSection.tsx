import { Button, EFormItemType, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { apiClient } from "src/common/api";
import { fetchCurrentUser } from "src/common/authSlice";
import type { User } from "src/common/types";
import { SectionRow } from "src/components/SectionRow";
import { useAppDispatch } from "src/store/store";

interface BasicInfoSectionProps {
  user: User;
  avatar: string;
}

type BasicInfoValues = { name: string };

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Display Name",
    colSpan: 12,
    rules: { required: "Display name is required" },
    options: { placeholder: "Your full name" },
  },
];

export function BasicInfoSection({ user, avatar }: BasicInfoSectionProps) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const form = useForm<BasicInfoValues>({ defaultValues: { name: user.name || "" }, mode: "onSubmit" });

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setSaving(true);
    try {
      await apiClient.patch("/api/auth/update-profile", { name: name.trim(), avatar });
      await dispatch(fetchCurrentUser()).unwrap();
      message.success("Profile updated successfully");
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  });

  return (
    <SectionRow title="Basic Information" description="Your display name">
      <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
        <SchemaForm form={form} items={ITEMS} />
        <Button htmlType="submit" type="primary" loading={saving} className="self-start">
          Save Changes
        </Button>
      </form>
    </SectionRow>
  );
}
