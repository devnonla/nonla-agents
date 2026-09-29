import { Button, DesktopStage, Input, MeadowWallpaper } from "devnonla-ui";
import { type ReactNode, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import meadowWallpaper from "src/assets/bg.jpg";
import { FluentIcon } from "src/components/FluentIcon";
import RenderIf from "src/components/RenderIf";

type UnlockValues = {
  password: string;
};

type PublicUnlockScreenProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  error: string;
  verifying: boolean;
  onSubmit: (password: string) => void;
};

export function PublicUnlockScreen({ icon, title, description, error, verifying, onSubmit }: PublicUnlockScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UnlockValues>({ defaultValues: { password: "" }, mode: "onSubmit" });
  const { ref: rhfRef, ...passwordField } = register("password", { required: "Password is required" });

  useEffect(() => {
    if (verifying) return;
    const focus = () => {
      const el = inputRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    };
    focus();
    const raf = requestAnimationFrame(focus);
    const t0 = window.setTimeout(focus, 0);
    const t1 = window.setTimeout(focus, 80);
    window.addEventListener("pageshow", focus);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.removeEventListener("pageshow", focus);
    };
  }, [verifying]);

  return (
    <DesktopStage>
      <MeadowWallpaper src={meadowWallpaper} />
      <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--background)_28%,transparent)]" aria-hidden />
      {/* Mobile: top-align so keyboard doesn't bury the input; desktop stays centered */}
      <div className="relative z-10 flex h-full items-start justify-center overflow-y-auto overscroll-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:px-6 sm:py-6">
        <section className="w-full max-w-sm my-2 sm:my-auto" aria-labelledby="unlock-title">
          <div className="overflow-hidden rounded-md border border-border bg-card shadow-(--elevated-shadow)">
            <div className="flex h-8 items-center gap-2 border-b border-border/35 bg-background px-3" aria-hidden>
              <FluentIcon name="lock-closed-24" size={16} className="text-brand" />
              <span className="text-[13px] font-semibold text-foreground">Unlock</span>
            </div>

            <div className="flex flex-col items-center px-5 pt-5 pb-4 text-center sm:px-6 sm:pt-7 sm:pb-5">
              <div className="relative mb-3 sm:mb-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-1/2 size-22 -translate-x-1/2 -translate-y-1/2 rounded-full sm:size-26"
                  style={{
                    background: "radial-gradient(circle, color-mix(in oklab, var(--brand) 26%, transparent) 0%, transparent 70%)",
                  }}
                />
                <div className="relative flex size-12 items-center justify-center overflow-hidden rounded-full border border-brand/30 bg-card text-brand sm:size-14">{icon}</div>
              </div>
              <h1 id="unlock-title" className="m-0 max-w-full truncate text-lg font-semibold leading-7 tracking-tight text-foreground sm:text-xl">
                {title}
              </h1>
              <RenderIf condition={!!description}>
                <p className="mt-1.5 mb-0 max-w-xs text-sm leading-5 text-tertiary-foreground">{description}</p>
              </RenderIf>
            </div>

            <form
              onSubmit={handleSubmit(({ password }) => {
                onSubmit(password);
              })}
              className="border-t border-border-subtle px-5 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6"
            >
              <label htmlFor="unlock-password" className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <Input
                id="unlock-password"
                type="password"
                size="large"
                placeholder="Enter the password"
                autoComplete="current-password"
                autoFocus
                enterKeyHint="go"
                inputMode="text"
                disabled={verifying}
                status={errors.password ? "error" : undefined}
                className="w-full"
                {...passwordField}
                style={{ fontSize: 16 }}
                ref={(node) => {
                  rhfRef(node);
                  inputRef.current = node;
                }}
                onFocus={(e) => {
                  // Keep field visible above the soft keyboard on short viewports
                  if (window.matchMedia("(max-width: 640px)").matches) {
                    window.setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
                  }
                }}
              />
              <RenderIf condition={!!errors.password?.message}>
                <p className="mt-1.5 mb-0 text-xs text-destructive">{errors.password?.message}</p>
              </RenderIf>
              <RenderIf condition={!!error}>
                <div role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                  <p className="m-0 text-xs font-medium text-destructive">{error}</p>
                </div>
              </RenderIf>
              <Button htmlType="submit" type="primary" size="large" block loading={verifying} className="mt-4 min-h-11">
                Unlock
              </Button>
            </form>
          </div>
        </section>
      </div>
    </DesktopStage>
  );
}
