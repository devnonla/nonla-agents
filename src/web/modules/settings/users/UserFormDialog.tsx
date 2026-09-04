import { Button, EFormItemType, Input, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { RestartIcon } from "@solar-icons/react/dynamic/restart";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { UserPlusIcon } from "@solar-icons/react/dynamic/user-plus";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import RenderIf from "src/components/RenderIf";

interface UserFormProps {
  user?: User | null;
  onClose: () => void;
  onSaved: () => void;
}

type UserValues = {
  username: string;
  name: string;
  password: string;
  role: string;
};

export function UserFormDialog({ user, onClose, onSaved }: UserFormProps) {
  const isEdit = !!user;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const form = useForm<UserValues>({
    defaultValues: {
      username: user?.username ?? "",
      name: user?.name ?? "",
      password: "",
      role: user?.role ?? "member",
    },
    mode: "onSubmit",
  });
  const rootError = form.formState.errors.root?.message;

  const items: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Input,
        name: "username",
        label: "Username",
        colSpan: 12,
        rules: {
          required: "Username is required",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Username is required"),
        },
        options: { placeholder: "john_doe" },
      },
      {
        type: EFormItemType.Input,
        name: "name",
        label: "Name",
        colSpan: 12,
        rules: {
          required: "Name is required",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
        },
        options: { placeholder: "John Doe" },
      },
      ...(isEdit
        ? []
        : [
            {
              type: EFormItemType.Input,
              name: "password",
              label: "Password",
              colSpan: 12,
              rules: {
                required: "Password is required",
                minLength: { value: 8, message: "Password must be at least 8 characters" },
              },
              options: { type: "password", placeholder: "Min 8 characters" },
            } satisfies TFormItemProps,
          ]),
      {
        type: EFormItemType.Select,
        name: "role",
        label: "Role",
        colSpan: 12,
        choices: [
          { value: "member", label: "Member" },
          { value: "admin", label: "Admin" },
        ],
        rules: { required: "Role is required" },
      },
    ],
    [isEdit],
  );

  const onSubmit = form.handleSubmit(async ({ username, name, password, role }) => {
    setSaving(true);
    try {
      if (isEdit && user) {
        await apiClient.put(`/api/users/${user.id}`, { username, name, role });
        message.success(`User ${username} updated`);
      } else {
        await apiClient.post("/api/users", { username, name, password, role });
        message.success(`User ${username} created`);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : "Failed to save user" });
    } finally {
      setSaving(false);
    }
  });

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/users/${user.id}`);
      message.success(`Deleted user ${user.username}`);
      onSaved();
      onClose();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user) return;
    setResetting(true);
    try {
      const result = await apiClient.post<{ password: string }>(`/api/users/${user.id}/reset-password`, {
        password: resetPassword || undefined,
      });
      setGeneratedPassword(result.password);
      message.success(`Password reset for ${user.username}`);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const icon = isEdit ? <PenNewSquareIcon size={16} /> : <UserPlusIcon size={16} />;

  return (
    <Modal
      open
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">{icon}</div>
          </div>
          <span className="truncate font-semibold text-foreground">{isEdit ? "Edit User" : "Add User"}</span>
        </div>
      }
      footer={
        <div className="flex items-center gap-2">
          <RenderIf condition={isEdit}>
            <div className="mr-auto">
              <Button
                size="medium"
                danger
                disabled={deleting}
                icon={<TrashBinMinimalisticIcon size={14} />}
                onClick={() => {
                  Modal.confirm({
                    title: "Delete user?",
                    content: (
                      <p>
                        Are you sure you want to delete user <strong>{user?.username}</strong>? This action cannot be undone.
                      </p>
                    ),
                    okText: "Delete",
                    okType: "danger",
                    onOk: handleDelete,
                  });
                }}
              >
                Delete
              </Button>
            </div>
          </RenderIf>
          <Button type="text" size="medium" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="medium" htmlType="submit" form="user-form" loading={saving}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </div>
      }
      width={440}
      destroyOnHidden
    >
      <form id="user-form" onSubmit={onSubmit} className="flex flex-col">
        <SchemaForm form={form} items={items} />
        {rootError ? <div className="mb-3 pl-2.75 text-xs leading-snug text-destructive">{rootError}</div> : null}

        <RenderIf condition={isEdit}>
          <div className="flex flex-col gap-2 border-t border-border-subtle pt-3.5">
            <span className="text-sm text-muted-foreground">Reset Password</span>
            <RenderIf condition={!generatedPassword}>
              <div className="flex gap-2">
                <Input type="text" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Leave blank to auto-generate" className="flex-1" />
                <Button size="small" icon={<RestartIcon size={12} />} onClick={handleResetPassword} loading={resetting}>
                  Reset
                </Button>
              </div>
            </RenderIf>
            <RenderIf condition={!!generatedPassword}>
              {() => (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 select-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">{generatedPassword}</code>
                    <Button
                      type="text"
                      size="small"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPassword);
                        message.success("Password copied to clipboard");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Save this password now — it won't be shown again.</p>
                </div>
              )}
            </RenderIf>
          </div>
        </RenderIf>
      </form>
    </Modal>
  );
}
