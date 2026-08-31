import { AddIcon } from "@solar-icons/react/dynamic/add";
import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentListItem } from "src/common/types";
import { MissingProviderCallout } from "src/components/MissingProviderCallout";
import { PageShell } from "src/components/PageShell";
import { RawButton } from "src/components/RawButton";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { fetchTeams } from "src/modules/agents/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/agents/common/teamsSlice";
import { AgentsBoard } from "src/modules/agents/components/AgentsBoard";
import { NewAgentDialog } from "src/modules/agents/components/NewAgentDialog";
import { NewTeamDialog } from "src/modules/agents/components/NewTeamDialog";
import { TeamDialog } from "src/modules/agents/components/TeamDialog";
import { useAppDispatch, useAppSelector } from "src/store/store";

export default function AgentsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const agents = useAppSelector((s) => s.agents.items) as AgentListItem[];
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];

  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | null>(null);

  useEffect(() => {
    dispatch(fetchAgents());
    dispatch(fetchTeams());
  }, [dispatch]);

  const handleNavigate = (id: string) => {
    navigate(`/agents/${id}`);
  };

  const handleOpenEditTeam = (team: TeamWithMembers) => {
    setEditingTeam(team);
  };

  const handleCloseTeamDialog = () => {
    setEditingTeam(null);
  };

  return (
    <>
      <PageShell>
        <MissingProviderCallout />
        <div className="mb-8 flex items-center justify-between">
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Agents</h1>
          <div className="flex items-center gap-2">
            <NewTeamDialog>
              <RawButton type="default" icon={<UsersGroupTwoRoundedIcon size={16} />}>
                New Team
              </RawButton>
            </NewTeamDialog>
            <NewAgentDialog>
              <RawButton type="primary" icon={<AddIcon size={16} />}>
                New Agent
              </RawButton>
            </NewAgentDialog>
          </div>
        </div>

        <AgentsBoard teams={teams} agents={agents} onNavigate={handleNavigate} onEditTeam={handleOpenEditTeam} />
      </PageShell>

      <TeamDialog open={!!editingTeam} onClose={handleCloseTeamDialog} team={editingTeam} />
    </>
  );
}
