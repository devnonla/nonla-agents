import { Button, FluentIcon, WindowHeader, message } from "devnonla-ui";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { wsClient } from "src/common/api/wsClient";
import { cn } from "src/common/lib/cn";
import type { Job, JobRun } from "src/common/types";
import { AgentSidePanel, AgentToggleButton } from "src/components/AgentSidePanel";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import { type EditorInstance, MonacoDiffEditor, MonacoEditor } from "src/components/MonacoEditor";
import { WindowHeaderBackButton } from "src/components/WindowHeaderBackButton";
import { jobsApi } from "../common/jobsApi";
import { type JobSchedule, buildJobCrons, formatJobSchedulesLabel, jobIsScheduled, parseJobSchedules, validateJobSchedules } from "../common/schedule";
import { JobAgentPanel } from "./components/JobAgentPanel";
import { type JobSettingsSection, JobSettingsView } from "./components/JobSettingsView";

export default function JobEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const settingsOpen = pathname.endsWith("/settings");

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSchedules, setSavingSchedules] = useState(false);
  const [running, setRunning] = useState(false);
  const [settingsSection, setSettingsSection] = useState<JobSettingsSection>("general");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedules, setSchedules] = useState<JobSchedule[]>([]);
  const [timeoutMs, setTimeoutMs] = useState(300_000);

  const [localCode, setLocalCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const codeRef = useRef(localCode);
  codeRef.current = localCode;
  const savedCodeRef = useRef(savedCode);
  savedCodeRef.current = savedCode;
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  const [runs, setRuns] = useState<JobRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [agentGenerating, setAgentGenerating] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);

  const isDirty = localCode !== savedCode;
  const schedulesDirty = buildJobCrons(schedules) !== (job?.cron ?? "");
  const isOn = jobIsScheduled(job?.cron);
  const scheduleLabel = formatJobSchedulesLabel(job?.cron);

  const loadRuns = useCallback(async (jobId: string) => {
    const res = await jobsApi.listRuns(jobId, { limit: 40 });
    setRuns(res.items);
    const live = res.items.find((r) => r.status === "running");
    setActiveRunId(live?.id ?? null);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadedIdRef.current = null;
    void (async () => {
      try {
        const data = await jobsApi.get(id);
        setJob(data);
        setName(data.name);
        setDescription(data.description ?? "");
        setSchedules(parseJobSchedules(data.cron));
        setTimeoutMs(data.timeoutMs);
        if (loadedIdRef.current !== data.id) {
          setLocalCode(data.code);
          setSavedCode(data.code);
          loadedIdRef.current = data.id;
          if (data.draftCode && data.draftCode !== data.code) {
            setCodeDraft(data.draftCode);
          } else {
            setCodeDraft(null);
          }
        }
        await loadRuns(id);
      } catch {
        setJob(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadRuns]);

  useEffect(() => {
    if (!id) return;
    const unsubJob = wsClient.on<Partial<Job> & { id: string }>("jobs:updated", (payload) => {
      if (payload.id !== id) return;
      if ("code" in payload && payload.code != null) {
        setSavedCode(payload.code);
        setLocalCode(payload.code);
        setCodeDraft((prev) => (prev !== null && prev === payload.code ? null : prev));
      }
      if ("draftCode" in payload && payload.draftCode != null) {
        const draft = payload.draftCode;
        const code = payload.code ?? codeRef.current;
        setCodeDraft(draft !== code ? draft : null);
      }
      if ("name" in payload && payload.name) setName(payload.name);
      if ("cron" in payload && typeof payload.cron === "string") {
        setSchedules((prev) => (buildJobCrons(prev) === payload.cron ? parseJobSchedules(payload.cron) : prev));
      }
      if ("timeoutMs" in payload && typeof payload.timeoutMs === "number") setTimeoutMs(payload.timeoutMs);
      setJob((prev) => (prev ? { ...prev, ...payload } : prev));
    });

    const unsubRun = wsClient.on<JobRun>("job_runs:created", (payload) => {
      if (payload.jobId !== id) return;
      setRuns((prev) => [payload, ...prev.filter((r) => r.id !== payload.id)]);
      if (payload.status === "running") {
        setActiveRunId(payload.id);
      }
    });

    const unsubRunUpd = wsClient.on<JobRun>("job_runs:updated", (payload) => {
      if (payload.jobId !== id) return;
      setRuns((prev) => prev.map((r) => (r.id === payload.id ? payload : r)));
      if (payload.status !== "running" && activeRunId === payload.id) {
        setActiveRunId(null);
      }
    });

    const unsubLog = wsClient.on<{ id: string; jobId: string; entries: JobRun["logs"]; logs: JobRun["logs"] }>("job_runs:log", (payload) => {
      if (payload.jobId !== id) return;
      setRuns((prev) => prev.map((r) => (r.id === payload.id ? { ...r, logs: payload.logs } : r)));
    });

    return () => {
      unsubJob();
      unsubRun();
      unsubRunUpd();
      unsubLog();
    };
  }, [id, activeRunId]);

  const applyServerState = useCallback((j: Job) => {
    setJob(j);
    setName(j.name);
    setDescription(j.description ?? "");
    setTimeoutMs(j.timeoutMs);
    const published = j.code;
    const localWasClean = codeRef.current === savedCodeRef.current;
    setSavedCode(published);
    if (localWasClean) setLocalCode(published);
    setCodeDraft(j.draftCode && j.draftCode !== published ? j.draftCode : null);
  }, []);

  const handleSaveCode = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await jobsApi.update(id, { code: localCode });
      setJob(updated);
      setSavedCode(updated.code);
      setLocalCode(updated.code);
      setCodeDraft(null);
      message.success("Saved");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (values: { name: string; description: string; timeoutMs: number }) => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await jobsApi.update(id, {
        name: values.name.trim(),
        description: values.description.trim() || null,
        timeoutMs: Number(values.timeoutMs) || 300_000,
      });
      setJob(updated);
      setName(updated.name);
      setDescription(updated.description ?? "");
      setTimeoutMs(updated.timeoutMs);
      message.success("Saved");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchedules = async () => {
    if (!id) return;
    const scheduleError = validateJobSchedules(schedules);
    if (scheduleError) {
      message.error(scheduleError);
      return;
    }
    setSavingSchedules(true);
    try {
      const updated = await jobsApi.update(id, { cron: buildJobCrons(schedules) });
      setJob(updated);
      setSchedules(parseJobSchedules(updated.cron));
      message.success(jobIsScheduled(updated.cron) ? "Schedules saved" : "Schedules cleared — job is off");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSchedules(false);
    }
  };

  const handleRun = async () => {
    if (!id) return;
    if (isDirty) {
      message.warning("Save before running scheduled job code");
      return;
    }
    setRunning(true);
    try {
      const run = await jobsApi.run(id);
      setActiveRunId(run.id);
      setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
      message.success("Run started");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleCancelRun = async (runId?: string | null) => {
    if (!id) return;
    const targetId = runId ?? activeRunId;
    if (!targetId) return;
    try {
      const run = await jobsApi.cancelRun(id, targetId);
      setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
      message.success("Cancel requested");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await jobsApi.remove(id);
      message.success("Deleted");
      navigate("/jobs");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">Loading…</div>;
  }

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-foreground">Job not found</p>
        <Button onClick={() => navigate("/jobs")}>Back to Jobs</Button>
      </div>
    );
  }

  const showDiff = codeDraft !== null && codeDraft !== localCode && !agentGenerating;
  const reviewBar = showDiff ? (
    <DraftReviewBar
      onApprove={() => {
        const draft = codeDraft;
        if (!draft) return;
        setLocalCode(draft);
        setSavedCode(draft);
        setCodeDraft(null);
        if (id) void jobsApi.update(id, { code: draft });
      }}
      onDiscard={() => {
        setCodeDraft(null);
        if (id) void jobsApi.update(id, { code: localCode });
      }}
    />
  ) : isDirty ? (
    <DraftReviewBar
      approving={saving}
      onApprove={() => void handleSaveCode()}
      onDiscard={() => setLocalCode(savedCode)}
      discardConfirm={{
        title: "Discard changes?",
        description: "Reset the editor to the last saved version. Unsaved edits will be lost.",
      }}
    />
  ) : null;

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", settingsOpen ? "bg-transparent" : "bg-background")}>
      <WindowHeader
        left={
          <div className="flex min-w-0 items-center gap-2">
            <WindowHeaderBackButton to={settingsOpen ? `/jobs/${id}` : "/jobs"} label={settingsOpen ? "Back to job" : "Back to Jobs"} />
            <FluentIcon name="calendar-clock-24" size={16} className="shrink-0" />
            <span className="min-w-0 max-w-48 truncate text-[12px] font-semibold leading-none text-foreground/90">{name || job.name}</span>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none ${isOn ? "bg-success/15 text-success" : "bg-muted text-tertiary-foreground"}`}>
              <span className={`size-1.5 rounded-full ${isOn ? "bg-success" : "bg-quaternary-foreground"}`} />
              {isOn ? "On" : "Off"}
            </span>
            <span className="hidden min-w-0 truncate text-[11px] leading-none text-tertiary-foreground md:inline">{scheduleLabel}</span>
          </div>
        }
        right={
          <div className="flex shrink-0 items-center gap-1.5">
            {activeRunId ? (
              <Button size="small" danger icon={<X size={14} />} onClick={() => void handleCancelRun()}>
                Stop
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(settingsOpen ? `/jobs/${id}` : `/jobs/${id}/settings`)}
              aria-pressed={settingsOpen}
              aria-label={settingsOpen ? "Close settings" : "Job settings"}
              title="Settings"
              className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 transition-colors", settingsOpen ? "bg-brand/15 text-brand-700 hover:bg-brand/20" : "bg-transparent text-muted-foreground hover:bg-black/6 hover:text-foreground")}
            >
              <FluentIcon name="settings-24" size={14} />
            </button>
            {settingsOpen ? null : <AgentToggleButton open={agentOpen} onClick={() => setAgentOpen((v) => !v)} />}
          </div>
        }
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className={cn("flex min-h-0 min-w-0 flex-1 overflow-hidden", settingsOpen && "hidden")}>
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
              {showDiff && codeDraft != null ? (
                <div className="absolute inset-0">
                  <MonacoDiffEditor
                    language="typescript"
                    original={localCode}
                    modified={codeDraft}
                    options={{ fontSize: 13, renderSideBySide: false, renderIndicators: false }}
                    onMount={(editor) => {
                      editor.getOriginalEditor().updateOptions({ lineNumbers: "off" });
                    }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0">
                  <MonacoEditor
                    language="typescript"
                    value={localCode}
                    onChange={(v) => setLocalCode(v ?? "")}
                    onMount={(editor) => {
                      editorRef.current = editor;
                    }}
                    onSave={() => void handleSaveCode()}
                    options={{ fontSize: 13, tabSize: 2 }}
                    height="100%"
                  />
                </div>
              )}

              {reviewBar ? <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">{reviewBar}</div> : null}
            </div>
          </div>

          <AgentSidePanel open={agentOpen}>
            <JobAgentPanel
              jobId={id!}
              onServerSync={applyServerState}
              onGeneratingChange={setAgentGenerating}
              onRunStarted={() => {
                setSettingsSection("activities");
              }}
              onBeforeSend={async () => {
                if (!isDirty || !id) return;
                try {
                  const updated = await jobsApi.update(id, { code: localCode });
                  applyServerState(updated);
                } catch {
                  /* still send */
                }
              }}
            />
          </AgentSidePanel>
        </div>
        {settingsOpen ? (
          <div className="absolute inset-0 flex min-h-0">
            <JobSettingsView
              section={settingsSection}
              onSectionChange={setSettingsSection}
              name={name}
              description={description}
              timeoutMs={timeoutMs}
              savingGeneral={saving}
              onSaveGeneral={handleSaveSettings}
              onDelete={() => void handleDelete()}
              schedules={schedules}
              onSchedulesChange={setSchedules}
              onDiscardSchedules={() => setSchedules(parseJobSchedules(job.cron))}
              schedulesDirty={schedulesDirty}
              savingSchedules={savingSchedules}
              onSaveSchedules={() => void handleSaveSchedules()}
              runs={runs}
              activeRunId={activeRunId}
              running={running}
              onRun={() => void handleRun()}
              onCancelRun={(runId) => void handleCancelRun(runId)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
