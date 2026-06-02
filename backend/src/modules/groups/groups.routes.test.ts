import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../../utils/auth.js";

const users = [
  {
    id: "user-a",
    name: "Alya Mentor",
    email: "alya@example.com",
    avatarUrl: null,
    status: "ONLINE",
    lastSeenAt: null
  },
  {
    id: "user-b",
    name: "Basil Student",
    email: "basil@example.com",
    avatarUrl: null,
    status: "OFFLINE",
    lastSeenAt: null
  },
  {
    id: "user-c",
    name: "Cora Admin",
    email: "cora@example.com",
    avatarUrl: null,
    status: "OFFLINE",
    lastSeenAt: null
  },
  {
    id: "user-d",
    name: "Dina Parent",
    email: "dina@example.com",
    avatarUrl: null,
    status: "OFFLINE",
    lastSeenAt: null
  }
];

const groupConversation = {
  id: "conv-group-1",
  directKey: "group:stable",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  messages: []
};

const baseMembers = [
  { id: "gm-a", groupId: "group-1", userId: "user-a", role: "ADMIN", mutedAt: null, joinedAt: new Date("2026-01-01T00:00:00.000Z"), user: users[0] },
  { id: "gm-b", groupId: "group-1", userId: "user-b", role: "MEMBER", mutedAt: null, joinedAt: new Date("2026-01-01T00:00:00.000Z"), user: users[1] }
];

let currentMembers = [...baseMembers];

const groupBase = {
  id: "group-1",
  name: "Training Team",
  description: "Phase group",
  avatarUrl: null,
  creatorId: "user-a",
  conversationId: "conv-group-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  archivedAt: null,
  creator: users[0],
  conversation: groupConversation
};

function groupPayload() {
  return {
    ...groupBase,
    members: currentMembers
  };
}

const storedAttachment = {
  id: "attachment-1",
  messageId: "message-1",
  conversationId: "conv-group-1",
  groupId: "group-1",
  senderId: "user-a",
  originalName: "notes.txt",
  storedName: "notes-stored.txt",
  url: "/uploads/notes-stored.txt",
  mimeType: "text/plain",
  size: 11,
  createdAt: new Date("2026-01-01T00:00:00.000Z")
};

const message = {
  id: "message-1",
  conversationId: "conv-group-1",
  groupId: "group-1",
  senderId: "user-a",
  body: "Hello group",
  isEdited: false,
  editedAt: null,
  isDeleted: false,
  deletedAt: null,
  readAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  sender: users[0],
  attachments: []
};

let adminRole = "ADMIN";

const mockPrisma = {
  user: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.find((user) => user.id === where.id) ?? null),
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      users.filter((user) => where.id.in.includes(user.id)).map((user) => ({ id: user.id }))
    )
  },
  conversation: {
    create: vi.fn(async () => groupConversation),
    update: vi.fn(async () => groupConversation)
  },
  chatGroup: {
    create: vi.fn(async ({ data }: { data: { name: string; description: string | null; creatorId: string; conversationId: string } }) => ({
      ...groupPayload(),
      name: data.name,
      description: data.description,
      creatorId: data.creatorId,
      conversationId: data.conversationId
    })),
    findMany: vi.fn(async () => [groupPayload()]),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === groupBase.id ? groupPayload() : null)),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === groupBase.id ? groupPayload() : null)),
    findUniqueOrThrow: vi.fn(async () => groupPayload()),
    update: vi.fn(async ({ data }: { data: { name?: string; description?: string | null; creatorId?: string; archivedAt?: Date | null } }) => ({
      ...groupPayload(),
      ...data
    }))
  },
  groupMember: {
    findUnique: vi.fn(async ({ where }: { where: { groupId_userId: { groupId: string; userId: string } } }) => {
      if (where.groupId_userId.groupId !== groupBase.id) return null;
      return {
        id: `gm-${where.groupId_userId.userId}`,
        groupId: groupBase.id,
        userId: where.groupId_userId.userId,
        role: where.groupId_userId.userId === "user-a" ? adminRole : "MEMBER",
        mutedAt: null,
        joinedAt: new Date("2026-01-01T00:00:00.000Z")
      };
    }),
    findMany: vi.fn(async ({ where }: { where?: { groupId?: string; userId?: { in?: string[]; not?: string } } } = {}) => {
      if (where?.userId?.in) {
        return currentMembers.filter((member) => where.userId!.in.includes(member.userId));
      }
      if (where?.userId?.not) {
        return currentMembers.filter((member) => member.userId !== where.userId!.not);
      }
      return currentMembers;
    }),
    createMany: vi.fn(async ({ data }: { data: Array<{ groupId: string; userId: string }> }) => {
      for (const item of data) {
        const user = users.find((candidate) => candidate.id === item.userId)!;
        currentMembers.push({
          id: `gm-${item.userId}`,
          groupId: item.groupId,
          userId: item.userId,
          role: "MEMBER",
          mutedAt: null,
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          user
        });
      }
      return { count: data.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { groupId_userId: { userId: string } }; data: { role?: string; mutedAt?: Date | null } }) => {
      const member = currentMembers.find((item) => item.userId === where.groupId_userId.userId)!;
      Object.assign(member, data);
      return member;
    }),
    delete: vi.fn(async ({ where }: { where: { groupId_userId: { userId: string } } }) => {
      currentMembers = currentMembers.filter((member) => member.userId !== where.groupId_userId.userId);
    })
  },
  message: {
    create: vi.fn(async ({ data }: { data: { body: string } }) => ({ ...message, body: data.body, attachments: [] })),
    findMany: vi.fn(async () => [message]),
    findUniqueOrThrow: vi.fn(async () => message)
  },
  attachment: {
    create: vi.fn(async () => storedAttachment)
  },
  userBlock: {
    findMany: vi.fn(async () => [])
  }
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { app } = await import("../../app.js");

