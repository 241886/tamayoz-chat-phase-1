"use client";

import clsx from "clsx";
import { BellOff, Pencil, Search, Users } from "lucide-react";
import { NexusLogo } from "@/components/brand/NexusLogo";
import { Avatar } from "@/components/chat/Avatar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { formatTime } from "@/lib/api";
import type { Conversation, Group, User } from "@/types/chat";

type ConversationListProps = {
  currentUser: User;
  conversations: Conversation[];
  groups: Group[];
  activeConversationId?: string | null;
  activeGroupId?: string | null;
  onSelect: (conversation: Conversation) => void;
  onSelectGroup: (group: Group) => void;
  onSearchFocus: () => void;
  onCreateGroup: () => void;
  onChangeName: () => void;
};

function otherParticipant(conversation: Conversation, currentUserId: string) {
  return conversation.participants.find((participant) => participant.userId !== currentUserId)?.user;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display px-4 pb-2 pt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
      {children}
    </p>
  );
}

export function ConversationList({
  currentUser,
  conversations,
  groups,
  activeConversationId,
  activeGroupId,
  onSelect,
  onSelectGroup,
  onSearchFocus,
  onCreateGroup,
  onChangeName
}: ConversationListProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-white/[0.06] bg-[#12101a] text-white">
      <div className="border-b border-white/[0.06] px-4 py-4">
        <NexusLogo />
      </div>

      <div className="border-b border-white/[0.06] p-3">
        <button
          type="button"
          onClick={onSearchFocus}
          className="glass-input flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-white/45 hover:bg-white/[0.08]"
        >
          <Search size={18} />
          <span>Search users</span>
        </button>
        <button
          type="button"
          onClick={onCreateGroup}
          className="mt-2 flex h-11 w-full items-center gap-2 rounded-xl border border-brand-purple/20 bg-brand-purple/10 px-3 text-left text-sm font-semibold text-brand-purple transition hover:border-brand-pink/35 hover:bg-brand-pink/10"
        >
          <Users size={18} />
          <span>Create Group</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {conversations.length === 0 && groups.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-white/40">Start a conversation from search.</div>
        ) : (
          <>
            <SectionTitle>Groups</SectionTitle>
            <div className="space-y-1 px-2">
              {groups.length === 0 ? (
                <p className="px-2 py-3 text-xs text-white/30">No groups yet</p>
              ) : (
                groups.map((group) => {
                  const isActive = activeGroupId === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => onSelectGroup(group)}
                      className={clsx(
                        "relative flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition",
                        isActive ? "bg-[rgba(180,60,255,0.12)]" : "hover:bg-white/[0.045]"
                      )}
                    >
                      {isActive ? <span className="accent-gradient absolute left-0 top-3 h-[calc(100%-24px)] w-[3px] rounded-full" /> : null}
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-brand-purple font-semibold text-white shadow-[0_0_20px_rgba(200,122,255,0.22)]">
                        <Users size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-white">{group.name}</p>
                          <span className="shrink-0 text-[11px] text-white/30">{formatTime(group.lastMessage?.createdAt)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs text-white/38">
                            {group.lastMessage?.body || (group.lastMessage?.attachments?.length ? "Attachment" : `${group.members.length} members`)}
                          </p>
                          {group.unreadCount > 0 ? (
                            <span className="accent-gradient grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white">
                              {group.unreadCount}
                            </span>
                          ) : null}
                          {group.members.find((member) => member.userId === currentUser.id)?.mutedAt ? (
                            <BellOff size={14} className="shrink-0 text-white/35" />
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <SectionTitle>Direct Messages</SectionTitle>
            <div className="space-y-1 px-2">
              {conversations.length === 0 ? (
                <p className="px-2 py-3 text-xs text-white/30">No direct messages yet</p>
              ) : (
                conversations.map((conversation) => {
                  const other = otherParticipant(conversation, currentUser.id);
                  const isActive = activeConversationId === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => onSelect(conversation)}
                      className={clsx(
                        "relative flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition",
                        isActive ? "bg-[rgba(180,60,255,0.12)]" : "hover:bg-white/[0.045]"
                      )}
                    >
                      {isActive ? <span className="accent-gradient absolute left-0 top-3 h-[calc(100%-24px)] w-[3px] rounded-full" /> : null}
                      <Avatar user={other} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-white">{other?.name ?? "Unknown user"}</p>
                          <span className="shrink-0 text-[11px] text-white/30">
                            {formatTime(conversation.lastMessage?.createdAt)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs text-white/38">
                            {conversation.lastMessage?.body ?? other?.email ?? "No messages yet"}
                          </p>
                          {conversation.unreadCount > 0 ? (
                            <span className="accent-gradient grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white">
                              {conversation.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      <footer className="border-t border-white/[0.06] p-3">
        <InstallAppButton />
        <div className="glass-panel flex items-center gap-3 rounded-2xl p-3">
          <Avatar user={currentUser} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{currentUser.name}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="online-glow h-2 w-2 rounded-full" />
              <p className="truncate text-xs text-brand-cyan">Online</p>
            </div>
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={onChangeName}
            title="Change name"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.05] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <Pencil size={16} />
          </button>
        </div>
      </footer>
    </aside>
  );
}
