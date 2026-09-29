import { Empty, Modal, SearchInput, message } from "devnonla-ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "src/common/lib/cn";
import type { Skill } from "src/common/types";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { deleteSkill, fetchSkills } from "./common/skillsSlice";
import { NewSkillDialog } from "./components/NewSkillDialog";
import { SkillCard } from "./components/SkillCard";
import { SkillsEmptyState } from "./components/SkillsEmptyState";

export default function SkillsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.skills.items) as Skill[];
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(items.length === 0);
  const [deleting, setDeleting] = useState<Skill | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await dispatch(fetchSkills()).unwrap();
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <PageShell>
      <MissingProviderCallout />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Skills</h1>
        <div className="flex min-w-0 items-center gap-2">
          <RenderIf condition={items.length > 0}>
            <SearchInput placeholder="Search skills…" className="w-52" onChange={setQuery} />
          </RenderIf>
          <NewSkillDialog />
        </div>
      </div>

      <RenderIf condition={items.length === 0 && !loading}>
        <SkillsEmptyState>
          <NewSkillDialog />
        </SkillsEmptyState>
      </RenderIf>

      <RenderIf condition={items.length > 0 && filtered.length === 0}>
        <Empty className="rounded-2xl border border-dashed border-border-subtle bg-card/50 py-12" description="No matches" />
      </RenderIf>

      <RenderIf condition={loading && items.length === 0}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {["a", "b", "c", "d"].map((key) => (
            <div key={key} className="h-24 animate-pulse rounded-xl border border-border-subtle bg-card/70 px-4 py-3.5">
              <div className="flex gap-3">
                <div className="size-11 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted/70" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </RenderIf>

      <RenderIf condition={filtered.length > 0}>
        <div className={cn("grid gap-3", filtered.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
          {filtered.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onOpen={() => navigate(`/skills/${skill.id}`)} onDelete={() => setDeleting(skill)} />
          ))}
        </div>
      </RenderIf>

      <Modal
        open={!!deleting}
        title={deleting ? `Delete ${deleting.name}?` : "Delete skill?"}
        okText="Delete"
        okButtonProps={{ danger: true }}
        destroyOnHidden
        onCancel={() => setDeleting(null)}
        onOk={async () => {
          if (!deleting) return;
          try {
            await dispatch(deleteSkill(deleting.id)).unwrap();
            message.success("Deleted");
            setDeleting(null);
          } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <p className="m-0 text-sm text-muted-foreground">This cannot be undone.</p>
      </Modal>
    </PageShell>
  );
}
