import { beforeEach, describe, expect, it, vi } from "vitest";

const message = {
  id: "message-1",
  conversationId: "conv-1",
  senderId: "user-a",
  body: "Updated",
  isEdited: true,
  editedAt: new Date("2026-01-01T00:00:00.000Z"),
  isDeleted: false,
  deletedAt: null,
  readAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  attachments: []
};

const mockPrisma = {
  conversationParticipant: {
    findMany: vi.fn(async () => [
      { id: "cp-a", conversationId: "conv-1", userId: "user-a" },
      { id: "cp-b", conversationId: "conv-1", userId: "user-b" }
    ])
  },
  conversation: {
    findFirst: vi.fn(async () => ({
      id: "conv-1",
      directKey: "user-a:user-b",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      participants: [],
      messages: [message]
    }))
  }
};

vi.mock("../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { broadcastMessageDeleted, broadcastMessageUpdated } = await import("./notify.js");

function fakeIo() {
  const emit = vi.fn();
  return {
    emit,
    to: vi.fn(() => ({ emit }))
  };
}

describe("message change socket notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits message:updated to conversation participants", async () => {
    const io = fakeIo();

    await broadcastMessageUpdated(io as never, "conv-1", message);

    expect(io.to).toHaveBeenCalledWith("user:user-a");
    expect(io.to).toHaveBeenCalledWith("user:user-b");
    expect(io.emit).toHaveBeenCalledWith("message:updated", { message });
  });

  it("emits message:deleted to conversation participants", async () => {
    const io = fakeIo();
    const deleted = { ...message, isDeleted: true, body: "This message was deleted", attachments: [{ id: "a1" }] };

    await broadcastMessageDeleted(io as never, "conv-1", deleted);

    expect(io.emit).toHaveBeenCalledWith("message:deleted", {
      message: expect.objectContaining({ body: "This message was deleted", attachments: [] })
    });
  });
});
