import type { MenuProps } from "@nonla-agents/ui";
import { Modal, message } from "@nonla-agents/ui";
import type { Agent, AgentListItem } from "src/common/types";
import { cloneAgent, deleteAgent, updateAgent } from "src/modules/agents/common/agentsSlice";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { fluentIconRef } from "src/modules/tools/common/iconify";
import { ToolIcon } from "src/modules/tools/components/ToolIcon";
import type { AppDispatch } from "src/store/store";

function MenuIcon({ name }: { name: string }) {
  return <ToolIcon icon={fluentIconRef(name)} size={16} />;
}

export function agentMenuItems({
  agent,
  teams,
  dispatch,
  onOpen,
}: {
  agent: AgentListItem;
  teams: TeamWithMembers[];
  dispatch: AppDispatch;
  onOpen?: () => void;
}): MenuProps["items"] {
  const teamChildren: NonNullable<MenuProps["items"]> = [...teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((team) => ({
      key: team.id,
      label: team.name,
      disabled: agent.teamId === team.id,
      onClick: () => {
        void (async () => {
          try {
            await dispatch(updateAgent({ id: agent.id, teamId: team.id })).unwrap();
            message.success(`Moved "${agent.name}" to ${team.name}`);
          } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Failed to move agent");
          }
        })();
      },
    }));

  const items: NonNullable<MenuProps["items"]> = [];

  if (onOpen) {
    items.push({
      key: "open",
      label: "Edit",
      icon: <MenuIcon name="edit-24" />,
      onClick: onOpen,
    });
  }

  if (agent.isPublic) {
    items.push({
      key: "open-public",
      label: "Open public chat",
      icon: <MenuIcon name="globe-24" />,
      onClick: () => {
        window.open(`/chat/${agent.id}`, "_blank", "noopener,noreferrer");
      },
    });
  }

  items.push({
    key: "clone",
    label: "Clone",
    icon: <MenuIcon name="clipboard-24" />,
    onClick: () => {
      void (async () => {
        try {
          const cloned = (await dispatch(cloneAgent(agent.id)).unwrap()) as Agent;
          message.success(`Cloned as "${cloned.name}"`);
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : "Failed to clone agent");
        }
      })();
    },
  });

  if (teams.length > 0) {
    items.push({
      key: "move",
      label: "Move to team",
      icon: <MenuIcon name="people-team-24" />,
      children: teamChildren,
    });
  }

  if (agent.teamId) {
    items.push({
      key: "ungroup",
      label: "Remove from team",
      icon: <MenuIcon name="share-ios-24" />,
      onClick: () => {
        void (async () => {
          try {
            await dispatch(updateAgent({ id: agent.id, teamId: null })).unwrap();
            message.success(`Removed "${agent.name}" from team`);
          } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Failed to move agent");
          }
        })();
      },
    });
  }

  items.push(
    { type: "divider" },
    {
      key: "delete",
      danger: true,
      label: "Delete",
      icon: <MenuIcon name="dismiss-circle-24" />,
      onClick: () => {
        Modal.confirm({
          title: `Delete "${agent.name}"?`,
          content: "This action cannot be undone. All conversations and tasks will be lost.",
          okText: "Delete",
          okType: "danger",
          cancelText: "Cancel",
          onOk: async () => {
            try {
              await dispatch(deleteAgent(agent.id)).unwrap();
              message.success(`Deleted "${agent.name}"`);
            } catch (err: unknown) {
              message.error(err instanceof Error ? err.message : "Failed to delete agent");
            }
          },
        });
      },
    },
  );

  return items;
}
