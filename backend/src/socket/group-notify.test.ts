import { beforeEach, describe, expect, it, vi } from "vitest";

const user = {
  id: "user-a",
  name: "Alya Mentor",
  email: "alya@example.com",
  avatarUrl: null,
  status: "ONLINE",
  lastSeenAt: null
};

const group = {
  id: "group-1",
  name: "Training Team",
  description: null,
  avatarUrl: null,
  creatorId: "user-a",
  conversationId: "conv-group-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  creator: user,
  members: [
    { id: "gm-a", groupId: "group-1", userId: "user-a", role: "ADMIN", joinedAt: new Date("2026-01-01T00:00:00.000Z"), user },
    { id: "gm-b", groupId: "group-1", userId: "user-b", role: "MEMBER", joinedAt: new Date("2026-01-01T00:00:00.000Z"), user: { ...user, id: "user-b" } }
  ],
  conversation: { messages: [] }
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
  sender: user,
  attachments: []
};

const mockPrisma = {
  groupMember: {
    findMany: vi.fn(async () => group.members)
  },
  chatGroup: {
    findFirst: vi.fn(async () => group),
    findUnique: vi.fn(async () => group)
  }
};

vi.mock("../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const {
  broadcastGroupCreated,
  broadcastGroupMemberChanged,
  broadcastGroupMessage
} = await import("./group-notify.js");

function fakeIo() {
  const emit = vi.fn();
  const socketsJoin = vi.fn();
  const socketsLeave = vi.fn();
  return {
    emit,
    socketsJoin,
    socketsLeave,
    to: vi.fn(() => ({ emit })),
    in: vi.fn(() => ({ socketsJoin, socketsLeave }))
  };
}

describe("group socket notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins invited users to the group room and emits group:created", async () => {
    const io = fakeIo();

    await broadcastGroupCreated(io as never, group);

    expect(io.in).toHaveBeenCalledWith("user:user-a");
    expect(io.in).toHaveBeenCalledWith("user:user-b");
    expect(io.socketsJoin).toHaveBeenCalledWith("group:group-1");
    expect(io.emit).toHaveBeenCalledWith("group:created", { group: expect.objectContaining({ id: "group-1" }) });
  });

  it("emits group messages to the group room in real time", async () => {
    const io = fakeIo();

    await broadcastGroupMessage(io as never, "group-1", message);

    expect(io.to).toHaveBeenCalledWith("group:group-1");
    expect(io.emit).toHaveBeenCalledWith("group:message:new", {
      message: expect.objectContaining({ id: "message-1", groupId: "group-1", body: "Hello group" })
    });
  });

  it("joins a newly added user and sends the group for sidebar upsert", async () => {
    const io = fakeIo();

    await broadcastGroupMemberChanged(io as never, "group-1", "user-b", "group:member-added");

    expect(io.in).toHaveBeenCalledWith("user:user-b");
    expect(io.socketsJoin).toHaveBeenCalledWith("group:group-1");
    expect(io.emit).toHaveBeenCalledWith("group:created", { group: expect.objectContaining({ id: "group-1" }) });
    expect(io.emit).toHaveBeenCalledWith("group:member-added", {
      groupId: "group-1",
      userId: "user-b",
      group: expect.objectContaining({ id: "group-1" })
    });
  });

  it("removes sockets from the group room when a member is removed", async () => {
    const io = fakeIo();

    await broadcastGroupMemberChanged(io as never, "group-1", "user-b", "group:member-removed");

    expect(io.in).toHaveBeenCalledWith("user:user-b");
    expect(io.socketsLeave).toHaveBeenCalledWith("group:group-1");
    expect(io.emit).toHaveBeenCalledWith("group:member-removed", expect.objectContaining({ groupId: "group-1", userId: "user-b" }));
  });
});
