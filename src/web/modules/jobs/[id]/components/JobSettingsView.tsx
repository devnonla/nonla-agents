import { Button, EFormItemType, FluentIcon, Popconfirm, SchemaForm, Sidebar, type SidebarItemType, type TFormItemProps, Tag } from "devnonla-ui";
import { Play, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { cn } from "src/common/lib/cn";
import type { JobRun } from "src/common/types";
import { DraftReviewBar } from "src/components/DraftReviewBar";
import { type JobSchedule, buildJobCrons, jobIsScheduled } from "../../common/schedule";
import { JobRunsPanel } from "../../components/JobRunsPanel";
import { JobSchedulesEditor } from "../../components/JobSchedulesEditor";

export type JobSettingsSection = "general" | "schedules" | "activities";

const SECTIONS: { id: JobSettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings-24" },
  { id: "schedules", label: "Schedules", icon: "calendar-clock-24" },
  { id: "activities", label: "Activities", icon: "history-24" },
];

const GENERAL_ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: {
      required: "Name is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
    },
  },
  {
    type: EFormItemType.Textarea,
    name: "description",
    label: "Description",
    colSpan: 12,
    options: { rows: 3 },
  },
  {
    type: EFormItemType.Number,
    name: "timeoutMs",
    label: "Timeout (ms)",
    colSpan: 12,
    options: { min: 1000, step: 1000 },
  },
];

type GeneralValues = { name: string; description: string; timeoutMs: number };

interface JobSettingsViewProps {
  section: JobSettingsSection;
  onSectionChange: (section: JobSettingsSection) => void;
  name: string;
  description: string;
  timeoutMs: number;
  savingGeneral: boolean;
  onSaveGeneral: (values: GeneralValues) => Promise<void>;
  onDelete: () => void;
  schedules: JobSchedule[];
  onSchedulesChange: (next: JobSchedule[]) => void;
  onDiscardSchedules: () => void;
  schedulesDirty: boolean;
  savingSchedules: boolean;
  onSaveSchedules: () => void;
  runs: JobRun[];
  activeRunId: string | null;
  running: boolean;
  onRun: () => void;
  onCancelRun: (runId?: string | null) => void;
}

export function JobSettingsView({ section, onSectionChange, name, description, timeoutMs, savingGeneral, onSaveGeneral, onDelete, schedules, onSchedulesChange, onDiscardSchedules, schedulesDirty, savingSchedules, onSaveSchedules, runs, activeRunId, running, onRun, onCancelRun }: JobSettingsViewProps) {
  const form = useForm<GeneralValues>({
    defaultValues: { name, description, timeoutMs },
    mode: "onSubmit",
  });

  useEffect(() => {
    form.reset({ name, description, timeoutMs });
  }, [name, description, timeoutMs, form]);

  const generalDirty = form.formState.isDirty;
  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];
  const fullBleed = section === "activities";

  const items: SidebarItemType[] = SECTIONS.map((item) => ({
    key: item.id,
    label: item.label,
    icon: item.icon,
    extra: item.id === "activities" && activeRunId ? <span className="inline-block size-1.5 animate-pulse rounded-full bg-brand-700" /> : undefined,
  }));

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <Sidebar aria-label="Job settings" className="w-56 shrink-0 border-r border-border" items={items} selectedKey={section} onSelect={({ key }) => onSectionChange(key as JobSettingsSection)} />

      <section className={cn("relative min-h-0 min-w-0 flex-1", fullBleed ? "flex flex-col overflow-hidden" : "overflow-y-auto overscroll-contain px-6 pb-8 pt-5")}>
        {section === "general" ? (
          <div className="mx-auto w-full max-w-xl">
            <SectionTitle icon={active.icon} label={active.label} />
            <form
              onSubmit={form.handleSubmit(async (values) => {
                await onSaveGeneral(values);
              })}
            >
              <SchemaForm form={form} items={GENERAL_ITEMS} />
            </form>
            <div className="mt-8 border-t border-border-subtle pt-4">
              <p className="m-0 text-[11px] font-medium text-muted-foreground">Danger zone</p>
              <p className="mb-3 mt-1 text-xs text-tertiary-foreground">Permanently remove this job and its run history.</p>
              <Popconfirm title="Delete this job?" description="This cannot be undone." okText="Delete" okType="danger" onConfirm={onDelete}>
                <Button size="small" danger icon={<X size={14} />}>
                  Delete job
                </Button>
              </Popconfirm>
            </div>
            {generalDirty ? (
              <div className="sticky bottom-4 z-20 mt-8 flex justify-center">
                <DraftReviewBar
                  approving={savingGeneral}
                  onApprove={() => void form.handleSubmit(onSaveGeneral)()}
                  onDiscard={() => form.reset({ name, description, timeoutMs })}
                  discardConfirm={{
                    title: "Discard changes?",
                    description: "Reset these fields to the last saved values.",
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {section === "schedules" ? (
          <div className="mx-auto w-full max-w-xl">
            <SectionTitle icon={active.icon} label={active.label} />
            <p className="mb-4 mt-0 text-sm text-muted-foreground">{jobIsScheduled(buildJobCrons(schedules)) ? "Job runs on these schedules. Clear all to turn it off." : "Add a schedule to turn this job on."}</p>
            <JobSchedulesEditor value={schedules} onChange={onSchedulesChange} />
            {schedulesDirty ? (
              <div className="sticky bottom-4 z-20 mt-8 flex justify-center">
                <DraftReviewBar
                  approving={savingSchedules}
                  onApprove={onSaveSchedules}
                  onDiscard={onDiscardSchedules}
                  discardConfirm={{
                    title: "Discard schedule changes?",
                    description: "Reset schedules to the last saved version.",
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {section === "activities" ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2.5">
              <FluentIcon name={active.icon} size={18} className="shrink-0 text-muted-foreground" />
              <h2 className="m-0 text-lg font-semibold leading-tight text-foreground">Activities</h2>
              {activeRunId ? (
                <Tag color="processing" className="m-0 text-[10px]">
                  live
                </Tag>
              ) : null}
              <span className="text-xs text-muted-foreground">{runs.length} total</span>
              <div className="ml-auto flex items-center gap-2">
                {activeRunId ? (
                  <Button size="small" danger icon={<X size={14} />} onClick={() => onCancelRun()}>
                    Stop
                  </Button>
                ) : null}
                <Button type="primary" size="small" icon={<Play size={14} />} loading={running} onClick={onRun}>
                  Run
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <JobRunsPanel runs={runs} activeRunId={activeRunId} onCancelRun={(runId) => onCancelRun(runId)} />
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <FluentIcon name={icon} size={18} className="shrink-0 text-muted-foreground" />
      <h2 className="m-0 text-lg font-semibold leading-tight text-foreground">{label}</h2>
    </div>
  );
}
