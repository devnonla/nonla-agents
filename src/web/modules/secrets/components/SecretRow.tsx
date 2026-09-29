import { EditableInput } from "devnonla-ui";
import type { SecretEntry } from "src/common/types";

export type SecretEditField = "key" | "value";

interface SecretCellProps {
  entry: SecretEntry;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (id: string, patch: { key?: string; value?: string }) => Promise<void>;
}

export function SecretKeyCell({ entry, editing, onStartEdit, onCancelEdit, onUpdate }: SecretCellProps) {
  return (
    <div className="[&_code]:font-sans [&_code]:font-medium [&_code]:tracking-normal">
      <EditableInput.Key size="small" value={entry.key} editing={editing} onStartEdit={onStartEdit} onCancelEdit={onCancelEdit} onSave={(key) => onUpdate(entry.id, { key })} />
    </div>
  );
}

export function SecretValueCell({ entry, editing, onStartEdit, onCancelEdit, onUpdate }: SecretCellProps) {
  return (
    <EditableInput
      size="small"
      display={<span className="font-mono text-xs tracking-widest text-muted-foreground select-none">••••••••••••••••••••</span>}
      editing={editing}
      onStartEdit={onStartEdit}
      onCancelEdit={onCancelEdit}
      initialValue=""
      placeholder="New secret value"
      type="password"
      onSave={(value) => onUpdate(entry.id, { value })}
    />
  );
}
