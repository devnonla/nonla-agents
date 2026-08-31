import { Button, Form, Input, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getAuthToken, setAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import RenderIf from "src/components/RenderIf";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter both username and password");
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.post<{ token: string; refreshToken: string; user: User }>("/api/auth/login", {
        username,
        password,
      });
      setAuthToken(result.token, result.refreshToken);
      message.success(`Welcome back, ${result.user.name || result.user.username}!`);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-background p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--brand)_9%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_6%,transparent)_1px,transparent_1px)] bg-size-[48px_48px]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-136 bg-[radial-gradient(ellipse_56%_46%_at_50%_0%,color-mix(in_oklab,var(--brand)_22%,transparent),transparent)]" />

      <div className="relative w-full max-w-md">
        <div className="mb-3 flex items-center justify-between px-1 text-2xs font-medium tracking-[0.16em] text-tertiary-foreground">
          <span>ACCESS CONSOLE</span>
          <span className="flex items-center gap-1.5 text-brand-soft">
            <span className="size-1.5 rounded-full bg-brand-soft" />
            SIGN IN
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border-subtle px-6 py-6 sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-xl border border-brand/30 bg-brand/10">
                <AppLogo size={40} />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium tracking-[0.08em] text-brand-soft">NONLA AGENTS</p>
                <h1 className="text-xl font-semibold leading-8 text-foreground">Welcome back</h1>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-5 text-tertiary-foreground">Sign in to manage your agents, tools, and workflows.</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-6 sm:px-8 sm:pb-8">
            <div className="flex flex-col gap-5">
              <Form.Item label={<span className="text-foreground">Username</span>} layout="vertical" required className="mb-0!">
                <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" autoComplete="username" autoFocus disabled={loading} size="large" />
              </Form.Item>

              <Form.Item label={<span className="text-foreground">Password</span>} layout="vertical" required className="mb-0!">
                <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" disabled={loading} size="large" />
              </Form.Item>

              <RenderIf condition={!!error}>
                <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                  <p className="text-xs text-destructive font-medium">{error}</p>
                </div>
              </RenderIf>

              <Button htmlType="submit" type="primary" size="large" block loading={loading} className="mt-1 h-10! rounded-md!">
                Sign in to workspace
              </Button>
            </div>
          </form>
        </div>

        <p className="mt-5 text-center text-xs leading-4 text-quaternary-foreground">Use the account created during initial setup.</p>
      </div>
    </div>
  );
}
