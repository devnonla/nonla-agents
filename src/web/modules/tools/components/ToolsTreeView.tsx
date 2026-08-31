import { type CollisionDetection, DndContext, type DragEndEvent, type DragOverEvent, DragOverlay, type DragStartEvent, PointerSensor, type UniqueIdentifier, closestCorners, getFirstCollision, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { FolderIcon } from "@solar-icons/react/dynamic/folder";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { Button, Dropdown, Modal, Tag, message } from "antd";
import type { MenuProps } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentTool } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { cn } from "src/lib/utils";
import { useAppDispatch } from "src/store/store";
import type { ToolFolderWithTools } from "../common/toolFoldersSlice";
import { fetchTools, reorderTools, reorderToolsLocal } from "../common/toolsSlice";
import { AddToolDialog } from "./AddToolDialog";
import { ToolIcon } from "./ToolIcon";

const UNGROUPED_ID = "ungrouped";

interface ToolsTreeViewProps {
  tools: AgentTool[];
  folders: ToolFolderWithTools[];
  onToolClick: (toolId: string) => void;
  onToolCreated: (toolId: string) => void;
  onEditFolder: (folder: ToolFolderWithTools) => void;
  onDeleteFolder: (folderId: string) => void;
  onCreateFolder: () => void;
}

type Items = Record<string, string[]>;

type FolderMeta = {
  key: string;
  title: string;
  folderId: string | null;
  folder?: ToolFolderWithTools;
  editable: boolean;
};

function sortFolders(folders: ToolFolderWithTools[]) {
  return [...folders].sort((a, b) => {
    const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (byOrder !== 0) return byOrder;
    return a.name.localeCompare(b.name);
  });
}

function buildItems(tools: AgentTool[], folders: ToolFolderWithTools[]): Items {
  const sortedFolders = sortFolders(folders);
  const folderIds = new Set(sortedFolders.map((f) => f.id));
  const byId = new Map(tools.map((t) => [t.id, t]));
  const bySortOrder = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const byOrder = (byId.get(a)?.sortOrder ?? 0) - (byId.get(b)?.sortOrder ?? 0);
      if (byOrder !== 0) return byOrder;
      return (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? "");
    });

  const items: Items = { [UNGROUPED_ID]: [] };
  for (const folder of sortedFolders) {
    items[folder.id] = [];
  }

  for (const tool of tools) {
    if (tool.folderId && folderIds.has(tool.folderId)) {
      items[tool.folderId].push(tool.id);
    } else {
      items[UNGROUPED_ID].push(tool.id);
    }
  }

  for (const key of Object.keys(items)) {
    items[key] = bySortOrder(items[key]);
  }
  return items;
}

function buildFolderMetas(folders: ToolFolderWithTools[], items: Items, keepUngrouped = false): FolderMeta[] {
  const metas: FolderMeta[] = sortFolders(folders).map((folder) => ({
    key: folder.id,
    title: folder.name,
    folderId: folder.id,
    folder,
    editable: true,
  }));

  if (keepUngrouped || (items[UNGROUPED_ID]?.length ?? 0) > 0 || metas.length === 0) {
    metas.push({
      key: UNGROUPED_ID,
      title: "Ungrouped",
      folderId: null,
      editable: false,
    });
  }

  return metas;
}

