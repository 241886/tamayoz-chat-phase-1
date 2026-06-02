import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, signToken } from "../../utils/auth.js";

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn()
  }
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: mockPrisma
}));

const { app } = await import("../../app.js");

const safeUser = {
  id: "user-1",
  name: "Alya Mentor",
  email: "alya@example.com",
  avatarUrl: null,
  status: "OFFLINE",
  lastSeenAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a new user with normalized email/name and does not return passwordHash", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(safeUser);

    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "  Alya   Mentor  ", email: "  ALYA@EXAMPLE.COM  ", password: "Password123" })
      .expect(201);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Alya Mentor",
          email: "alya@example.com",
          passwordHash: expect.not.stringMatching("Password123")
        })
      })
    );
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("rejects duplicate registration emails", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(safeUser);

    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Alya", email: "alya@example.com", password: "Password123" })
      .expect(409);

    expect(response.body.message).toBe("Email is already registered.");
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects invalid registration input", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "   ", email: "not-an-email", password: "short" })
      .expect(400);
  });

  it("logs in with valid credentials and rejects bad passwords", async () => {
    const passwordHash = await hashPassword("Password123");
    mockPrisma.user.findUnique.mockResolvedValue({ ...safeUser, passwordHash });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(safeUser);

    const success = await request(app)
      .post("/api/auth/login")
      .send({ email: " ALYA@EXAMPLE.COM ", password: "Password123" })
      .expect(200);

    expect(success.body.token).toEqual(expect.any(String));
    expect(success.body.user.email).toBe("alya@example.com");

    await request(app)
      .post("/api/auth/login")
      .send({ email: "alya@example.com", password: "WrongPassword123" })
      .expect(401);
  });

  it("returns the authenticated user from /me", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(safeUser);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${signToken({ userId: safeUser.id })}`)
      .expect(200);

    expect(response.body.user.email).toBe("alya@example.com");
  });

  it("requires a valid token for /me", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set("Authorization", "Bearer invalid").expect(401);
  });

  it("logs out by marking the user offline", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(safeUser);
    mockPrisma.user.update.mockResolvedValue({ ...safeUser, status: "OFFLINE" });

    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${signToken({ userId: safeUser.id })}`)
      .expect(200);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: safeUser.id },
      data: { status: "OFFLINE", lastSeenAt: expect.any(Date) }
    });
  });
});
