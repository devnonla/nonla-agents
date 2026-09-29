import { Button, DesktopStage, EFormItemType, MeadowWallpaper, SchemaForm, type TFormItemProps } from "devnonla-ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import meadowWallpaper from "src/assets/bg.jpg";
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
    <DesktopStage>
      <MeadowWallpaper src={meadowWallpaper} />
      <div className="relative z-10 flex h-full items-center justify-center overflow-y-auto p-6">
        <div className="relative w-full max-w-sm animate-fadeIn overflow-hidden rounded-md border border-border bg-card shadow-(--elevated-shadow)">
          <div className="flex items-center gap-2 h-8 px-3 bg-background border-b border-border/35">
            <AppLogo size={16} />
            <span className="text-[13px] font-semibold text-foreground">Sign in</span>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-1.5 pb-6">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Welcome back</h2>
              <p className="text-sm text-muted-foreground">Enter your credentials to open the desk.</p>
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
          </div>
        </div>
      </div>
    </DesktopStage>
  );
}
