import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { Button, Form, Input, Modal, message } from "antd";
import type { InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import { deleteTeam, updateTeam } from "src/modules/agents/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface EditTeamDialogProps {
  open: boolean;
  team: TeamWithMembers | null;
  onClose: () => void;
}

export function EditTeamDialog({ open, team, onClose }: EditTeamDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useAppDispatch();
  const nameRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open && team) {
      setName(team.name);
      setError("");
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, team]);

  const handleSave = async () => {
    if (!team) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a team name");
      nameRef.current?.focus();
      return;
    }
    if (trimmed === team.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(updateTeam({ id: team.id, name: trimmed })).unwrap();
      message.success("Team updated successfully");
      onClose();
    } catch {
      message.error("Failed to update team name");
      setError("Failed to update team name");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!team) return;
    setDeleting(true);
    setError("");
    try {
      await dispatch(deleteTeam(team.id)).unwrap();
      message.success("Team deleted successfully");
      onClose();
    } catch {
      message.error("Failed to delete team");
      setError("Failed to delete team");
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSave();
    }
  };

  if (!open || !team) return null;

  return (
    <Modal
      open
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">
              <PenNewSquareIcon size={18} />
            </div>
          </div>
          <span className="truncate font-semibold text-foreground">Edit Team</span>
        </div>
      }
      footer={
        <div className="flex flex-row gap-3">
          <div className="mr-auto">
            <Button
              size="small"
              danger
              disabled={deleting}
              icon={<TrashBinTrashIcon size={12} />}
              onClick={() => {
                Modal.confirm({
                  title: "Delete team?",
                  content: "Are you sure? This cannot be undone.",
                  okText: "Delete",
                  okType: "danger",
                  onOk: handleDelete,
                });
              }}
            />
          </div>
          <Button type="text" size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="small" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
      width={420}
      style={{ top: 20 }}
      centered={false}
      destroyOnHidden
    >
      <div className="flex flex-col gap-4">
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
            id="canvas-edit-team-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Marketing, Engineering, Research…"
            autoComplete="off"
          />
        </Form.Item>

        {error && <div className="text-[12px] text-destructive font-medium">{error}</div>}
      </div>
    </Modal>
  );
}
