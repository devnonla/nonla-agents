import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { AlarmIcon } from "@solar-icons/react/dynamic/alarm";
import { Alert, Button, Form, Input, Modal, Spin, message } from "antd";
import { useEffect, useState } from "react";
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

function CreateJobDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (job: Job) => void }) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = async () => {
    const n = name.trim();
    if (!n) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const job = (await dispatch(createJob({ name: n, cron: "" })).unwrap()) as Job;
      message.success("Job created");
      onCreated(job);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="New job" onCancel={onClose} onOk={handleSubmit} okText="Create" confirmLoading={saving} destroyOnHidden>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input value={name} placeholder="Daily digest" onChange={(e) => setName(e.target.value)} autoFocus onPressEnter={() => void handleSubmit()} />
        </Form.Item>
      </Form>
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
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand/12 text-brand-soft">
              <AlarmIcon size={28} weight="BoldDuotone" />
            </div>
            <p className="mb-1 text-base font-semibold text-foreground">No jobs yet</p>
            <p className="m-0 mb-5 max-w-sm text-center text-sm text-muted-foreground">Create a script, set when it should fire, then run it manually or let the schedule take over.</p>
            <Button type="primary" icon={<AddCircleIcon size={16} weight="BoldDuotone" />} onClick={() => setShowCreate(true)}>
              New job
            </Button>
          </div>
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
