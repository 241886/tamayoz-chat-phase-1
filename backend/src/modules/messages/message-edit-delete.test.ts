import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../../utils/auth.js";

const safeUser = {
  id: "user-a",
  name: "Alya Mentor",
  email: "alya@example.com",
  avatarUrl: null,
  status: "ONLINE",
  lastSeenAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const baseMessage = {
  id: "message-1",
  conversationId: "conv-1",
  senderId: "user-a",
  body: "Original text",
  isEdited: false,
  editedAt: null,
  isDeleted: false,
  deletedAt: null,
  readAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  attachments: [],
  sender: safeUser
};

let currentMessage = { ...baseMessage };

const mockPrisma = {
  user: {
    findUnique: vi.fn(async () => safeUser)
  },
  conversationParticipant: {
    findMany: vi.fn(async () => [{ id: "cp-a", conversationId: "conv-1", userId: "user-a" }])
  },
  conversation: {
    findFirst: vi.fn(async () => ({
      id: "conv-1",
      directKey: "user-a:user-b",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      participants: [{ id: "cp-a", conversationId: "conv-1", userId: "user-a", user: safeUser }],
      messages: [currentMessage]
    }))
  },
  message: {
    findUnique: vi.fn(async () => currentMessage),
    update: vi.fn(async ({ data }: { data: Partial<typeof baseMessage> }) => {
      currentMessage = { ...currentMessage, ...data };
      return currentMessage;
    })
  }
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { app } = await import("../../app.js");

describe("message edit and delete routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMessage = { ...baseMessage };
    app.set("io", undefined);
  });

  it("allows a user to edit their own text message", async () => {
    const response = await request(app)
      .patch("/api/messages/message-1")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ body: "Updated text" })
      .expect(200);

    expect(response.body.message.body).toBe("Updated text");
    expect(response.body.message.isEdited).toBe(true);
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: "Updated text", isEdited: true, editedAt: expect.any(Date) })
      })
    );
  });

  it("prevents a user from editing another user's message", async () => {
    currentMessage = { ...baseMessage, senderId: "user-b" };

    await request(app)
      .patch("/api/messages/message-1")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ body: "Nope" })
      .expect(403);
  });

  it("prevents editing a deleted message", async () => {
    currentMessage = { ...baseMessage, isDeleted: true, deletedAt: new Date() };

    await request(app)
      .patch("/api/messages/message-1")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .send({ body: "Nope" })
      .expect(400);
  });

  it("allows a user to soft delete their own message", async () => {
    const response = await request(app)
      .delete("/api/messages/message-1")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(200);

    expect(response.body.message.body).toBe("This message was deleted");
    expect(response.body.message.isDeleted).toBe(true);
    expect(response.body.message.attachments).toEqual([]);
  });

  it("prevents a user from deleting another user's message", async () => {
    currentMessage = { ...baseMessage, senderId: "user-b" };

    await request(app)
      .delete("/api/messages/message-1")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .expect(403);
  });
});
