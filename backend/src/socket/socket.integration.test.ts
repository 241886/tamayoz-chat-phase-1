import http from "http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../utils/auth.js";

type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: null;
  status: "ONLINE" | "OFFLINE";
  lastSeenAt: Date | null;
};

const users = new Map<string, User>([
  ["user-a", { id: "user-a", name: "Alya Mentor", email: "alya@example.com", avatarUrl: null, status: "OFFLINE", lastSeenAt: null }],
  ["user-b", { id: "user-b", name: "Basil Student", email: "basil@example.com", avatarUrl: null, status: "OFFLINE", lastSeenAt: null }]
]);

const participants = [
  { id: "cp-a", conversationId: "conv-1", userId: "user-a", joinedAt: new Date("2026-01-01T00:00:00.000Z") },
  { id: "cp-b", conversationId: "conv-1", userId: "user-b", joinedAt: new Date("2026-01-01T00:00:00.000Z") }
];

const groupMembers = [
  { id: "gm-a", groupId: "group-1", userId: "user-a", role: "ADMIN", joinedAt: new Date("2026-01-01T00:00:00.000Z") },
  { id: "gm-b", groupId: "group-1", userId: "user-b", role: "MEMBER", joinedAt: new Date("2026-01-01T00:00:00.000Z") }
];

const conversation = {
  id: "conv-1",
  directKey: "user-a:user-b",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

let messages: Array<{
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}> = [];

function conversationPayload() {
  return {
    ...conversation,
    participants: participants.map((participant) => ({
      ...participant,
      user: users.get(participant.userId)!
    })),
    messages: messages
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 1)
      .map((message) => ({
        ...message,
        sender: users.get(message.senderId)!
      }))
  };
}

const mockPrisma = {
  user: {
    upsert: vi.fn(async ({ where, update, create }: { where: { id: string }; update: { name: string }; create: User & { passwordHash: string } }) => {
      const existing = users.get(where.id);
      if (existing) {
        const updated = { ...existing, name: update.name };
        users.set(where.id, updated);
        return updated;
      }

      const created = {
        id: create.id,
        name: create.name,
        email: create.email,
        avatarUrl: null,
        status: "OFFLINE" as const,
        lastSeenAt: null
      };
      users.set(created.id, created);
      return created;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
      const user = users.get(where.id)!;
      const updated = { ...user, ...data };
      users.set(where.id, updated);
      return updated;
    })
  },
  conversationParticipant: {
    findUnique: vi.fn(async ({ where }: { where: { conversationId_userId: { conversationId: string; userId: string } } }) =>
      participants.find(
        (participant) =>
          participant.conversationId === where.conversationId_userId.conversationId &&
          participant.userId === where.conversationId_userId.userId
      ) ?? null
    ),
    findMany: vi.fn(async ({ where }: { where: { conversationId: string } }) =>
      participants.filter((participant) => participant.conversationId === where.conversationId)
    )
  },
  conversation: {
    update: vi.fn(async ({ data }: { data: { updatedAt: Date } }) => {
      conversation.updatedAt = data.updatedAt;
      return conversation;
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string; participants: { some: { userId: string } } } }) => {
      const isParticipant = participants.some(
        (participant) => participant.conversationId === where.id && participant.userId === where.participants.some.userId
      );
      return isParticipant ? conversationPayload() : null;
    })
  },
  groupMember: {
    findMany: vi.fn(async ({ where }: { where: { userId?: string; groupId?: string } }) =>
      groupMembers.filter(
        (member) => (where.userId ? member.userId === where.userId : true) && (where.groupId ? member.groupId === where.groupId : true)
      )
    ),
    findUnique: vi.fn(async ({ where }: { where: { groupId_userId: { groupId: string; userId: string } } }) =>
      groupMembers.find(
        (member) => member.groupId === where.groupId_userId.groupId && member.userId === where.groupId_userId.userId
      ) ?? null
    )
  },
  userBlock: {
    findFirst: vi.fn(async () => null)
  },
  message: {
    create: vi.fn(async ({ data }: { data: { conversationId: string; senderId: string; body: string } }) => {
      const message = {
        id: `msg-${messages.length + 1}`,
        conversationId: data.conversationId,
        senderId: data.senderId,
        body: data.body,
        readAt: null,
        createdAt: new Date()
      };
      messages.push(message);
      return {
        ...message,
        sender: users.get(data.senderId)!
      };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { conversationId: string; senderId: { not: string }; readAt: null }; data: { readAt: Date } }) => {
      let count = 0;
      messages = messages.map((message) => {
        if (message.conversationId === where.conversationId && message.senderId !== where.senderId.not && message.readAt === null) {
          count += 1;
          return { ...message, readAt: data.readAt };
        }
        return message;
      });
      return { count };
    })
  }
};

