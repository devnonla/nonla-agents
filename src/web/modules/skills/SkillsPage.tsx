import { Button, Empty, Input } from "@nonla-agents/ui";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Skill } from "src/common/types";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { fetchSkills } from "./common/skillsSlice";
import { NewSkillDialog } from "./components/NewSkillDialog";
import { SkillsEmptyState } from "./components/SkillsEmptyState";
import { SkillsTable } from "./components/SkillsTable";

export default function SkillsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector((s) => s.skills.items) as Skill[];
  const [query, setQuery] = useState("");

  useEffect(() => {
    dispatch(fetchSkills());
  }, [dispatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <PageShell>
      <MissingProviderCallout />
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Skills</h1>
        <NewSkillDialog>
          <Button type="primary" icon={<AddIcon size={16} />}>
            New skill
          </Button>
        </NewSkillDialog>
      </div>

      <RenderIf condition={items.length > 0}>
        <div className="mb-4">
          <Input allowClear prefix={<MagnifierIcon size={14} className="text-muted-foreground" />} placeholder="Search skills…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
        </div>
      </RenderIf>

      <RenderIf condition={items.length === 0}>
        <SkillsEmptyState />
      </RenderIf>

      <RenderIf condition={items.length > 0 && filtered.length === 0}>
        <Empty className="py-12" description="No matches" />
      </RenderIf>

      <RenderIf condition={filtered.length > 0}>
        <SkillsTable skills={filtered} onNavigate={(id) => navigate(`/skills/${id}`)} />
      </RenderIf>
    </PageShell>
  );
}
