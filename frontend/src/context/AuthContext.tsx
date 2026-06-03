"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/types/chat";

type AuthResponse = {
  token: string;
  user: User;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changeName: (name: string) => Promise<void>;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "nexus_token";
const GUEST_ID_KEY = "nexus_guest_id";
const GUEST_NAME_KEY = "nexus_guest_name";

function randomGuestName() {
  return `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
}

function createGuestId() {
  return `guest_${crypto.randomUUID()}`;
}

function getLocalGuest() {
  let id = window.localStorage.getItem(GUEST_ID_KEY);
  let name = window.localStorage.getItem(GUEST_NAME_KEY);

  if (!id) {
    id = createGuestId();
    window.localStorage.setItem(GUEST_ID_KEY, id);
  }

  if (!name) {
    name = randomGuestName();
    window.localStorage.setItem(GUEST_NAME_KEY, name);
  }

  return { id, name };
}

function localGuestUser(id: string, name: string): User {
  return {
    id,
    name,
    email: `${id.toLowerCase()}@guest.local`,
    avatarUrl: null,
    status: "ONLINE",
    lastSeenAt: null
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const guest = getLocalGuest();
    const guestToken = `guest:${guest.id}`;
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(guestToken);
    setUser(localGuestUser(guest.id, guest.name));

    api<{ user: User }>("/api/users/profile", { token: guestToken })
      .then(({ user }) => setUser(user))
      .catch(() => undefined)
      .finally(() => setIsReady(true));
  }, []);

  const persistSession = useCallback((next: AuthResponse) => {
    window.localStorage.setItem(TOKEN_KEY, next.token);
    setToken(next.token);
    setUser(next.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await api<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      persistSession(response);
    },
    [persistSession]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const response = await api<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });
      persistSession(response);
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    const guest = { id: createGuestId(), name: randomGuestName() };
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.setItem(GUEST_ID_KEY, guest.id);
    window.localStorage.setItem(GUEST_NAME_KEY, guest.name);
    setToken(`guest:${guest.id}`);
    setUser(localGuestUser(guest.id, guest.name));
  }, []);

  const changeName = useCallback(
    async (name: string) => {
      if (!token) return;

      window.localStorage.setItem(GUEST_NAME_KEY, name);
      const response = await api<{ user: User }>("/api/users/profile", {
        method: "PATCH",
        token,
        body: JSON.stringify({ name })
      });
      setUser(response.user);
    },
    [token]
  );

  const value = useMemo(
    () => ({ user, token, isReady, login, register, logout, changeName, setUser }),
    [user, token, isReady, login, register, logout, changeName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
