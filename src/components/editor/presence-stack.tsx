"use client";

import { useMemo } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { getCollaborators, PRESENCE_COLORS } from "@/client/collab-provider";

interface PresenceStackProps {
  provider: HocuspocusProvider | null;
  /** Force re-render when awareness changes. */
  revision: number;
}

interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
  isAgent: boolean;
}

function parseUsers(provider: HocuspocusProvider | null): PresenceUser[] {
  if (!provider) return [];

  const states = getCollaborators(provider);
  const users: PresenceUser[] = [];

  states.forEach((state, clientId) => {
    const user = state.user as { name?: string; color?: string } | undefined;
    if (!user?.name) return;
    const isAgent = user.name.toLowerCase().includes("openclaw");
    users.push({
      clientId,
      name: user.name,
      color: user.color ?? (isAgent ? PRESENCE_COLORS.agent : PRESENCE_COLORS.human),
      isAgent,
    });
  });

  return users;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}

export function PresenceStack({ provider, revision }: PresenceStackProps) {
  const users = useMemo(() => parseUsers(provider), [provider, revision]);

  if (users.length === 0) return null;

  const visible = users.slice(0, 3);
  const overflow = users.length - visible.length;

  return (
    <div
      className="flex items-center -space-x-2"
      aria-label={`${users.length} collaborator${users.length === 1 ? "" : "s"} online`}
      title={users.map((u) => u.name).join(", ")}
    >
      {visible.map((user) => (
        <span
          key={user.clientId}
          className="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-text ring-2"
          style={{ boxShadow: `0 0 0 2px ${user.color}` }}
        >
          {user.isAgent ? "✦" : initials(user.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-2 px-1 text-[10px] font-medium text-text-muted ring-2 ring-border">
          +{overflow}
        </span>
      )}
    </div>
  );
}

interface SoftLockHintProps {
  provider: HocuspocusProvider | null;
  revision: number;
  activeSectionId: string | null;
}

export function SoftLockHint({ provider, revision, activeSectionId }: SoftLockHintProps) {
  const agentSection = useMemo(() => {
    if (!provider) return null;
    const states = getCollaborators(provider);
    for (const state of states.values()) {
      const user = state.user as { name?: string } | undefined;
      const sectionId = state.sectionId as string | undefined;
      if (user?.name?.toLowerCase().includes("openclaw") && sectionId) {
        return sectionId;
      }
    }
    return null;
  }, [provider, revision]);

  if (!agentSection || agentSection !== activeSectionId) return null;

  return (
    <div
      className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
      role="status"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-agent" />
      openclaw is editing this section — you can still edit (advisory only)
    </div>
  );
}