describe("group chat routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminRole = "ADMIN";
    currentMembers = baseMembers.map((member) => ({ ...member }));
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

  it("creates a group with the creator as admin", async () => {
    const response = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ name: "Training Team", description: "Phase group", memberIds: ["user-b"] })
      .expect(201);

    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: { directKey: expect.stringMatching(/^group:/) }
    });
    expect(mockPrisma.chatGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Training Team",
          creatorId: "user-a",
          members: {
            create: expect.arrayContaining([
              expect.objectContaining({ userId: "user-a", role: "ADMIN" }),
              expect.objectContaining({ userId: "user-b", role: "MEMBER" })
            ])
          }
        })
      })
    );
    expect(response.body.group.name).toBe("Training Team");
  });

  it("allows admins to add one member", async () => {
    const response = await request(app)
      .post("/api/groups/group-1/members")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ userId: "user-c" })
      .expect(201);

    expect(mockPrisma.groupMember.createMany).toHaveBeenCalledWith({
      data: [{ groupId: "group-1", userId: "user-c" }]
    });
    expect(response.body.group.members).toEqual(expect.arrayContaining([expect.objectContaining({ userId: "user-c" })]));
  });

  it("allows admins to add multiple members", async () => {
    const response = await request(app)
      .post("/api/groups/group-1/members")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ userIds: ["user-c", "user-d"] })
      .expect(201);

    expect(mockPrisma.groupMember.createMany).toHaveBeenCalledWith({
      data: [
        { groupId: "group-1", userId: "user-c" },
        { groupId: "group-1", userId: "user-d" }
      ]
    });
    expect(response.body.group.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: "user-c" }), expect.objectContaining({ userId: "user-d" })])
    );
  });

  it("allows admins to remove members", async () => {
    await request(app)
      .delete("/api/groups/group-1/members/user-b")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(mockPrisma.groupMember.delete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: "group-1", userId: "user-b" } }
    });
  });

  it("rejects duplicate existing members", async () => {
    await request(app)
      .post("/api/groups/group-1/members")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ userIds: ["user-b"] })
      .expect(409);

    expect(mockPrisma.groupMember.createMany).not.toHaveBeenCalled();
  });

  it("lets a user leave a group and removes it from their sidebar", async () => {
    await request(app)
      .post("/api/groups/group-1/leave")
      .set("Authorization", `Bearer ${signToken({ userId: "user-b" })}`)
      .expect(200);

    expect(mockPrisma.groupMember.delete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: "group-1", userId: "user-b" } }
    });
  });

  it("transfers admin when the admin leaves", async () => {
    await request(app)
      .post("/api/groups/group-1/leave")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(mockPrisma.groupMember.update).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: "group-1", userId: "user-b" } },
      data: { role: "ADMIN" }
    });
    expect(mockPrisma.chatGroup.update).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { creatorId: "user-b" }
    });
  });

  it("archives the group when the last member leaves", async () => {
    currentMembers = [baseMembers[0]];

    await request(app)
      .post("/api/groups/group-1/leave")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(mockPrisma.chatGroup.update).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { archivedAt: expect.any(Date) }
    });
  });

  it("mutes and unmutes groups per user", async () => {
    await request(app)
      .post("/api/groups/group-1/mute")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(mockPrisma.groupMember.update).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: "group-1", userId: "user-a" } },
      data: { mutedAt: expect.any(Date) }
    });

    await request(app)
      .delete("/api/groups/group-1/mute")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(mockPrisma.groupMember.update).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: "group-1", userId: "user-a" } },
      data: { mutedAt: null }
    });
  });

  it("hides blocked member group messages for the blocker", async () => {
    mockPrisma.userBlock.findMany.mockResolvedValueOnce([{ blockedId: "user-b" }]);
    mockPrisma.message.findMany.mockResolvedValueOnce([
      { ...message, id: "message-blocked", senderId: "user-b", sender: users[1], attachments: [] },
      { ...message, id: "message-visible", senderId: "user-c", sender: users[2], attachments: [] }
    ]);

    const response = await request(app)
      .get("/api/groups/group-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].id).toBe("message-visible");
  });

  it("allows admins to add and remove members", async () => {
    await request(app)
      .post("/api/groups/group-1/members")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ userId: "user-c" })
      .expect(201);

    await request(app)
      .delete("/api/groups/group-1/members/user-b")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(mockPrisma.groupMember.delete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: "group-1", userId: "user-b" } }
    });
  });

  it("prevents non-admins from managing a group", async () => {
    adminRole = "MEMBER";

    await request(app)
      .patch("/api/groups/group-1")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ name: "Renamed" })
      .expect(403);

    await request(app)
      .post("/api/groups/group-1/members")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ userId: "user-c" })
      .expect(403);
  });

  it("sends and persists a text group message", async () => {
    const response = await request(app)
      .post("/api/groups/group-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ body: "Hello group" })
      .expect(201);

    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-group-1",
        groupId: "group-1",
        senderId: "user-a",
        body: "Hello group"
      }
    });
    expect(response.body.message.groupId).toBe("group-1");
  });

  it("sends and persists a group file message", async () => {
    await request(app)
      .post("/api/groups/group-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .field("body", "File for the group")
      .attach("file", Buffer.from("hello world"), {
        filename: "notes.txt",
        contentType: "text/plain"
      })
      .expect(201);

    expect(mockPrisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: "message-1",
        conversationId: "conv-group-1",
        groupId: "group-1",
        senderId: "user-a",
        originalName: "notes.txt",
        mimeType: "text/plain",
        size: 11
      })
    });
  });
});
