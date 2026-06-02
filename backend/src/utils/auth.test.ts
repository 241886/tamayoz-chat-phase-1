import { describe, expect, it } from "vitest";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.js";

describe("auth utilities", () => {
  it("hashes passwords and verifies only the correct password", async () => {
    const passwordHash = await hashPassword("CorrectHorse123");

    expect(passwordHash).not.toBe("CorrectHorse123");
    await expect(verifyPassword("CorrectHorse123", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword123", passwordHash)).resolves.toBe(false);
  });

  it("signs and verifies JWT tokens", () => {
    const token = signToken({ userId: "user-1" });
    const payload = verifyToken(token);

    expect(payload.userId).toBe("user-1");
  });
});
