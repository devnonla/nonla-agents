import { Button, EFormItemType, SchemaForm, type TFormItemProps } from "@nonla-agents/ui";
import { type ReactNode, useMemo } from "react";
import { useForm } from "react-hook-form";
import RenderIf from "src/components/RenderIf";

type UnlockValues = {
  password: string;
};

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "password",
    label: "Password",
    colSpan: 12,
    rules: { required: "Password is required" },
    options: { type: "password", placeholder: "Enter the password", autoComplete: "current-password", autoFocus: true, size: "large" },
  },
];

type PublicUnlockScreenProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  error: string;
  verifying: boolean;
  onSubmit: (password: string) => void;
};

export function PublicUnlockScreen({ icon, title, description, error, verifying, onSubmit }: PublicUnlockScreenProps) {
  const form = useForm<UnlockValues>({ defaultValues: { password: "" }, mode: "onSubmit" });
  const items = useMemo(() => ITEMS.map((item) => ({ ...item, options: { ...item.options, disabled: verifying } })), [verifying]);

  const handleSubmit = form.handleSubmit(({ password }) => {
    onSubmit(password);
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-background p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--brand)_9%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_6%,transparent)_1px,transparent_1px)] bg-size-[48px_48px]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-136 bg-[radial-gradient(ellipse_56%_46%_at_50%_0%,color-mix(in_oklab,var(--brand)_22%,transparent),transparent)]" />

      <div className="relative w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center sm:px-8">
            <div className="relative mb-5">
              <div
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: "radial-gradient(circle, color-mix(in oklab, var(--brand) 28%, transparent) 0%, transparent 70%)",
                }}
              />
              <div
                className="relative rounded-full p-0.5"
                style={{
                  background: "linear-gradient(145deg, color-mix(in oklab, var(--brand-soft) 55%, transparent), transparent 60%)",
                }}
              >
                <div className="flex size-18 items-center justify-center overflow-hidden rounded-full bg-popover">{icon}</div>
              </div>
            </div>
            <h1 className="m-0 max-w-full text-2xl font-semibold leading-8 tracking-tight text-foreground">{title}</h1>
            <RenderIf condition={!!description}>
              <p className="mt-2 mb-0 max-w-sm text-sm leading-5 text-tertiary-foreground">{description}</p>
            </RenderIf>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border-subtle px-6 py-6 sm:px-8 sm:pb-8">
            <SchemaForm form={form} items={items} />
            <RenderIf condition={!!error}>
              <div role="alert" className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                <p className="text-xs text-destructive font-medium">{error}</p>
              </div>
            </RenderIf>
            <Button htmlType="submit" type="primary" size="large" block loading={verifying}>
              Unlock
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