function sameOrder(a: string[] = [], b: string[] = []) {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function containerToFolderId(containerId: string): string | null {
  return containerId === UNGROUPED_ID ? null : containerId;
}

function findContainerIn(items: Items, id: UniqueIdentifier): string | undefined {
  const sid = String(id);
  if (sid in items) return sid;
  return Object.keys(items).find((key) => items[key].includes(sid));
}

function FolderMenu({ title, onEdit, onDelete }: { title: string; onEdit?: () => void; onDelete?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: (
        <div className="flex items-center gap-2">
          <PenNewSquareIcon size={14} />
          Edit
        </div>
      ),
      onClick: () => onEdit?.(),
    },
    {
      key: "delete",
      danger: true,
      label: (
        <div className="flex items-center gap-2">
          <TrashBinTrashIcon size={14} />
          Delete
        </div>
      ),
      onClick: () => {
        Modal.confirm({
          title: "Delete folder?",
          content: `Delete "${title}"? Tools in this folder will move to Ungrouped.`,
          okText: "Delete",
          okButtonProps: { danger: true },
          cancelText: "Cancel",
          onOk: () => onDelete?.(),
        });
      },
    },
  ];

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen} menu={{ items: menuItems, style: { minWidth: 160 } }}>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Folder actions"
        onClick={(e) => e.stopPropagation()}
      >
        <MenuDotsIcon size={14} weight="Bold" />
      </button>
    </Dropdown>
  );
}

const TREE_STROKE = "text-muted-foreground/40";
const TREE_LINE_FILL = "bg-muted-foreground/40";

function TreeGuide({ isLast }: { isLast: boolean }) {
  return (
    <div className={cn("pointer-events-none relative w-8 shrink-0 self-stretch", TREE_STROKE)} aria-hidden>
      <RenderIf
        condition={isLast}
        fallback={
          <>
            <div className={cn("absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2", TREE_LINE_FILL)} />
            <div className={cn("absolute left-1/2 top-1/2 h-px w-4 -translate-y-1/2", TREE_LINE_FILL)} />
          </>
        }
      >
        <div className={cn("absolute left-1/2 top-0 w-px -translate-x-1/2", TREE_LINE_FILL, "h-[calc(50%-7px)]")} />
        <svg className="absolute left-[calc(50%-0.5px)] top-[calc(50%-7px)] overflow-visible" width="17" height="8" viewBox="0 0 17 8" fill="none">
          <path d="M0.5 0 V1.5 Q0.5 7.5 8 7.5 H17" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </RenderIf>
    </div>
  );
}

function ToolRowView({
  tool,
  onClick,
  isLast,
  className,
  style,
  innerRef,
  listeners,
  attributes,
  dragging,
}: {
  tool: AgentTool;
  onClick?: () => void;
  isLast?: boolean;
  className?: string;
  style?: React.CSSProperties;
  innerRef?: (node: HTMLElement | null) => void;
  listeners?: React.HTMLAttributes<HTMLElement>;
  attributes?: React.HTMLAttributes<HTMLElement>;
  dragging?: boolean;
}) {
  const paramCount = Object.keys((tool.parameters as { properties?: Record<string, unknown> })?.properties ?? {}).length;

  return (
    <div ref={innerRef} style={style} className={cn("relative flex items-stretch", className)}>
      <RenderIf condition={isLast !== undefined}>
        <TreeGuide isLast={!!isLast} />
      </RenderIf>
      <button
        type="button"
        onClick={onClick}
        className={cn("group/tool flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors cursor-grab active:cursor-grabbing touch-none", !dragging && "hover:bg-muted/55", dragging && "cursor-grabbing bg-muted/70 ring-1 ring-border shadow-lg")}
        {...listeners}
        {...attributes}
      >
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset", tool.isActive ? "bg-success/10 text-success ring-success/20" : "bg-destructive/10 text-destructive ring-destructive/20")}>
          <ToolIcon icon={tool.icon} size={14} fallback={<ProgrammingIcon size={14} />} />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="min-w-0 truncate font-mono text-[13px] leading-snug text-foreground/90 group-hover/tool:text-foreground transition-colors">{tool.label}</span>
          <RenderIf condition={!tool.isActive}>
            <Tag variant="filled" className="m-0! shrink-0 rounded-md text-[10px] leading-none">
              Inactive
            </Tag>
          </RenderIf>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80 opacity-0 transition-opacity group-hover/tool:opacity-100">{paramCount > 0 ? `${paramCount} param${paramCount === 1 ? "" : "s"}` : "No params"}</span>
      </button>
    </div>
  );
}

