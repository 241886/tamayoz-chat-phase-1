"use client";

import clsx from "clsx";
import { BellOff, Pencil, Search, Users } from "lucide-react";
import { Avatar } from "@/components/chat/Avatar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={currentUser} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentUser.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{currentUser.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onChangeName}
            title="Change name"
            className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Pencil size={18} />
          </button>
        </div>
      </header>

      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <button
          type="button"
          onClick={onSearchFocus}
          className="flex h-11 w-full items-center gap-2 rounded-md bg-slate-100 px-3 text-left text-sm text-slate-500 transition hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Search size={18} />
          <span>Search users</span>
        </button>
        <button
          type="button"
          onClick={onCreateGroup}
          className="mt-2 flex h-11 w-full items-center gap-2 rounded-md bg-brand-50 px-3 text-left text-sm text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-100 dark:hover:bg-brand-500/25"
        >
          <Users size={18} />
          <span>Create Group</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 && groups.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Start a conversation from search.
          </div>
        ) : (
          <>
          {groups.map((group) => {
            const isActive = activeGroupId === group.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelectGroup(group)}
                className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition dark:border-slate-900 ${
                  isActive
                    ? "bg-brand-50 dark:bg-brand-500/10"
                    : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900"
                }`}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-brand-600 font-semibold text-white">
                  <Users size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{group.name}</p>
                    <span className="shrink-0 text-xs text-slate-400">{formatTime(group.lastMessage?.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
                      {group.lastMessage?.body || (group.lastMessage?.attachments?.length ? "Attachment" : `${group.members.length} members`)}
                    </p>
                    {group.unreadCount > 0 ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                        {group.unreadCount}
                      </span>
                    ) : null}
                    {group.members.find((member) => member.userId === currentUser.id)?.mutedAt ? (
                      <BellOff size={14} className="shrink-0 text-slate-400" />
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
          {conversations.map((conversation) => {
            const other = otherParticipant(conversation, currentUser.id);
            const isActive = activeConversationId === conversation.id;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                className={clsx(
                  "flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition dark:border-slate-900",
                  isActive
                    ? "bg-brand-50 dark:bg-brand-500/10"
                    : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900"
                )}
              >
                <Avatar user={other} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{other?.name ?? "Unknown user"}</p>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatTime(conversation.lastMessage?.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
                      {conversation.lastMessage?.body ?? other?.email ?? "No messages yet"}
                    </p>
                    {conversation.unreadCount > 0 ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
          </>
        )}
      </div>
    </aside>
  );
}
