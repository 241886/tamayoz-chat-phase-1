import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../../utils/auth.js";

const users = [
  {
    id: "user-a",
    name: "Alya Mentor",
    email: "alya@example.com",
    avatarUrl: null,
    status: "OFFLINE",
    lastSeenAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  },
  {
    id: "user-b",
    name: "Basil Student",
    email: "basil@example.com",
    avatarUrl: null,
    status: "OFFLINE",
    lastSeenAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  },
  {
    id: "user-c",
    name: "Cara Parent",
    email: "cara@example.com",
    avatarUrl: null,
    status: "ONLINE",
    lastSeenAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  }
];

const participants = [
  { id: "cp-a", conversationId: "conv-1", userId: "user-a", joinedAt: new Date("2026-01-01T00:00:00.000Z") },
  { id: "cp-b", conversationId: "conv-1", userId: "user-b", joinedAt: new Date("2026-01-01T00:00:00.000Z") }
];

let conversations = [
  {
    id: "conv-1",
    directKey: "user-a:user-b",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z")
  }
];

let messages = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-b",
    body: "Hello from Basil",
    readAt: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z")
  }
];

function serializeConversation(conversationId: string) {
  const conversation = conversations.find((item) => item.id === conversationId)!;
  return {
    ...conversation,
    participants: participants
      .filter((participant) => participant.conversationId === conversation.id)
      .map((participant) => ({
        ...participant,
        user: users.find((user) => user.id === participant.userId)!
      })),
    messages: messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 1)
      .map((message) => ({
        ...message,
        sender: users.find((user) => user.id === message.senderId)!
      }))
  };
}

const mockPrisma = {
  user: {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
      users.find((user) => user.id === where.id || user.email === where.email) ?? null
    ),
    findMany: vi.fn(async ({ where }: { where: { id: { not: string }; OR?: Array<Record<string, unknown>> } }) => {
      const query = where.OR ? "basil" : "";
      return users.filter((user) => user.id !== where.id.not && (!query || user.name.toLowerCase().includes(query)));
    }),
    update: vi.fn()
  },
  conversation: {
    findMany: vi.fn(async () => [serializeConversation("conv-1")]),
    upsert: vi.fn(async ({ where, create }: { where: { directKey: string }; create: { participants: { create: Array<{ userId: string }> } } }) => {
      const existing = conversations.find((conversation) => conversation.directKey === where.directKey);
      if (existing) {
        return serializeConversation(existing.id);
      }

      const conversation = {
        id: "conv-2",
        directKey: where.directKey,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z")
      };
      conversations = [conversation, ...conversations];
      create.participants.create.forEach((participant, index) => {
        participants.push({
          id: `cp-new-${index}`,
          conversationId: conversation.id,
          userId: participant.userId,
          joinedAt: new Date("2026-01-03T00:00:00.000Z")
        });
      });
      return serializeConversation(conversation.id);
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
  userBlock: {
    findFirst: vi.fn(async () => null)
  },
  message: {
    groupBy: vi.fn(async () => [{ conversationId: "conv-1", _count: 1 }]),
    findMany: vi.fn(async () =>
      messages
        .filter((message) => message.conversationId === "conv-1")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((message) => ({
          ...message,
          sender: users.find((user) => user.id === message.senderId)!
        }))
    ),
    updateMany: vi.fn(async ({ data }: { data: { readAt: Date } }) => {
      messages = messages.map((message) =>
        message.conversationId === "conv-1" && message.senderId !== "user-a" && !message.readAt
          ? { ...message, readAt: data.readAt }
          : message
      );
      return { count: 1 };
    })
  }
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { app } = await import("../../app.js");

describe("chat HTTP routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches users without returning the current user", async () => {
    const response = await request(app)
      .get("/api/users?q=basil")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].email).toBe("basil@example.com");
  });

  it("returns conversations with last message and unread count", async () => {
    const response = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(response.body.conversations[0].lastMessage.body).toBe("Hello from Basil");
    expect(response.body.conversations[0].unreadCount).toBe(1);
    expect(response.body.conversations[0].messages).toBeUndefined();
  });

  it("starts one-to-one conversations with a stable direct key", async () => {
    const response = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ userId: "user-c" })
      .expect(201);

    expect(response.body.conversation.directKey).toBe("user-a:user-c");
    expect(response.body.conversation.participants).toHaveLength(2);
  });

  it("returns persisted chat history and marks incoming messages read", async () => {
    const response = await request(app)
      .get("/api/conversations/conv-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(response.body.messages[0].body).toBe("Hello from Basil");
    expect(mockPrisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: "conv-1", senderId: { not: "user-a" }, readAt: null })
      })
    );
  });
});
