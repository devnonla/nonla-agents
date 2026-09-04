import { Button, Table } from "@nonla-agents/ui";
import type { ColumnsType } from "@nonla-agents/ui";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { UserPlusIcon } from "@solar-icons/react/dynamic/user-plus";
import { UsersGroupTwoRoundedIcon } from "@solar-icons/react/dynamic/users-group-two-rounded";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { UserAvatar } from "src/components/UserAvatar";
import { RoleBadge } from "./RoleBadge";
import { UserFormDialog } from "./UserFormDialog";

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<{ items: User[]; total: number }>("/api/users", { page: 1, limit: 100, sorts: "-createdAt" });
      setUsers(result.items);
    } catch {
      // ignore — likely not admin
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const adminCount = users.filter((u) => u.role === "admin").length;

  const columns: ColumnsType<User> = [
    {
      title: "User",
      key: "user",
      render: (_, user) => (
        <div className="flex items-center gap-3">
          <UserAvatar avatar={user.avatar} name={user.name || user.username} size={36} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{user.name || user.username}</div>
            <div className="truncate text-xs text-tertiary-foreground">@{user.username}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      width: 120,
      render: (role: string) => <RoleBadge role={role} />,
    },
    {
      title: "",
      key: "actions",
      width: 56,
      align: "right",
      render: (_, user) => <Button type="text" size="small" icon={<PenNewSquareIcon />} onClick={() => setEditUser(user)} aria-label={`Edit ${user.username}`} className="inline-flex items-center justify-center size-7! px-0!" />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {users.length} user{users.length !== 1 ? "s" : ""}
          </span>
          <RenderIf condition={!loading && users.length > 0}>
            <>
              <span className="text-border">·</span>
              <span className="tabular-nums">{adminCount} admin</span>
            </>
          </RenderIf>
        </div>
        <Button id="settings-add-user" type="primary" icon={<UserPlusIcon size={14} />} onClick={() => setShowCreate(true)}>
          Add User
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={false}
        locale={{
          emptyText: (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-6">
                <UsersGroupTwoRoundedIcon />
              </div>
              <div>
                <div className="text-base font-medium text-foreground">No users yet</div>
                <div className="mt-1 text-sm text-muted-foreground">Invite teammates and assign roles to share this workspace.</div>
              </div>
              <Button type="primary" size="small" icon={<UserPlusIcon size={12} />} onClick={() => setShowCreate(true)}>
                Add User
              </Button>
            </div>
          ),
        }}
      />

      <RenderIf condition={showCreate}>
        <UserFormDialog onClose={() => setShowCreate(false)} onSaved={fetchUsers} />
      </RenderIf>

      <RenderIf condition={!!editUser}>{() => <UserFormDialog user={editUser} onClose={() => setEditUser(null)} onSaved={fetchUsers} />}</RenderIf>
    </div>
  );
}
