import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const participant = {
  id: "cp-a",
  conversationId: "conv-1",
  userId: "user-a",
  joinedAt: new Date("2026-01-01T00:00:00.000Z")
};

const storedAttachment = {
  id: "attachment-1",
  messageId: "message-1",
  conversationId: "conv-1",
  senderId: "user-a",
  originalName: "notes.txt",
  storedName: "notes-stored.txt",
  url: "/uploads/notes-stored.txt",
  mimeType: "text/plain",
  size: 11,
  createdAt: new Date("2026-01-01T00:00:00.000Z")
};

const createdMessage = {
  id: "message-1",
  conversationId: "conv-1",
  senderId: "user-a",
  body: "Here is the file",
  readAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z")
};

const mockPrisma = {
  user: {
    findUnique: vi.fn(async () => safeUser)
  },
  conversationParticipant: {
    findUnique: vi.fn(async () => participant),
    findMany: vi.fn(async () => [participant])
  },
  conversation: {
    update: vi.fn(async () => undefined),
    findFirst: vi.fn(async () => ({
      id: "conv-1",
      directKey: "user-a:user-b",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      participants: [{ ...participant, user: safeUser }],
      messages: [{ ...createdMessage, sender: safeUser, attachments: [storedAttachment] }]
    }))
  },
  message: {
    create: vi.fn(async ({ data }: { data: { body: string } }) => ({ ...createdMessage, body: data.body })),
    findUniqueOrThrow: vi.fn(async () => ({
      ...createdMessage,
      sender: safeUser,
      attachments: [storedAttachment]
    }))
  },
  attachment: {
    create: vi.fn(async () => storedAttachment)
  }
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { app } = await import("../../app.js");

describe("file upload messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    const uploadsDir = path.resolve("uploads");
    if (fs.existsSync(uploadsDir)) {
      for (const fileName of fs.readdirSync(uploadsDir)) {
        fs.rmSync(path.join(uploadsDir, fileName), { force: true });
      }
    }
  });

  it("uploads a text message with an attachment and persists file metadata", async () => {
    const response = await request(app)
      .post("/api/conversations/conv-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .field("body", "Here is the file")
      .attach("file", Buffer.from("hello world"), {
        filename: "notes.txt",
        contentType: "text/plain"
      })
      .expect(201);

    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-1",
        senderId: "user-a",
        body: "Here is the file"
      }
    });
    expect(mockPrisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: "message-1",
        conversationId: "conv-1",
        senderId: "user-a",
        originalName: "notes.txt",
        mimeType: "text/plain",
        size: 11
      })
    });
    expect(response.body.message.attachments[0].originalName).toBe("notes.txt");
  });

  it("allows file-only messages", async () => {
    await request(app)
      .post("/api/conversations/conv-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .attach("file", Buffer.from("hello world"), {
        filename: "notes.txt",
        contentType: "text/plain"
      })
      .expect(201);

    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-1",
        senderId: "user-a",
        body: ""
      }
    });
  });

  it("rejects executable file types", async () => {
    const response = await request(app)
      .post("/api/conversations/conv-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .attach("file", Buffer.from("bad"), {
        filename: "run.exe",
        contentType: "application/x-msdownload"
      })
      .expect(400);

    expect(response.body.message).toBe("This file type is not allowed.");
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("accepts browser-recorded voice messages", async () => {
    await request(app)
      .post("/api/conversations/conv-1/messages")
      .set("Authorization", `Bearer ${signToken({ userId: "user-a" })}`)
      .attach("file", Buffer.from("voice"), {
        filename: "voice-message.webm",
        contentType: "audio/webm;codecs=opus"
      })
      .expect(201);

    expect(mockPrisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalName: "voice-message.webm",
        mimeType: "audio/webm"
      })
    });
  });
});
