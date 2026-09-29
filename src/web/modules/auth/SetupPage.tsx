/**
 * SetupPage — initial admin setup page.
 *
 * Shown when the app is freshly installed and no admin exists.
 * Creates the first admin account + sets system timezone.
 */

import { Button, DesktopStage, EFormItemType, MeadowWallpaper, SchemaForm, type TFormItemProps, message } from "devnonla-ui";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import meadowWallpaper from "src/assets/bg.jpg";
import { apiClient, setAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";

interface TimezoneItem {
  tz: string;
  offset: string;
}

type SetupValues = {
  name: string;
  username: string;
  password: string;
  confirmPassword: string;
  timezone: string;
};

const EMPTY: SetupValues = { name: "", username: "", password: "", confirmPassword: "", timezone: "" };

export default function SetupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [timezoneChoices, setTimezoneChoices] = useState<{ value: string; label: string }[]>([]);
  const form = useForm<SetupValues>({ defaultValues: EMPTY, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    apiClient
      .get<{ needsSetup: boolean }>("/api/auth/setup-status")
      .then((res) => {
        if (!res.needsSetup) {
          navigate("/login", { replace: true });
        }
      })
      .catch(() => {
        /* still show setup page */
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  useEffect(() => {
    apiClient
      .get<TimezoneItem[]>("/api/settings/timezones")
      .then((items) => {
        setTimezoneChoices(items.map((item) => ({ value: item.tz, label: `${item.tz} (${item.offset})` })));
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected && items.some((i) => i.tz === detected)) {
          form.setValue("timezone", detected);
        }
      })
      .catch(() => {
        /* user can still select timezone */
      });
  }, [form]);

  const accountItems: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Input,
        name: "name",
        label: "Name",
        colSpan: 12,
        rules: {
          required: "Name is required",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
        },
        options: { placeholder: "Your display name", autoComplete: "name", autoFocus: true, disabled: loading },
      },
      {
        type: EFormItemType.Input,
        name: "username",
        label: "Username",
        colSpan: 12,
        rules: {
          required: "Username is required",
          validate: (value) => (typeof value === "string" && value.trim() ? true : "Username is required"),
        },
        options: { placeholder: "Choose a username", autoComplete: "username", disabled: loading },
      },
      {
        type: EFormItemType.Input,
        name: "password",
        label: "Password",
        colSpan: 12,
        rules: {
          required: "Password is required",
          minLength: { value: 8, message: "Password must be at least 8 characters" },
        },
        options: { type: "password", placeholder: "At least 8 characters", autoComplete: "new-password", disabled: loading },
      },
      {
        type: EFormItemType.Input,
        name: "confirmPassword",
        label: "Confirm Password",
        colSpan: 12,
        rules: {
          required: "Please confirm your password",
          validate: (value, values) => value === (values as SetupValues).password || "Passwords do not match",
        },
        options: { type: "password", placeholder: "Re-enter your password", autoComplete: "new-password", disabled: loading },
      },
    ],
    [loading],
  );

  const timezoneItems: TFormItemProps[] = useMemo(
    () => [
      {
        type: EFormItemType.Select,
        name: "timezone",
        label: "Timezone",
        colSpan: 12,
        choices: timezoneChoices,
        rules: { required: "Please select a timezone" },
        options: { placeholder: "Select timezone...", searchable: true, disabled: loading },
      },
    ],
    [timezoneChoices, loading],
  );

  const onSubmit = form.handleSubmit(async ({ name, username, password, timezone }) => {
    setLoading(true);
    try {
      const result = await apiClient.post<{ token: string; refreshToken: string; user: User }>("/api/auth/setup", {
        username: username.trim(),
        name: name.trim(),
        password,
        timezone,
      });
      setAuthToken(result.token, result.refreshToken);
      message.success(`Welcome, ${result.user.name}! Setup complete.`);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : "Setup failed" });
    } finally {
      setLoading(false);
    }
  });

  if (checking) return null;

  return (
    <DesktopStage>
      <MeadowWallpaper src={meadowWallpaper} />
      <div className="relative z-10 flex h-full items-center justify-center overflow-y-auto p-6">
        <div className="relative w-full max-w-110 mx-4 overflow-hidden rounded-md border border-border bg-card shadow-(--elevated-shadow)">
          <div className="flex items-center gap-2 h-8 px-3 bg-background border-b border-border/35">
            <AppLogo size={16} />
            <span className="text-[13px] font-semibold text-foreground">Initial Setup</span>
          </div>
          <div className="px-6 pb-6 pt-6">
            <p className="text-sm text-muted-foreground text-center mb-4">Create your admin account and configure the system</p>

            <form onSubmit={onSubmit}>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">Admin Account</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <SchemaForm form={form} items={accountItems} />

              <div className="flex items-center gap-2 mt-2 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">System Settings</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <SchemaForm form={form} items={timezoneItems} />

              {rootError ? (
                <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                  <p className="text-xs font-medium text-destructive">{rootError}</p>
                </div>
              ) : null}

              <Button htmlType="submit" type="primary" size="large" block loading={loading} className="mt-1">
                Complete Setup
              </Button>
            </form>
          </div>
        </div>
      </div>
    </DesktopStage>
  );
}
