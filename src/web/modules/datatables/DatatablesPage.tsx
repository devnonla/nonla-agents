import { Button, Empty, Modal, Spin, message } from "@nonla-agents/ui";
import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DatatableProject } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { type DatatableProjectListItem, deleteDatatableProject, fetchDatatableProjects } from "./common/datatableProjectsSlice";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectDialog } from "./components/ProjectDialog";

export default function DatatablesPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.datatableProjects.items) as DatatableProjectListItem[];
  const [loading, setLoading] = useState(items.length === 0);
  const [dialog, setDialog] = useState<DatatableProject | "create" | null>(null);
  const [deleting, setDeleting] = useState<DatatableProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await dispatch(fetchDatatableProjects()).unwrap();
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

  return (
    <PageShell>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Datatables</h1>
        <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialog("create")}>
          New project
        </Button>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" description="No projects yet">
            <Button type="primary" icon={<AddCircleIcon size={16} />} onClick={() => setDialog("create")}>
              New project
            </Button>
          </Empty>
        }
      >
        <Spin spinning={loading && items.length === 0}>
          <div className="flex flex-col gap-3">
            {items.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={() => navigate(`/datatables/${project.id}`)} onRename={() => setDialog(project)} onDelete={() => setDeleting(project)} />
            ))}
          </div>
        </Spin>
      </RenderIf>

      <RenderIf condition={dialog !== null}>
        <ProjectDialog
          edit={dialog === "create" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            void dispatch(fetchDatatableProjects());
          }}
        />
      </RenderIf>

      <Modal
        open={!!deleting}
        title={deleting ? `Delete ${deleting.name}?` : "Delete project?"}
        okText="Delete"
        okButtonProps={{ danger: true }}
        onCancel={() => setDeleting(null)}
        onOk={async () => {
          if (!deleting) return;
          try {
            await dispatch(deleteDatatableProject(deleting.id)).unwrap();
            message.success("Deleted");
            setDeleting(null);
          } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <p className="m-0 text-sm text-muted-foreground">All tables and rows in this project will be deleted.</p>
      </Modal>
    </PageShell>
  );
}
