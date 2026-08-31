/**
 * SetupPage — initial admin setup page.
 *
 * Shown when the app is freshly installed and no admin exists.
 * Creates the first admin account + sets system timezone.
 */

import { Button, Form, Input, Select, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, setAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import RenderIf from "src/components/RenderIf";

interface TimezoneItem {
  tz: string;
  offset: string;
}

interface TimezoneOption {
  value: string;
  label: string;
}

export default function SetupPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [timezoneOptions, setTimezoneOptions] = useState<TimezoneOption[]>([]);
  const [checking, setChecking] = useState(true);

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
        const options = items.map((item) => ({
          value: item.tz,
          label: `${item.tz} (${item.offset})`,
        }));
        setTimezoneOptions(options);

        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected && items.some((i) => i.tz === detected)) {
          setTimezone(detected);
        }
      })
      .catch(() => {
        /* user can still select timezone */
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !name || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!timezone) {
      setError("Please select a timezone");
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.post<{ token: string; refreshToken: string; user: User }>("/api/auth/setup", {
        username,
        name,
        password,
        timezone,
      });
      setAuthToken(result.token, result.refreshToken);
      message.success(`Welcome, ${result.user.name}! Setup complete.`);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background overflow-y-auto py-8">
      <div className="relative w-full max-w-110 mx-4">
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <div className="flex flex-col items-center pt-8 pb-4 px-6">
            <div className="mb-4">
              <AppLogo size={48} />
            </div>
            <h1 className="font-display text-xl font-medium text-foreground mb-1">Initial Setup</h1>
            <p className="text-sm text-muted-foreground text-center">Create your admin account and configure the system</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">Admin Account</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Form.Item label="Name" layout="vertical" required className="mb-0!">
                <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your display name" autoComplete="name" autoFocus disabled={loading} />
              </Form.Item>

              <Form.Item label="Username" layout="vertical" required className="mb-0!">
                <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" autoComplete="username" disabled={loading} />
              </Form.Item>

              <Form.Item label="Password" layout="vertical" required className="mb-0!">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" disabled={loading} />
              </Form.Item>

              <Form.Item label="Confirm Password" layout="vertical" required className="mb-0!">
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" disabled={loading} />
              </Form.Item>

              <div className="flex items-center gap-2 mt-2 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">System Settings</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Form.Item label="Timezone" layout="vertical" required className="mb-0!">
                <Select value={timezone || undefined} onChange={(val) => setTimezone(val)} options={timezoneOptions} placeholder="Select timezone..." showSearch={{ optionFilterProp: "label" }} className="w-full" disabled={loading} />
              </Form.Item>

              <RenderIf condition={!!error}>
                <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive font-medium">{error}</p>
                </div>
              </RenderIf>

              <Button htmlType="submit" type="primary" size="large" block loading={loading} className="mt-1">
                Complete Setup
              </Button>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-center mt-4 gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span className="text-[10px] text-muted-foreground font-mono">Nonla Agents</span>
        </div>
      </div>
    </div>
  );
}
