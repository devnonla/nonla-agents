import { Button, Popconfirm, Table, message } from "@nonla-agents/ui";
import type { ColumnsType } from "@nonla-agents/ui";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { StarsIcon } from "@solar-icons/react/dynamic/stars";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { useMemo } from "react";
import type { Skill } from "src/common/types";
import { useAppDispatch } from "src/store/store";
import { deleteSkill } from "../common/skillsSlice";

export function SkillsTable({ skills, onNavigate }: { skills: Skill[]; onNavigate: (id: string) => void }) {
  const dispatch = useAppDispatch();

  const columns: ColumnsType<Skill> = useMemo(
    () => [
      {
        title: "Name",
        dataIndex: "name",
        key: "name",
        width: 280,
        render: (name: string) => (
          <div className="flex min-w-0 items-center gap-2">
            <StarsIcon size={16} weight="BoldDuotone" className="shrink-0 text-edge-skill" />
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
          </div>
        ),
      },
      {
        title: "Description",
        dataIndex: "description",
        key: "description",
        ellipsis: true,
        render: (description: string) => <span className="text-sm text-muted-foreground">{description}</span>,
      },
      {
        title: "",
        key: "actions",
        width: 88,
        render: (_, row) => (
          <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Button type="text" size="small" aria-label={`Edit ${row.name}`} icon={<PenNewSquareIcon size={16} />} onClick={() => onNavigate(row.id)} />
            <Popconfirm
              title={`Delete ${row.name}?`}
              description="This cannot be undone."
              okText="Delete"
              okType="danger"
              onConfirm={async () => {
                try {
                  await dispatch(deleteSkill(row.id)).unwrap();
                  message.success("Deleted");
                } catch (err) {
                  message.error(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              <Button type="text" size="small" danger aria-label={`Delete ${row.name}`} icon={<TrashBinMinimalisticIcon size={16} />} />
            </Popconfirm>
          </div>
        ),
      },
    ],
    [dispatch, onNavigate],
  );

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={skills}
      pagination={false}
      size="small"
      onRow={(row) => ({
        className: "group cursor-pointer",
        onClick: () => onNavigate(row.id),
      })}
    />
  );
}
