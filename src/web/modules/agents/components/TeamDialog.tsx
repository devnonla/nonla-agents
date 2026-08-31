import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { Button, Form, Input, Modal, message } from "antd";
import type { InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import { deleteTeam, updateTeam } from "src/modules/agents/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface TeamDialogProps {
  open: boolean;
  onClose: () => void;
  team: TeamWithMembers | null;
}

export function TeamDialog({ open, onClose, team }: TeamDialogProps) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open && team) {
      setName(team.name);
      setSaving(false);
      setDeleting(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, team]);

  const handleSubmit = async () => {
    if (!team || !name.trim()) return;
    setSaving(true);
    try {
      await dispatch(updateTeam({ id: team.id, name: name.trim() })).unwrap();
      message.success("Team updated");
      onClose();
    } catch {
      message.error("Failed to update team");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!team) return;
    setDeleting(true);
    try {
      await dispatch(deleteTeam(team.id)).unwrap();
      message.success("Team deleted");
      onClose();
    } catch {
      message.error("Failed to delete team");
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      open={open && !!team}
      onCancel={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-field-sm w-field-sm shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <div className="text-[14px] leading-none text-muted-foreground">
              <PenNewSquareIcon size={16} />
            </div>
          </div>
          <span className="truncate font-semibold text-foreground">Edit Team</span>
        </div>
      }
      footer={
        <div className="flex items-center gap-2.5">
          <div className="mr-auto">
            <Button
              size="small"
              danger
              disabled={deleting || saving}
              icon={<TrashBinTrashIcon size={12} />}
              onClick={() => {
                Modal.confirm({
                  title: "Delete team?",
                  content: `Delete "${team?.name}"? Agents in this team will be unlinked.`,
                  okText: "Delete",
                  okType: "danger",
                  onOk: handleDelete,
                });
              }}
            >
              Delete
            </Button>
          </div>
          <Button type="text" size="small" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="small" loading={saving} onClick={handleSubmit} disabled={!name.trim()}>
            {saving ? "Saving…" : "Save"}
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
          <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKeyDown} placeholder="e.g. Backend Team, QA…" autoComplete="off" />
        </Form.Item>
      </div>
    </Modal>
  );
}
