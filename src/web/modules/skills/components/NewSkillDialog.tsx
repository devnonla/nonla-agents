import { Button, EFormItemType, Popover, SchemaForm, type TFormItemProps, message } from "devnonla-ui";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { Skill } from "src/common/types";
import { useAppDispatch } from "src/store/store";
import { defaultSkillTemplate } from "../common/frontmatter";
import { createSkill } from "../common/skillsSlice";

type NewSkillValues = {
  name: string;
  description: string;
};

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: {
      required: "Name is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
    },
    options: { placeholder: "Code Review", autoComplete: "off" },
  },
  {
    type: EFormItemType.Textarea,
    name: "description",
    label: "Description",
    colSpan: 12,
    rules: {
      required: "Description is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Description is required"),
    },
    options: { placeholder: "When to use this skill (injected into the agent prompt)", rows: 3 },
  },
];

const EMPTY: NewSkillValues = { name: "", description: "" };

export function NewSkillDialog() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<NewSkillValues>({ defaultValues: EMPTY, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open) return;
    form.reset(EMPTY);
    setSaving(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, form]);

  const handleClose = () => setOpen(false);

  const onSubmit = form.handleSubmit(async ({ name, description }) => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    setSaving(true);
    try {
      const created = (await dispatch(
        createSkill({
          name: trimmedName,
          description: trimmedDescription,
          content: defaultSkillTemplate(trimmedName, trimmedDescription),
        }),
      ).unwrap()) as Skill;
      message.success("Created");
      handleClose();
      navigate(`/skills/${created.id}`);
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow
      contentClassName="w-96 max-w-none p-0"
      content={
        <form className="flex flex-col gap-3 p-4" onSubmit={onSubmit}>
          <SchemaForm form={form} items={ITEMS} />
          {rootError ? <div className="pl-0.5 text-xs leading-snug text-destructive">{rootError}</div> : null}

          <div className="flex justify-end gap-2">
            <Button type="text" size="medium" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" size="medium" htmlType="submit" loading={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      }
    >
      <Button type="primary" icon={<Plus size={16} />}>
        New skill
      </Button>
    </Popover>
  );
}
