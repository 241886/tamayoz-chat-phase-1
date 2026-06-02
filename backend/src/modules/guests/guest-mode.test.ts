import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const baseDate = new Date("2026-01-01T00:00:00.000Z");

type TestUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: null;
  status: "ONLINE" | "OFFLINE";
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const users = new Map<string, TestUser>();

function safeUser(user: TestUser) {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

function ensureUser(id: string, name: string) {
  const existing = users.get(id);
  if (existing) {
    const updated = { ...existing, name };
    users.set(id, updated);
    return safeUser(updated);
  }

  const user: TestUser = {
    id,
    name,
    email: `${id}@guest.local`,
    passwordHash: "guest-session",
    avatarUrl: null,
    status: "OFFLINE",
    lastSeenAt: null,
    createdAt: baseDate,
    updatedAt: baseDate
  };
  users.set(id, user);
  return safeUser(user);
}

const participants = [
  { id: "cp-guest", conversationId: "conv-guest", userId: "guest_test_1", joinedAt: baseDate },
  { id: "cp-other", conversationId: "conv-guest", userId: "guest_test_2", joinedAt: baseDate }
];

let currentMessage = {
  id: "message-guest",
  conversationId: "conv-guest",
  groupId: null as string | null,
  senderId: "guest_test_1",
  body: "Guest message",
  isEdited: false,
  editedAt: null as Date | null,
  isDeleted: false,
  deletedAt: null as Date | null,
  readAt: null as Date | null,
  createdAt: baseDate,
  sender: safeUser(ensureUser("guest_test_1", "Guest 1001") as TestUser),
  attachments: []
};

const mockPrisma = {
  user: {
    upsert: vi.fn(async ({ where, update, create }: { where: { id: string }; update: { name: string }; create: TestUser }) => {
      if (users.has(where.id)) {
        return ensureUser(where.id, update.name);
      }
      return ensureUser(create.id, create.name);
    }),
    findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
      const user = Array.from(users.values()).find((item) => item.id === where.id || item.email === where.email);
      return user ? safeUser(user) : null;
    }),
    findMany: vi.fn(async ({ where }: { where: { id?: { in?: string[]; not?: string } } }) => {
      let found = Array.from(users.values()).map(safeUser);
      if (where.id?.in) {
        found = found.filter((user) => where.id!.in!.includes(user.id));
      }
      if (where.id?.not) {
        found = found.filter((user) => user.id !== where.id!.not);
      }
      return found;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { name?: string; status?: "ONLINE" | "OFFLINE"; lastSeenAt?: Date | null } }) => {
      const user = users.get(where.id)!;
      const updated = { ...user, ...data };
      users.set(where.id, updated);
      return safeUser(updated);
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
    findMany: vi.fn(async () => participants)
  },
  conversation: {
    create: vi.fn(async () => ({ id: "conv-group", directKey: "group:guest", createdAt: baseDate, updatedAt: baseDate })),
    update: vi.fn(async () => undefined),
    findFirst: vi.fn(async () => null)
  },
  message: {
    create: vi.fn(async ({ data }: { data: { conversationId: string; groupId?: string; senderId: string; body: string } }) => ({
      ...currentMessage,
      ...data,
      id: "message-guest",
      sender: safeUser(users.get(data.senderId)!)
    })),
    findUniqueOrThrow: vi.fn(async () => currentMessage),
    findUnique: vi.fn(async () => currentMessage),
    update: vi.fn(async ({ data }: { data: Partial<typeof currentMessage> }) => {
      currentMessage = { ...currentMessage, ...data };
      return currentMessage;
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
    findMany: vi.fn(async () => [currentMessage]),
    groupBy: vi.fn(async () => [])
  },
  attachment: {
    create: vi.fn(async () => ({
      id: "attachment-guest",
      messageId: "message-guest",
      conversationId: "conv-guest",
      senderId: "guest_test_1",
      originalName: "notes.txt",
      storedName: "notes-stored.txt",
      url: "/uploads/notes-stored.txt",
      mimeType: "text/plain",
      size: 11,
      createdAt: baseDate
    }))
  },
  chatGroup: {
    create: vi.fn(async ({ data }: { data: { name: string; creatorId: string; conversationId: string; members: { create: Array<{ userId: string; role: string }> } } }) => ({
      id: "group-guest",
      name: data.name,
      description: null,
      avatarUrl: null,
      creatorId: data.creatorId,
      conversationId: data.conversationId,
      createdAt: baseDate,
      updatedAt: baseDate,
      creator: safeUser(users.get(data.creatorId)!),
      members: data.members.create.map((member, index) => ({
        id: `gm-${index}`,
        groupId: "group-guest",
        userId: member.userId,
        role: member.role,
        joinedAt: baseDate,
        user: safeUser(users.get(member.userId)!)
      })),
      conversation: { messages: [] }
    })),
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async () => undefined)
  },
  groupMember: {
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    createMany: vi.fn(async () => ({ count: 0 })),
    delete: vi.fn(async () => undefined)
  },
  userBlock: {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    upsert: vi.fn(async ({ create }: { create: { blockerId: string; blockedId: string } }) => ({
      id: "block-guest",
      ...create,
      createdAt: baseDate
    })),
    deleteMany: vi.fn(async () => ({ count: 1 }))
  }
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { app } = await import("../../app.js");

function guestHeaders(id = "guest_test_1", name = "Guest 1001") {
  return {
    "x-guest-id": id,
    "x-guest-name": name
  };
}

describe("guest mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    users.clear();
    ensureUser("guest_test_1", "Guest 1001");
    ensureUser("guest_test_2", "Guest 2002");
    currentMessage = {
      ...currentMessage,
      senderId: "guest_test_1",
      body: "Guest message",
      isEdited: false,
      editedAt: null,
      isDeleted: false,
      deletedAt: null,
      attachments: []
    };
    app.set("io", undefined);
  });

  afterEach(() => {
    const uploadsDir = path.resolve("uploads");
    if (fs.existsSync(uploadsDir)) {
      for (const fileName of fs.readdirSync(uploadsDir)) {
        try {
          fs.rmSync(path.join(uploadsDir, fileName), { force: true });
        } catch {
          // Windows can briefly hold uploaded test files open.
        }
      }
    }
  });

  it("creates or loads a guest user automatically", async () => {
    const response = await request(app)
      .get("/api/users/profile")
      .set(guestHeaders("guest_test_3", "Guest 3333"))
      .expect(200);

    expect(response.body.user).toMatchObject({ id: "guest_test_3", name: "Guest 3333" });
    expect(mockPrisma.user.upsert).toHaveBeenCalled();
  });

  it("lets a guest send a private message", async () => {
    await request(app)
      .post("/api/conversations/conv-guest/messages")
      .set(guestHeaders())
      .send({ body: "Hello as guest" })
      .expect(201);

    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-guest",
        senderId: "guest_test_1",
        body: "Hello as guest"
      }
    });
  });

  it("lets a guest upload a file", async () => {
    await request(app)
      .post("/api/conversations/conv-guest/messages")
      .set(guestHeaders())
      .field("body", "Guest file")
      .attach("file", Buffer.from("hello world"), {
        filename: "notes.txt",
        contentType: "text/plain"
      })
      .expect(201);

    expect(mockPrisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conv-guest",
        senderId: "guest_test_1",
        originalName: "notes.txt"
      })
    });
  });

  it("lets a guest create a group", async () => {
    const response = await request(app)
      .post("/api/groups")
      .set(guestHeaders())
      .send({ name: "Guest Group", memberIds: ["guest_test_2"] })
      .expect(201);

    expect(response.body.group).toMatchObject({ name: "Guest Group", creatorId: "guest_test_1" });
  });

  it("lets a guest edit and delete their own message", async () => {
    await request(app)
      .patch("/api/messages/message-guest")
      .set(guestHeaders())
      .send({ body: "Edited by guest" })
      .expect(200);

    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: "Edited by guest", isEdited: true })
      })
    );

    await request(app).delete("/api/messages/message-guest").set(guestHeaders()).expect(200);
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDeleted: true })
      })
    );
  });

  it("prevents a guest from editing or deleting another guest's message", async () => {
    currentMessage = { ...currentMessage, senderId: "guest_test_2" };

    await request(app)
      .patch("/api/messages/message-guest")
      .set(guestHeaders())
      .send({ body: "Nope" })
      .expect(403);

    await request(app).delete("/api/messages/message-guest").set(guestHeaders()).expect(403);
  });

  it("lets a guest block and unblock another user", async () => {
    await request(app)
      .post("/api/users/guest_test_2/block")
      .set(guestHeaders())
      .expect(201);

    expect(mockPrisma.userBlock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { blockerId: "guest_test_1", blockedId: "guest_test_2" }
      })
    );

    await request(app)
      .delete("/api/users/guest_test_2/block")
      .set(guestHeaders())
      .expect(200);

    expect(mockPrisma.userBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: "guest_test_1", blockedId: "guest_test_2" }
    });
  });

  it("prevents a guest from blocking themselves", async () => {
    await request(app)
      .post("/api/users/guest_test_1/block")
      .set(guestHeaders())
      .expect(400);
  });

  it("prevents a blocked user from sending private messages to the blocker", async () => {
    mockPrisma.userBlock.findFirst.mockResolvedValueOnce({
      id: "block-guest",
      blockerId: "guest_test_2",
      blockedId: "guest_test_1",
      createdAt: baseDate
    });

    await request(app)
      .post("/api/conversations/conv-guest/messages")
      .set(guestHeaders())
      .send({ body: "Blocked private message" })
      .expect(403);
  });
});
