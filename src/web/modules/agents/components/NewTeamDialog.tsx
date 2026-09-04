import { Button, EFormItemType, Modal, SchemaForm, type TFormItemProps, message } from "@nonla-agents/ui";
import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { createTeam } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch } from "src/store/store";

interface NewTeamDialogProps {
  children: ReactNode;
}

type NewTeamValues = {
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
    options: { placeholder: "e.g. Marketing, Engineering…", autoComplete: "off" },
  },
];

const EMPTY: NewTeamValues = { name: "" };

export function NewTeamDialog({ children }: NewTeamDialogProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<NewTeamValues>({ defaultValues: EMPTY, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open) return;
    form.reset(EMPTY);
    setSaving(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, form]);

  const handleClose = () => setOpen(false);

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setSaving(true);
    try {
      await dispatch(createTeam({ name: name.trim() })).unwrap();
      message.success("Team created");
      handleClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : "Failed to create team" });
    } finally {
      setSaving(false);
    }
  });

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
            <Button type="text" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" form="new-team-form" loading={saving}>
              {saving ? "Creating…" : "Create Team"}
            </Button>
          </div>
        }
        width={420}
        destroyOnHidden
      >
        <form id="new-team-form" className="pt-4" onSubmit={onSubmit}>
          <SchemaForm form={form} items={ITEMS} />
          {rootError ? <div className="mt-4 pl-2.75 text-xs leading-snug text-destructive">{rootError}</div> : null}
        </form>
      </Modal>
    </>
  );
}

export { NewTeamDialog as NewTeamPopover };
