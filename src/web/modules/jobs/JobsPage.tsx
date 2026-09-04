import { Button, EFormItemType, Empty, Modal, SchemaForm, Spin, type TFormItemProps, message } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { useEffect, useState } from "react";
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
import { JobCard } from "./components/JobCard";

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

function CreateJobDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (job: Job) => void }) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const form = useForm<CreateJobValues>({ defaultValues: { name: "" }, mode: "onSubmit" });
  const rootError = form.formState.errors.root?.message;

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setSaving(true);
    try {
      const job = (await dispatch(createJob({ name: name.trim(), cron: "" })).unwrap()) as Job;
      message.success("Job created");
      onCreated(job);
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open title="New job" onCancel={onClose} okText="Create" confirmLoading={saving} destroyOnHidden onOk={() => void onSubmit()}>
      <form id="create-job-form" onSubmit={onSubmit}>
        <SchemaForm form={form} items={CREATE_JOB_ITEMS} />
        {rootError ? <p className="mb-0 text-sm text-destructive">{rootError}</p> : null}
      </form>
    </Modal>
  );
}

function hasImminentNextRun(items: Job[]): boolean {
  const now = Date.now();
  return items.some((j) => {
    if (!j.nextRunAt || !jobIsScheduled(j.cron)) return false;
    const at = j.nextRunAt instanceof Date ? j.nextRunAt.getTime() : new Date(j.nextRunAt).getTime();
    const diff = at - now;
    return diff > 0 && diff < 150_000;
  });
}

export default function JobsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.jobs.items) as Job[];
  const [loading, setLoading] = useState(items.length === 0);
  const [showCreate, setShowCreate] = useState(false);
  const now = useNow(hasImminentNextRun(items) ? 1_000 : 15_000);

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
    <PageShell>
      <MissingProviderCallout />
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Jobs</h1>
        <Button type="primary" icon={<AddCircleIcon size={16} weight="BoldDuotone" />} onClick={() => setShowCreate(true)}>
          New job
        </Button>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" description="No jobs yet">
            <Button type="primary" icon={<AddCircleIcon size={16} weight="BoldDuotone" />} onClick={() => setShowCreate(true)}>
              New job
            </Button>
          </Empty>
        }
      >
        <Spin spinning={loading && items.length === 0}>
          <div className="flex flex-col gap-2">
            {items.map((job) => (
              <JobCard key={job.id} job={job} now={now} onOpen={() => navigate(`/jobs/${job.id}`)} />
            ))}
          </div>
        </Spin>
      </RenderIf>

      <RenderIf condition={showCreate}>
        <CreateJobDialog
          onClose={() => setShowCreate(false)}
          onCreated={(job) => {
            navigate(`/jobs/${job.id}`);
          }}
        />
      </RenderIf>
    </PageShell>
  );
}
