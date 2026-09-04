import { Button, EFormItemType, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { deleteTeam, updateTeam } from "src/modules/agents/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface TeamDialogProps {
  open: boolean;
  onClose: () => void;
  team: TeamWithMembers | null;
}

type TeamValues = {
  name: string;
};

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Team Name",
    colSpan: 12,
    rules: {
      required: "Please enter a team name",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Please enter a team name"),
    },
    options: { placeholder: "e.g. Backend Team, QA…", autoComplete: "off" },
  },
];

export function TeamDialog({ open, onClose, team }: TeamDialogProps) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const form = useForm<TeamValues>({ defaultValues: { name: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open || !team) return;
    form.reset({ name: team.name });
    setSaving(false);
    setDeleting(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, team, form]);

  const onSubmit = form.handleSubmit(async ({ name }) => {
    if (!team) return;
    setSaving(true);
    try {
      await dispatch(updateTeam({ id: team.id, name: name.trim() })).unwrap();
      message.success("Team updated");
      onClose();
    } catch {
      form.setError("root", { message: "Failed to update team" });
    } finally {
      setSaving(false);
    }
  });

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
              size="medium"
              danger
              disabled={deleting || saving}
              icon={<TrashBinTrashIcon size={14} />}
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
          <Button type="text" size="medium" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" size="medium" htmlType="submit" form="edit-team-form" loading={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
      width={420}
      destroyOnHidden
    >
      <form id="edit-team-form" className="pt-4" onSubmit={onSubmit}>
        <SchemaForm form={form} items={ITEMS} />
        {rootError ? <div className="mt-4 pl-2.75 text-xs leading-snug text-destructive">{rootError}</div> : null}
      </form>
    </Modal>
  );
}
