import { Button, EFormItemType, SchemaForm, type TFormItemProps } from "@nonla-agents/ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getAuthToken, setAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";

type LoginValues = {
  username: string;
  password: string;
};

const ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "username",
    label: "Username",
    colSpan: 12,
    rules: {
      required: "Username is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Username is required"),
    },
    options: { placeholder: "Enter your username", autoComplete: "username", autoFocus: true },
  },
  {
    type: EFormItemType.Input,
    name: "password",
    label: "Password",
    colSpan: 12,
    rules: { required: "Password is required" },
    options: { type: "password", placeholder: "Enter your password", autoComplete: "current-password" },
  },
];

const EMPTY: LoginValues = { username: "", password: "" };

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const form = useForm<LoginValues>({ defaultValues: EMPTY, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    const check = async () => {
      try {
        const status = await apiClient.get<{ needsSetup: boolean }>("/api/auth/setup-status");
        if (status.needsSetup) {
          navigate("/setup", { replace: true });
          return;
        }

        const token = getAuthToken();
        if (token) {
          try {
            await apiClient.get("/api/auth/me");
            navigate("/", { replace: true });
            return;
          } catch {
            clearAuthToken();
          }
        }
      } catch {
        /* show login form */
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [navigate]);

  const onSubmit = form.handleSubmit(async ({ username, password }) => {
    setLoading(true);
    try {
      const result = await apiClient.post<{ token: string; refreshToken: string; user: User }>("/api/auth/login", {
        username,
        password,
      });
      setAuthToken(result.token, result.refreshToken);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : "Login failed" });
    } finally {
      setLoading(false);
    }
  });

  if (checking) return null;

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      {/* Brand stage — desktop only */}
      <aside className="relative hidden w-[46%] flex-col overflow-hidden border-r border-border-subtle p-12 lg:flex xl:p-16">
        <div className="pointer-events-none absolute -top-32 -left-32 size-120 rounded-full bg-brand/10 blur-[110px]" />
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-100 rounded-full bg-brand/12 blur-[100px]" />
        <AppLogo size={620} className="pointer-events-none absolute -right-24 -bottom-20 opacity-[0.12]" />

        <div className="relative flex items-center gap-2.5">
          <AppLogo size={30} />
          <span className="text-sm font-semibold tracking-tight text-foreground">Nonla Agents</span>
        </div>

        <div className="relative flex flex-1 flex-col justify-center gap-5">
          <span className="text-2xs font-semibold tracking-[0.22em] text-brand uppercase">Self-hosted agent console</span>
          <h1 className="max-w-md text-4xl font-semibold tracking-tight text-foreground xl:max-w-2xl xl:text-[44px] xl:leading-[1.15]">
            Your agents, tools and sites.
            <br />
            <span className="text-muted-foreground">One console, your machine.</span>
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground xl:max-w-md">Build AI agents, wire custom tools, and ship sites — all from a single self-hosted workspace.</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {["AI agents with memory", "Custom tools & MCP servers", "Scheduled jobs & sites"].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-tertiary-foreground">
                <span className="size-1 rounded-full bg-brand/70" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Sign-in panel */}
      <main className="relative flex flex-1 items-center justify-center overflow-y-auto p-5 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--foreground)_5%,transparent)_1px,transparent_0)] bg-size-[26px_26px] mask-[radial-gradient(ellipse_70%_60%_at_50%_45%,black,transparent)]" />
        <div className="pointer-events-none absolute -top-24 right-0 size-90 rounded-full bg-brand/8 blur-[100px]" />

        <div className="relative w-full max-w-sm animate-fadeIn">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <AppLogo size={52} />
            <span className="text-base font-semibold tracking-tight text-foreground">Nonla Agents</span>
          </div>

          <div className="flex flex-col gap-1.5 pb-6">
            <span className="text-2xs font-semibold tracking-[0.22em] text-brand uppercase">Sign in</span>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Enter your credentials to open the console.</p>
          </div>

          <form onSubmit={onSubmit}>
            <SchemaForm form={form} items={ITEMS} />
            {rootError ? (
              <div role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                <p className="text-xs font-medium text-destructive">{rootError}</p>
              </div>
            ) : null}
            <Button htmlType="submit" type="primary" size="large" block loading={loading}>
              Sign in
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-2">
            <span className="size-1.5 rounded-full bg-brand/60" />
            <span className="text-2xs text-quaternary-foreground">Nonla Agents</span>
          </div>
        </div>
      </main>
    </div>
  );
}
