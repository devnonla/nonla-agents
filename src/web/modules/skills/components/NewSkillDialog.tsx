import { AddIcon } from "@solar-icons/react/dynamic/add";
import { Button, Form, Input, Modal, message } from "antd";
import type { InputRef } from "antd";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Skill } from "src/common/types";
import { useAppDispatch } from "src/store/store";
import { defaultSkillTemplate } from "../common/frontmatter";
import { createSkill } from "../common/skillsSlice";

export function NewSkillDialog({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const nameRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setError("");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open]);

  const handleClose = () => setOpen(false);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (!trimmedDescription) {
      setError("Description is required");
      return;
    }
    setSaving(true);
    setError("");
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
                <AddIcon size={16} />
              </div>
            </div>
            <span className="truncate font-semibold text-foreground">New skill</span>
          </div>
        }
        width={420}
        destroyOnHidden
        footer={
          <div className="flex justify-end gap-2.5">
            <Button type="text" size="small" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" size="small" loading={saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-4">
          <Form.Item
            label={
              <span className="text-muted-foreground">
                Name<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input
              ref={nameRef}
              value={name}
              placeholder="Code Review"
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
            />
          </Form.Item>

          <Form.Item
            label={
              <span className="text-muted-foreground">
                Description<span className="text-destructive"> *</span>
              </span>
            }
            className="mb-0!"
            layout="vertical"
          >
            <Input.TextArea
              rows={3}
              value={description}
              placeholder="When to use this skill (injected into the agent prompt)"
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError("");
              }}
            />
          </Form.Item>

          {error && <div className="text-[12px] font-medium text-destructive">{error}</div>}
        </div>
      </Modal>
    </>
  );
}
