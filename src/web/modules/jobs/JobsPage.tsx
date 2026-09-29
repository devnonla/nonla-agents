import { Button, EFormItemType, Empty, Popover, SchemaForm, type TFormItemProps, message } from "devnonla-ui";
import { Plus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { wsClient } from "src/common/api/wsClient";
import { useNow } from "src/common/hooks/useNow";
import type { Job } from "src/common/types";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { createJob, fetchJobs, removeJobLocal, updateJobLocal, upsertJobLocal } from "./common/jobsSlice";
import { jobIsScheduled } from "./common/schedule";
import { JobsTree } from "./components/JobCard";

type CreateJobValues = { name: string };

const CREATE_JOB_ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: {
      required: "Name is required",
      validate: (value) => (typeof value === "string" && value.trim() ? true : "Name is required"),
    },
    options: { placeholder: "Daily digest", autoFocus: true },
  },
];

function NewJobPopover({ children, placement = "bottomRight" }: { children: ReactNode; placement?: "bottom" | "bottomRight" }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<CreateJobValues>({ defaultValues: { name: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (!open) return;
    form.reset({ name: "" });
    setSaving(false);
    const t = window.setTimeout(() => form.setFocus("name"), 150);
    return () => window.clearTimeout(t);
  }, [open, form]);

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setSaving(true);
    try {
      const job = (await dispatch(createJob({ name: name.trim(), cron: "" })).unwrap()) as Job;
      message.success("Job created");
      setOpen(false);
      navigate(`/jobs/${job.id}`);
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement={placement}
      arrow
      contentClassName="w-80 max-w-none p-0"
      content={
        <form className="flex flex-col gap-3 p-4" onSubmit={onSubmit}>
          <p className="m-0 text-sm font-medium text-foreground">New job</p>
          <SchemaForm form={form} items={CREATE_JOB_ITEMS} />
          {rootError ? <p className="m-0 text-xs text-destructive">{rootError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="text" size="medium" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" size="medium" htmlType="submit" loading={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      }
    >
      {children}
    </Popover>
  );
}

function JobsSkeleton() {
  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      {["a", "b", "c", "d"].map((key) => (
        <div key={key} className="ml-8 h-9 animate-pulse rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

function hasUpcomingNextRun(items: Job[]): boolean {
  const now = Date.now();
  return items.some((j) => {
    if (!j.nextRunAt || !jobIsScheduled(j.cron)) return false;
    const at = j.nextRunAt instanceof Date ? j.nextRunAt.getTime() : new Date(j.nextRunAt).getTime();
    const diff = at - now;
    return diff > 0;
  });
}

export default function JobsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.jobs.items) as Job[];
  const [loading, setLoading] = useState(items.length === 0);
  const now = useNow(hasUpcomingNextRun(items) ? 1_000 : 15_000);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await dispatch(fetchJobs({ limit: 100, sorts: "-updatedAt" })).unwrap();
      } catch (err: unknown) {
        if (!cancelled) message.error(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    const unsubUpdated = wsClient.on<Partial<Job> & { id: string }>("jobs:updated", (payload) => {
      dispatch(updateJobLocal(payload));
    });
    const unsubCreated = wsClient.on<Job>("jobs:created", (payload) => {
      dispatch(upsertJobLocal(payload));
    });
    const unsubDeleted = wsClient.on<{ id: string }>("jobs:deleted", (payload) => {
      dispatch(removeJobLocal(payload.id));
    });
    return () => {
      unsubUpdated();
      unsubCreated();
      unsubDeleted();
    };
  }, [dispatch]);

  return (
    <PageShell className="pt-6">
      <MissingProviderCallout />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Jobs</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">Scheduled jobs run on their own. Off jobs stay idle until a schedule is added.</p>
        </div>
        <NewJobPopover>
          <Button type="primary" className="shrink-0" icon={<Plus size={16} />}>
            New job
          </Button>
        </NewJobPopover>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" description="No jobs yet">
            <NewJobPopover placement="bottom">
              <Button type="primary" icon={<Plus size={16} />}>
                New job
              </Button>
            </NewJobPopover>
          </Empty>
        }
      >
        <RenderIf condition={loading && items.length === 0}>
          <JobsSkeleton />
        </RenderIf>
        <RenderIf condition={items.length > 0}>
          <JobsTree jobs={items} now={now} onOpen={(job) => navigate(`/jobs/${job.id}`)} />
        </RenderIf>
      </RenderIf>
    </PageShell>
  );
}
