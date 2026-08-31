import { CheckCircleIcon } from "@solar-icons/react/dynamic/check-circle";
import { useForm } from "@tanstack/react-form";
import { Button, Form, Input, message } from "antd";
import { apiClient } from "src/common/api";
import { fetchCurrentUser } from "src/common/authSlice";
import type { User } from "src/common/types";
import { SectionRow } from "src/components/SectionRow";
import { useAppDispatch } from "src/store/store";

interface BasicInfoSectionProps {
  user: User;
  avatar: string;
}

export function BasicInfoSection({ user, avatar }: BasicInfoSectionProps) {
  const dispatch = useAppDispatch();

  const form = useForm({
    defaultValues: {
      name: user.name || "",
    },
    onSubmit: async ({ value }) => {
      try {
        await apiClient.patch("/api/auth/update-profile", { name: value.name, avatar });
        await dispatch(fetchCurrentUser()).unwrap();
        message.success("Profile updated successfully");
      } catch (error: any) {
        message.error(error.message || "Failed to update profile");
      }
    },
  });

  return (
    <SectionRow title="Basic Information" description="Your display name">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="max-w-sm">
          <form.Field name="name">
            {(field) => (
              <Form.Item label={<span className="text-muted-foreground">Display Name</span>} layout="vertical" required className="mb-0!">
                <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Your full name" />
              </Form.Item>
            )}
          </form.Field>
        </div>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button htmlType="submit" type="primary" size="small" loading={isSubmitting} icon={<CheckCircleIcon size={16} />}>
              Save Changes
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionRow>
  );
}