vi.mock("../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { registerSocketServer } = await import("./index.js");

function waitForEvent<T>(socket: ClientSocket, event: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 3000);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

function connectClient(port: number, userId: string) {
  const socket = createClient(`http://localhost:${port}`, {
    auth: { token: signToken({ userId }) },
    transports: ["websocket"],
    forceNew: true
  });

  return new Promise<ClientSocket>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting ${userId}`)), 3000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", reject);
  });
}

function connectGuestClient(port: number, guestId: string, guestName: string) {
  const socket = createClient(`http://localhost:${port}`, {
    auth: { guestId, guestName },
    transports: ["websocket"],
    forceNew: true
  });

  return new Promise<ClientSocket>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting ${guestId}`)), 3000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", reject);
  });
}

function joinConversation(socket: ClientSocket, conversationId: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    socket.emit("conversation:join", { conversationId }, resolve);
  });
}

describe("Socket.IO chat", () => {
  let httpServer: http.Server;
  let port: number;
  let sockets: ClientSocket[] = [];

  beforeEach(async () => {
    messages = [];
    users.get("user-a")!.status = "OFFLINE";
    users.get("user-b")!.status = "OFFLINE";
    httpServer = http.createServer();
    registerSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as { port: number }).port;
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect());
    sockets = [];
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("delivers messages, typing indicators, read receipts, persistence, and presence between two users", async () => {
    const alya = await connectClient(port, "user-a");
    sockets.push(alya);

    const basilPresencePromise = waitForEvent<{ userId: string; status: string }>(alya, "presence:update");
    const basil = await connectClient(port, "user-b");
    sockets.push(basil);
    await expect(basilPresencePromise).resolves.toMatchObject({ userId: "user-b", status: "ONLINE" });

    await expect(joinConversation(alya, "conv-1")).resolves.toMatchObject({ ok: true });
    await expect(joinConversation(basil, "conv-1")).resolves.toMatchObject({ ok: true });

    const typingPromise = waitForEvent<{ conversationId: string; userId: string; isTyping: boolean }>(basil, "typing:update");
    alya.emit("typing:start", { conversationId: "conv-1" });
    await expect(typingPromise).resolves.toMatchObject({ conversationId: "conv-1", userId: "user-a", isTyping: true });

    const basilConversationPromise = waitForEvent<{ conversation: { id: string; unreadCount: number; lastMessage: { body: string } } }>(
      basil,
      "conversation:upsert"
    );
    const basilMessagePromise = waitForEvent<{ message: { id: string; body: string; senderId: string } }>(basil, "message:new");
    const ack = await new Promise<{ ok: boolean; message: { id: string; body: string } }>((resolve) => {
      alya.emit("message:send", { conversationId: "conv-1", body: "  Hello Basil  " }, resolve);
    });

    expect(ack).toMatchObject({ ok: true, message: { body: "Hello Basil" } });
    await expect(basilMessagePromise).resolves.toMatchObject({
      message: { id: "msg-1", body: "Hello Basil", senderId: "user-a" }
    });
    await expect(basilConversationPromise).resolves.toMatchObject({
      conversation: { id: "conv-1", unreadCount: 1, lastMessage: { body: "Hello Basil" } }
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ conversationId: "conv-1", senderId: "user-a", body: "Hello Basil", readAt: null });

    const readPromise = waitForEvent<{ conversationId: string; readerId: string; readAt: string }>(alya, "message:read");
    basil.emit("message:read", { conversationId: "conv-1" });
    await expect(readPromise).resolves.toMatchObject({ conversationId: "conv-1", readerId: "user-b" });
    expect(messages[0].readAt).toBeInstanceOf(Date);

    const offlinePromise = waitForEvent<{ userId: string; status: string }>(alya, "presence:update");
    basil.disconnect();
    await expect(offlinePromise).resolves.toMatchObject({ userId: "user-b", status: "OFFLINE" });
  });

  it("delivers group typing indicators and read receipts through group rooms", async () => {
    const alya = await connectClient(port, "user-a");
    const basil = await connectClient(port, "user-b");
    sockets.push(alya, basil);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const typingPromise = waitForEvent<{ groupId: string; userId: string; isTyping: boolean }>(basil, "group:typing");
    alya.emit("group:typing", { groupId: "group-1", isTyping: true });
    await expect(typingPromise).resolves.toMatchObject({ groupId: "group-1", userId: "user-a", isTyping: true });

    const readPromise = waitForEvent<{ groupId: string; readerId: string; readAt: string }>(alya, "group:read");
    basil.emit("group:read", { groupId: "group-1" });
    await expect(readPromise).resolves.toMatchObject({ groupId: "group-1", readerId: "user-b" });
  });

  it("connects guest users through Socket.IO without a JWT", async () => {
    const guest = await connectGuestClient(port, "guest_socket_1", "Guest Socket");
    sockets.push(guest);

    expect(guest.connected).toBe(true);
    expect(users.get("guest_socket_1")).toMatchObject({ name: "Guest Socket", status: "ONLINE" });
  });
});