function SortableToolRow({
  tool,
  onClick,
  isLast,
}: {
  tool: AgentTool;
  onClick: () => void;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tool.id,
    data: { type: "tool", toolId: tool.id, folderId: tool.folderId ?? null },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return <ToolRowView tool={tool} onClick={isDragging ? undefined : onClick} isLast={isLast} innerRef={setNodeRef} listeners={listeners} attributes={attributes} style={style} className={cn(isDragging && "opacity-40 z-10")} />;
}

function FolderNode({
  meta,
  tools,
  onToolClick,
  onToolCreated,
  onEditFolder,
  onDeleteFolder,
}: {
  meta: FolderMeta;
  tools: AgentTool[];
  onToolClick: (toolId: string) => void;
  onToolCreated: (toolId: string) => void;
  onEditFolder: (folder: ToolFolderWithTools) => void;
  onDeleteFolder: (folderId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: meta.key,
    data: { type: "folder", folderId: meta.folderId },
  });

  const toolIds = tools.map((t) => t.id);

  return (
    <div ref={setNodeRef} className={cn("flex flex-col gap-1 rounded-xl transition-colors", isOver && "bg-muted/35 ring-1 ring-border/80")}>
      <div className="group/folder flex items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5">
          <div className="flex w-8 shrink-0 items-center justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground/80 ring-1 ring-inset ring-border">
              <FolderIcon size={15} weight="Bold" />
            </div>
          </div>
          <span className="shrink-0 text-[15px] font-semibold tracking-tight text-foreground">{meta.title}</span>
        </div>

        <AddToolDialog onCreated={onToolCreated} defaultFolderId={meta.folderId} triggerClassName="inline-flex shrink-0">
          <button type="button" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100" aria-label="Add tool" title="Add tool">
            <AddIcon size={14} />
          </button>
        </AddToolDialog>

        <RenderIf condition={meta.editable && !!meta.folder}>
          <FolderMenu title={meta.title} onEdit={() => meta.folder && onEditFolder(meta.folder)} onDelete={() => meta.folder && onDeleteFolder(meta.folder.id)} />
        </RenderIf>
      </div>

      <div className="relative">
        <div className={cn("absolute left-4 top-0 w-px -translate-x-1/2", TREE_LINE_FILL, "h-2.5")} aria-hidden />
        <RenderIf
          condition={tools.length > 0}
          fallback={
            <div className="relative flex items-stretch min-h-10">
              <TreeGuide isLast />
              <p className="m-0 px-2 py-3 text-[12px] text-muted-foreground">Drop tools here</p>
            </div>
          }
        >
          <SortableContext items={toolIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-0.5 pt-1">
              {tools.map((tool, index) => (
                <SortableToolRow key={tool.id} tool={tool} onClick={() => onToolClick(tool.id)} isLast={index === tools.length - 1} />
              ))}
            </div>
          </SortableContext>
        </RenderIf>
      </div>
    </div>
  );
}

export function ToolsTreeView({ tools, folders, onToolClick, onToolCreated, onEditFolder, onDeleteFolder, onCreateFolder }: ToolsTreeViewProps) {
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<Items>(() => buildItems(tools, folders));
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const didDragRef = useRef(false);
  const isDraggingRef = useRef(false);
  const clonedItemsRef = useRef<Items | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const toolsById = useMemo(() => {
    const map = new Map<string, AgentTool>();
    for (const tool of tools) map.set(tool.id, tool);
    return map;
  }, [tools]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setItems(buildItems(tools, folders));
  }, [tools, folders]);

  const folderMetas = useMemo(() => buildFolderMetas(folders, items, !!activeToolId), [folders, items, activeToolId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerIntersections = pointerWithin(args);
      const intersections = pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        if (overId === args.active.id) {
          lastOverId.current = overId;
          return [{ id: overId }];
        }

        if (String(overId) in items) {
          const containerItems = items[String(overId)];
          if (containerItems.length > 0) {
            overId = closestCorners({
              ...args,
              droppableContainers: args.droppableContainers.filter((c) => c.id !== overId && containerItems.includes(String(c.id))),
            })[0]?.id;
          }
        }

        lastOverId.current = overId;
        return [{ id: overId }];
      }

      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = args.active.id;
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [items],
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    didDragRef.current = true;
    isDraggingRef.current = true;
    recentlyMovedToNewContainer.current = false;
    clonedItemsRef.current = items;
    setActiveToolId(String(active.id));
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || recentlyMovedToNewContainer.current) return;

    const overId = String(over.id);
    const activeId = String(active.id);

    setItems((prev) => {
      const activeContainer = findContainerIn(prev, activeId);
      const overContainer = findContainerIn(prev, overId);
      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.indexOf(activeId);
      if (activeIndex < 0) return prev;

      let newIndex: number;
      if (overId in prev) {
        newIndex = overItems.length + 1;
      } else {
        const overIndex = overItems.indexOf(overId);
        const isBelowOverItem = !!active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      recentlyMovedToNewContainer.current = true;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== activeId),
        [overContainer]: [...overItems.slice(0, newIndex), activeItems[activeIndex], ...overItems.slice(newIndex)],
      };
    });
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    recentlyMovedToNewContainer.current = false;
    const activeId = String(active.id);
    const cloned = clonedItemsRef.current;
    const currentContainer = findContainerIn(items, activeId);
    const overContainer = over ? (findContainerIn(items, over.id) ?? currentContainer) : currentContainer;

    if (!currentContainer || !overContainer || !over) {
      if (cloned) setItems(cloned);
      clonedItemsRef.current = null;
      isDraggingRef.current = false;
      setActiveToolId(null);
      return;
    }

    let nextItems = items;
    const overIndex = items[overContainer].indexOf(String(over.id));
    const activeIndex = items[overContainer].indexOf(activeId);

    if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
      nextItems = {
        ...items,
        [overContainer]: arrayMove(items[overContainer], activeIndex, overIndex),
      };
      setItems(nextItems);
    }

    const changedContainers = Object.keys(nextItems).filter((key) => !sameOrder(cloned?.[key], nextItems[key]));

    for (const containerId of changedContainers) {
      dispatch(
        reorderToolsLocal({
          folderId: containerToFolderId(containerId),
          toolIds: nextItems[containerId] ?? [],
        }),
      );
    }

    clonedItemsRef.current = null;
    isDraggingRef.current = false;
    setActiveToolId(null);

    if (changedContainers.length === 0) return;

    try {
      await Promise.all(
        changedContainers.map((containerId) =>
          dispatch(
            reorderTools({
              folderId: containerToFolderId(containerId),
              toolIds: nextItems[containerId] ?? [],
            }),
          ).unwrap(),
        ),
      );
    } catch {
      if (cloned) setItems(cloned);
      dispatch(fetchTools());
      message.error("Failed to move tool");
    }
  };

  const handleDragCancel = () => {
    if (clonedItemsRef.current) setItems(clonedItemsRef.current);
    clonedItemsRef.current = null;
    isDraggingRef.current = false;
    setActiveToolId(null);
    recentlyMovedToNewContainer.current = false;
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [items]);

  const handleToolClick = (toolId: string) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onToolClick(toolId);
  };

  const activeTool = activeToolId ? (toolsById.get(activeToolId) ?? null) : null;

  const toolsFor = (containerId: string) => (items[containerId] ?? []).map((id) => toolsById.get(id)).filter((t): t is AgentTool => !!t);

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="flex flex-col gap-8">
        {folderMetas.map((meta) => (
          <FolderNode key={meta.key} meta={meta} tools={toolsFor(meta.key)} onToolClick={handleToolClick} onToolCreated={onToolCreated} onEditFolder={onEditFolder} onDeleteFolder={onDeleteFolder} />
        ))}

        <Button type="text" icon={<AddIcon size={14} />} onClick={onCreateFolder} className="h-8! px-1.5! self-start text-muted-foreground">
          Add folder
        </Button>
      </div>

      <DragOverlay dropAnimation={null}>{activeTool ? <ToolRowView tool={activeTool} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
