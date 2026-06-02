import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../utils/async-route.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", asyncRoute(async (req, res) => {
  const query = String(req.query.q ?? "").trim();

  const users = await prisma.user.findMany({
    where: {
      id: { not: req.user!.id },
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } }
            ]
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      status: true,
      lastSeenAt: true
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 20
  });

  return res.json({ users });
}));

usersRouter.get("/blocks", asyncRoute(async (req, res) => {
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: req.user!.id },
    select: {
      blockedId: true,
      createdAt: true,
      blocked: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          status: true,
          lastSeenAt: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json({ blocks });
}));

usersRouter.get("/profile", asyncRoute(async (req, res) => {
  return res.json({ user: req.user });
}));

usersRouter.patch("/profile", asyncRoute(async (req, res) => {
  const name = String(req.body.name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);

  if (!name) {
    return res.status(400).json({ message: "Name is required." });
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      status: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return res.json({ user });
}));

usersRouter.post("/:userId/block", asyncRoute(async (req, res) => {
  if (req.params.userId === req.user!.id) {
    return res.status(400).json({ message: "You cannot block yourself." });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });

  if (!target) {
    return res.status(404).json({ message: "User was not found." });
  }

  const block = await prisma.userBlock.upsert({
    where: {
      blockerId_blockedId: {
        blockerId: req.user!.id,
        blockedId: req.params.userId
      }
    },
    create: {
      blockerId: req.user!.id,
      blockedId: req.params.userId
    },
    update: {}
  });

  req.app.get("io")?.to(`user:${req.user!.id}`).emit("user:block", { blockedId: req.params.userId });

  return res.status(201).json({ block });
}));

usersRouter.delete("/:userId/block", asyncRoute(async (req, res) => {
  await prisma.userBlock.deleteMany({
    where: {
      blockerId: req.user!.id,
      blockedId: req.params.userId
    }
  });

  req.app.get("io")?.to(`user:${req.user!.id}`).emit("user:unblock", { blockedId: req.params.userId });

  return res.json({ message: "User unblocked." });
}));
