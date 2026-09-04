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
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-background p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,white_2%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,white_2%,transparent)_1px,transparent_1px)] bg-size-[48px_48px]" />

      <div className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-card">
          <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-5">
            <AppLogo size={48} />
            <h1 className="font-display text-lg font-semibold text-foreground">Nonla Agents</h1>
          </div>

          <form onSubmit={onSubmit} className="border-t border-border-subtle px-6 pt-5 pb-6">
            <SchemaForm form={form} items={ITEMS} />
            {rootError ? (
              <p role="alert" className="mb-4 text-xs font-medium text-destructive">
                {rootError}
              </p>
            ) : null}
            <Button htmlType="submit" type="primary" block loading={loading}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
