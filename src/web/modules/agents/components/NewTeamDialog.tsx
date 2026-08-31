import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";
import { Button, Form, Input, Modal } from "antd";
import type { InputRef } from "antd";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createTeam } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface NewTeamDialogProps {
  children: ReactNode;
}

export function NewTeamDialog({ children }: NewTeamDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useAppDispatch();
  const nameRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open]);

  const handleClose = () => setOpen(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter a team name");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(createTeam({ name: name.trim() })).unwrap();
      handleClose();
    } catch {
      setError("Failed to create team");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <>
      <span className="inline-flex" onClick={() => setOpen(true)}>
        {children}
      </span>

      <Modal
        open={open}
        onCancel={handleClose}
        title={
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
              <div className="text-[14px] leading-none text-muted-foreground">
                <UsersGroupTwoRoundedIcon size={16} />
              </div>
            </div>
            <span className="truncate font-semibold text-foreground">New Team</span>
          </div>
        }
        footer={
          <div className="flex justify-end gap-2.5">
            <Button type="text" size="small" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" size="small" loading={saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create Team"}
            </Button>
          </div>
        }
        width={420}
        destroyOnHidden
      >
        <div className="flex flex-col gap-4 pt-4">
          <Form.Item
            label={
              <span className="text-muted-foreground">
                Team Name<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input
              ref={nameRef}
              id="new-team-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Marketing, Engineering…"
              autoComplete="off"
            />
          </Form.Item>

          {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
        </div>
      </Modal>
    </>
  );
}

export { NewTeamDialog as NewTeamPopover };
