import { type CollisionDetection, DndContext, type DragEndEvent, type DragOverEvent, DragOverlay, type DragStartEvent, PointerSensor, type UniqueIdentifier, closestCorners, getFirstCollision, pointerWithin, rectIntersection, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { message } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentListItem } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { fetchAgents, reorderAgents, reorderAgentsLocal } from "src/modules/agents/common/agentsSlice";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { useAppDispatch } from "src/store/store";
import { AgentCard } from "./AgentCard";
import { AgentsEmptyState } from "./AgentsEmptyState";
import { TeamAgentsSection } from "./TeamAgentsSection";
import { UngroupedAgentsSection } from "./UngroupedAgentsSection";

const UNGROUPED_ID = "ungrouped";

interface AgentsBoardProps {
  teams: TeamWithMembers[];
  agents: AgentListItem[];
  onNavigate: (id: string) => void;
  onEditTeam: (team: TeamWithMembers) => void;
}

type Items = Record<string, string[]>;

function sortTeams(teams: TeamWithMembers[]) {
  return [...teams].sort((a, b) => a.name.localeCompare(b.name));
}

function createdAtTs(agent: AgentListItem): number {
  return agent.createdAt ? new Date(agent.createdAt).getTime() : 0;
}

function buildItems(agents: AgentListItem[], teams: TeamWithMembers[]): Items {
  const teamIds = new Set(teams.map((t) => t.id));
  const byId = new Map(agents.map((a) => [a.id, a]));
  const bySortOrder = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const byOrder = (byId.get(a)?.sortOrder ?? 0) - (byId.get(b)?.sortOrder ?? 0);
      if (byOrder !== 0) return byOrder;
      return createdAtTs(byId.get(b)!) - createdAtTs(byId.get(a)!);
    });

  const items: Items = { [UNGROUPED_ID]: [] };
  for (const team of teams) {
    items[team.id] = [];
  }

  for (const agent of agents) {
    if (agent.teamId && teamIds.has(agent.teamId)) {
      items[agent.teamId].push(agent.id);
    } else {
      items[UNGROUPED_ID].push(agent.id);
    }
  }

  for (const key of Object.keys(items)) {
    items[key] = bySortOrder(items[key]);
  }
  return items;
}

function sameOrder(a: string[] = [], b: string[] = []) {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function containerToTeamId(containerId: string): string | null {
  return containerId === UNGROUPED_ID ? null : containerId;
}

function findContainerIn(items: Items, id: UniqueIdentifier): string | undefined {
  const sid = String(id);
  if (sid in items) return sid;
  return Object.keys(items).find((key) => items[key].includes(sid));
}

export function AgentsBoard({ teams, agents, onNavigate, onEditTeam }: AgentsBoardProps) {
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<Items>(() => buildItems(agents, teams));
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const didDragRef = useRef(false);
  const isDraggingRef = useRef(false);
  const clonedItemsRef = useRef<Items | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  const agentsById = useMemo(() => {
    const map = new Map<string, AgentListItem>();
    for (const agent of agents) map.set(agent.id, agent);
    return map;
  }, [agents]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setItems(buildItems(agents, teams));
  }, [agents, teams]);

  const sortedTeams = useMemo(() => sortTeams(teams), [teams]);

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
    setActiveAgentId(String(active.id));
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
      setActiveAgentId(null);
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
        reorderAgentsLocal({
          teamId: containerToTeamId(containerId),
          agentIds: nextItems[containerId] ?? [],
        }),
      );
    }

    clonedItemsRef.current = null;
    isDraggingRef.current = false;
    setActiveAgentId(null);

    if (changedContainers.length === 0) return;

    try {
      await Promise.all(
        changedContainers.map((containerId) =>
          dispatch(
            reorderAgents({
              teamId: containerToTeamId(containerId),
              agentIds: nextItems[containerId] ?? [],
            }),
          ).unwrap(),
        ),
      );
    } catch {
      if (cloned) setItems(cloned);
      dispatch(fetchAgents());
      message.error("Failed to move agent");
    }
  };

  const handleDragCancel = () => {
    if (clonedItemsRef.current) setItems(clonedItemsRef.current);
    clonedItemsRef.current = null;
    isDraggingRef.current = false;
    setActiveAgentId(null);
    recentlyMovedToNewContainer.current = false;
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [items]);

  const handleNavigate = (id: string) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onNavigate(id);
  };

  const activeAgent = activeAgentId ? (agentsById.get(activeAgentId) ?? null) : null;
  const agentsFor = (containerId: string) => (items[containerId] ?? []).map((id) => agentsById.get(id)).filter((a): a is AgentListItem => !!a);

  const ungroupedAgents = agentsFor(UNGROUPED_ID);
  const showUngrouped = ungroupedAgents.length > 0 || !!activeAgentId;

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragCancel={handleDragCancel} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-10">
        {sortedTeams.map((team) => (
          <TeamAgentsSection key={team.id} team={team} agents={agentsFor(team.id)} onNavigate={handleNavigate} onEditTeam={onEditTeam} />
        ))}

        <RenderIf condition={showUngrouped}>
          <UngroupedAgentsSection agents={ungroupedAgents} onNavigate={handleNavigate} />
        </RenderIf>

        <RenderIf condition={teams.length === 0 && ungroupedAgents.length === 0 && !activeAgentId}>
          <AgentsEmptyState />
        </RenderIf>
      </div>

      <DragOverlay dropAnimation={null}>{activeAgent ? <AgentCard agent={activeAgent} onOpen={() => {}} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
