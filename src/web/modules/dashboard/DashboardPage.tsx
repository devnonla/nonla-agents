import { BotIcon } from "@solar-icons/react/dynamic/bot";
import { ChatRoundIcon } from "@solar-icons/react/dynamic/chat-round";
import { GlobalIcon } from "@solar-icons/react/dynamic/global";
import { PlugCircleIcon } from "@solar-icons/react/dynamic/plug-circle";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "src/common/types";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { fetchTeams } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function crewLine(agentCount: number, runningCount: number): string {
  if (agentCount === 0) return "No agents on deck yet.";
  if (runningCount > 0) return `${runningCount} agent${runningCount === 1 ? "" : "s"} mid-mission. The rest are standing by.`;
  if (agentCount === 1) return "One agent on deck.";
  return `${agentCount} agents on deck.`;
}

const JUMPS = [
  {
    to: "/agents",
    title: "Agents",
    blurb: "Build, prompt, and publish your crew.",
    icon: BotIcon,
    tone: "text-brand-soft",
  },
  {
    to: "/tools",
    title: "Tools",
    blurb: "Wire capabilities agents can call.",
    icon: ProgrammingIcon,
    tone: "text-link",
  },
  {
    to: "/mcp-servers",
    title: "MCP servers",
    blurb: "Connect external tool servers.",
    icon: PlugCircleIcon,
    tone: "text-warn",
  },
] as const;

export default function DashboardPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const user = useAppSelector((s) => s.auth.user);
  const agents = useAppSelector((s) => s.agents.items) as Agent[];
  const teams = useAppSelector((s) => s.teams.teams);

  useEffect(() => {
    dispatch(fetchAgents());
    dispatch(fetchTeams());
  }, [dispatch]);

  const displayName = user?.name || user?.username || "there";
  const greeting = greetingForHour(new Date().getHours());

  const { runningCount, publishedCount } = useMemo(() => {
    return {
      runningCount: agents.filter((a) => a.runStatus === "running").length,
      publishedCount: agents.filter((a) => a.isPublic).length,
    };
  }, [agents]);

  return (
    <PageShell>
      <MissingProviderCallout />

      <section className="mb-10 rounded-2xl border border-border-subtle bg-card px-6 py-7 sm:px-8 sm:py-8">
        <div className="min-w-0 max-w-xl">
          <p className="m-0 mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-brand-soft">
            <span className="size-1.5 rounded-full bg-brand-soft motion-safe:animate-pulse" />
            Agent desk
          </p>
          <h1 className="m-0 text-2xl font-semibold leading-tight text-foreground">
            {greeting}, {displayName}
          </h1>
          <p className="mt-2 m-0 text-base text-muted-foreground">{crewLine(agents.length, runningCount)}</p>
        </div>

        <div className="mt-7 flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate("/agents")} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-background/60 px-3 py-2 text-sm text-foreground transition-colors hover:border-brand/40 hover:bg-accent cursor-pointer">
            <BotIcon size={16} className="text-brand-soft" />
            <span className="font-medium">{agents.length}</span>
            <span className="text-muted-foreground">agents</span>
          </button>
          <button type="button" onClick={() => navigate("/agents")} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-background/60 px-3 py-2 text-sm text-foreground transition-colors hover:border-brand/40 hover:bg-accent cursor-pointer">
            <ChatRoundIcon size={16} className="text-success" />
            <span className="font-medium">{runningCount}</span>
            <span className="text-muted-foreground">running</span>
          </button>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-background/60 px-3 py-2 text-sm text-foreground">
            <GlobalIcon size={16} className="text-link" />
            <span className="font-medium">{publishedCount}</span>
            <span className="text-muted-foreground">published</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-background/60 px-3 py-2 text-sm text-foreground">
            <UsersGroupTwoRoundedIcon size={16} className="text-warn" />
            <span className="font-medium">{teams.length}</span>
            <span className="text-muted-foreground">teams</span>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="m-0 text-lg font-semibold text-foreground">Jump in</h2>
          <p className="mt-1 m-0 text-sm text-muted-foreground">Quick paths while this desk stays light.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {JUMPS.map(({ to, title, blurb, icon: Icon, tone }) => (
            <button key={to} type="button" onClick={() => navigate(to)} className="group flex flex-col items-start gap-4 rounded-xl border border-border-subtle bg-card px-5 py-5 text-left transition-colors duration-150 hover:border-brand/35 hover:bg-secondary cursor-pointer">
              <span className={`flex size-9 items-center justify-center rounded-lg bg-muted ${tone}`}>
                <Icon size={18} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-brand-soft">{title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
