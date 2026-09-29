import { Button, Empty, Modal, message } from "devnonla-ui";
import { Plus } from "lucide-react";
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Datatables</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">Structured tables agents can query.</p>
        </div>
        <Button type="primary" icon={<Plus size={16} />} onClick={() => setDialog("create")}>
          New project
        </Button>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <Empty className="rounded-2xl border border-dashed border-border px-5 py-16" description="No projects yet">
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setDialog("create")}>
              New project
            </Button>
          </Empty>
        }
      >
        <RenderIf
          condition={loading && items.length === 0}
          fallback={
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {items.map((project) => (
                <ProjectCard key={project.id} project={project} onOpen={() => navigate(`/datatables/${project.id}`)} onRename={() => setDialog(project)} onDelete={() => setDeleting(project)} />
              ))}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {["a", "b", "c", "d"].map((key) => (
              <div key={key} className="h-27 animate-pulse rounded-xl border border-border-subtle bg-card px-4 py-3.5">
                <div className="flex gap-3">
                  <div className="size-9 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-1/3 rounded bg-muted" />
                    <div className="h-3 w-16 rounded bg-muted/70" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </RenderIf>
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
