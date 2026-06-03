"use client";

import { Search, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Avatar } from "@/components/chat/Avatar";
import { api } from "@/lib/api";
import type { User } from "@/types/chat";

type UserSearchProps = {
  token: string;
  open: boolean;
  onClose: () => void;
  onStartConversation: (user: User) => void;
};

export function UserSearch({ token, open, onClose, onStartConversation }: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return null;
  }

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    try {
      const response = await api<{ users: User[] }>(`/api/users?q=${encodeURIComponent(query)}`, { token });
      setUsers(response.users);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute inset-0 z-20 bg-[#12101a] text-white">
      <header className="flex h-[65px] items-center gap-3 border-b border-white/[0.06] px-4">
        <button
          type="button"
          onClick={onClose}
          title="Close search"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.05] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
        >
          <X size={20} />
        </button>
        <form onSubmit={search} className="glass-input flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3">
          <Search size={18} className="text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or email"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/35"
          />
        </form>
      </header>

      <div className="h-[calc(100%-65px)] overflow-y-auto">
        {loading ? (
          <div className="px-6 py-8 text-sm text-white/40">Searching...</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-8 text-sm text-white/40">Search for a user to begin.</div>
        ) : (
          users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => onStartConversation(user)}
              className="flex w-full items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.045]"
            >
              <Avatar user={user} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate text-xs text-white/38">{user.email}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
