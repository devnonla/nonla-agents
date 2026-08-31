import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { RestartIcon } from "@solar-icons/react/dynamic/restart";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { UserPlusIcon } from "@solar-icons/react/dynamic/user-plus";
import { useForm } from "@tanstack/react-form";
import { Button, Form, Input, Modal, Select, message } from "antd";
import { useState } from "react";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import RenderIf from "src/components/RenderIf";

interface UserFormProps {
  user?: User | null;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
] as const;

export function UserFormDialog({ user, onClose, onSaved }: UserFormProps) {
  const isEdit = !!user;
  const [deleting, setDeleting] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const form = useForm({
    defaultValues: {
      username: user?.username ?? "",
      name: user?.name ?? "",
      password: "",
      role: user?.role ?? "member",
    },
    onSubmit: async ({ value }) => {
      try {
        if (isEdit) {
          await apiClient.put(`/api/users/${user.id}`, {
            username: value.username,
            name: value.name,
            role: value.role,
          });
          message.success(`User ${value.username} updated`);
        } else {
          await apiClient.post("/api/users", {
            username: value.username,
            name: value.name,
            password: value.password,
            role: value.role,
          });
          message.success(`User ${value.username} created`);
        }
        onSaved();
        onClose();
      } catch (err: any) {
        message.error(err.message || "Failed to save user");
      }
    },
  });

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/users/${user.id}`);
      message.success(`Deleted user ${user.username}`);
      onSaved();
      onClose();
    } catch (err: any) {
      message.error(err.message || "Failed to delete user");
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
    } catch (err: any) {
      message.error(err.message || "Failed to reset password");
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
                size="small"
                danger
                disabled={deleting}
                icon={<TrashBinMinimalisticIcon size={12} />}
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
          <Button type="text" size="small" onClick={onClose}>
            Cancel
          </Button>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="primary" size="small" onClick={() => form.handleSubmit()} loading={isSubmitting}>
                {isEdit ? "Save" : "Create"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      }
      width={440}
      destroyOnHidden
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-3.5"
      >
        <form.Field
          name="username"
          validators={{
            onSubmit: ({ value }) => (!value.trim() ? "Username is required" : undefined),
          }}
        >
          {(field) => (
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Username<span className="text-destructive"> *</span>
                </span>
              }
              validateStatus={field.state.meta.errors[0] ? "error" : undefined}
              help={field.state.meta.errors[0]?.toString()}
              className="mb-0!"
              layout="vertical"
            >
              <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="john_doe" />
            </Form.Item>
          )}
        </form.Field>

        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => (!value.trim() ? "Name is required" : undefined),
          }}
        >
          {(field) => (
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Name<span className="text-destructive"> *</span>
                </span>
              }
              validateStatus={field.state.meta.errors[0] ? "error" : undefined}
              help={field.state.meta.errors[0]?.toString()}
              className="mb-0!"
              layout="vertical"
            >
              <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="John Doe" />
            </Form.Item>
          )}
        </form.Field>

        <RenderIf condition={!isEdit}>
          <form.Field
            name="password"
            validators={{
              onSubmit: ({ value }) => {
                if (!value) return "Password is required";
                if (value.length < 8) return "Password must be at least 8 characters";
                return undefined;
              },
            }}
          >
            {(field) => (
              <Form.Item
                label={
                  <span className="text-muted-foreground">
                    Password<span className="text-destructive"> *</span>
                  </span>
                }
                validateStatus={field.state.meta.errors[0] ? "error" : undefined}
                help={field.state.meta.errors[0]?.toString()}
                className="mb-0!"
                layout="vertical"
              >
                <Input type="password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Min 8 characters" />
              </Form.Item>
            )}
          </form.Field>
        </RenderIf>

        <form.Field name="role">
          {(field) => (
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Role<span className="text-destructive"> *</span>
                </span>
              }
              className="mb-0!"
              layout="vertical"
            >
              <Select value={field.state.value} onChange={(val) => field.handleChange(val as "admin" | "member")} options={[...ROLE_OPTIONS]} className="w-full" />
            </Form.Item>
          )}
        </form.Field>

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
