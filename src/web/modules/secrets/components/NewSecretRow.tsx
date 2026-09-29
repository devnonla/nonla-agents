import { Button, Tooltip } from "devnonla-ui";
import { Plus, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, type RefObject, createContext, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "src/common/lib/cn";

export interface NewSecretRowHandle {
  focusKey: () => void;
}

interface NewSecretRowProps {
  onCreate: (payload: { key: string; value: string }) => Promise<void>;
  onCancel: () => void;
  active: boolean;
  handleRef: RefObject<NewSecretRowHandle | null>;
  children: ReactNode;
}

interface NewSecretApi {
  key: string;
  setKey: (value: string) => void;
  value: string;
  setValue: (value: string) => void;
  submitting: boolean;
  canSubmit: boolean;
  keyInputRef: RefObject<HTMLInputElement | null>;
  valueInputRef: RefObject<HTMLInputElement | null>;
  onKeyKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onValueKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  submit: () => void;
  cancel: () => void;
}

const NewSecretContext = createContext<NewSecretApi | null>(null);

function useNewSecret() {
  const api = useContext(NewSecretContext);
  if (!api) throw new Error("NewSecret cells must render inside NewSecretProvider");
  return api;
}

const fieldClass = (extra: string) =>
  cn("w-full h-8 px-2.5 rounded text-xs font-mono", "bg-background/80 border border-border/60 hover:border-border text-foreground", "placeholder:text-muted-foreground/40 placeholder:font-normal", "focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 focus:bg-background transition-all", extra);

export function NewSecretProvider({ onCreate, onCancel, active, handleRef, children }: NewSecretRowProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(handleRef, () => ({
    focusKey: () => {
      keyInputRef.current?.focus();
      keyInputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  }));

  useEffect(() => {
    if (!active) return;
    keyInputRef.current?.focus();
  }, [active]);

  const submit = async () => {
    const trimmedKey = key.trim().toUpperCase();
    if (!trimmedKey || !value || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({ key: trimmedKey, value });
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!value) valueInputRef.current?.focus();
      else void submit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const onValueKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <NewSecretContext.Provider
      value={{
        key,
        setKey,
        value,
        setValue,
        submitting,
        canSubmit: key.trim().length > 0 && value.length > 0 && !submitting,
        keyInputRef,
        valueInputRef,
        onKeyKeyDown,
        onValueKeyDown,
        submit: () => void submit(),
        cancel: onCancel,
      }}
    >
      {children}
    </NewSecretContext.Provider>
  );
}

export function NewSecretKeyCell() {
  const { key, setKey, submitting, keyInputRef, onKeyKeyDown } = useNewSecret();
  return <input ref={keyInputRef} type="text" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} onKeyDown={onKeyKeyDown} placeholder="VARIABLE_NAME" disabled={submitting} className={fieldClass("font-sans font-medium")} />;
}

export function NewSecretValueCell() {
  const { value, setValue, submitting, valueInputRef, onValueKeyDown } = useNewSecret();
  return <input ref={valueInputRef} type="password" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onValueKeyDown} placeholder="Secret value..." disabled={submitting} className={fieldClass("")} />;
}

export function NewSecretActions() {
  const { canSubmit, submitting, submit, cancel } = useNewSecret();
  return (
    <div className="flex items-center justify-end gap-1">
      <Tooltip title="Cancel (Esc)">
        <Button type="text" size="small" onClick={cancel} disabled={submitting} aria-label="Cancel" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
          <X size={14} />
        </Button>
      </Tooltip>
      <Tooltip title={canSubmit ? "Add secret (Enter)" : "Enter key and value to add"}>
        <Button type="primary" size="small" onClick={submit} disabled={!canSubmit} loading={submitting} icon={submitting ? undefined : <Plus size={14} />} className="h-7 px-2.5 text-xs font-medium">
          Add
        </Button>
      </Tooltip>
    </div>
  );
}
