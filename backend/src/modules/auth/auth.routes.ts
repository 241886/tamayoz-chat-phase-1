import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../utils/async-route.js";
import { hashPassword, signToken, verifyPassword } from "../../utils/auth.js";
import { isValidEmail, normalizeEmail, normalizeName, userSelect } from "./auth.helpers.js";

export const authRouter = Router();

authRouter.post("/register", asyncRoute(async (req, res) => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }

  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedName) {
    return res.status(400).json({ message: "Name is required." });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "A valid email address is required." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ message: "Email is already registered." });
  }

  const user = await prisma.user.create({
    data: {
      name: normalizedName,
      email: normalizedEmail,
      passwordHash: await hashPassword(password)
    },
    select: userSelect
  });

  return res.status(201).json({ token: signToken({ userId: user.id }), user });
}));

authRouter.post("/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "A valid email address is required." });
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const safeUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: userSelect
  });

  return res.json({ token: signToken({ userId: user.id }), user: safeUser });
}));

authRouter.get("/me", requireAuth, asyncRoute(async (req, res) => {
  return res.json({ user: req.user });
}));

authRouter.post("/logout", requireAuth, asyncRoute(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { status: "OFFLINE", lastSeenAt: new Date() }
  });

  return res.json({ message: "Logged out." });
}));
