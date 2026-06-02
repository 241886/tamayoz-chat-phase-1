import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../utils/async-route.js";
import { messageInclude, serializeMessage } from "../conversations/conversations.helpers.js";
import { fileUrlFor, parseMessageUpload, sanitizeFileName, UploadError } from "../messages/upload.js";
import {
  getGroupForUser,
  groupInclude,
  requireGroupAdmin,
  requireGroupMember,
  serializeGroup
} from "./groups.helpers.js";
import {
  broadcastGroupCreated,
  broadcastGroupMemberChanged,
  broadcastGroupMessage,
  broadcastGroupUpsert
} from "../../socket/group-notify.js";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

function normalizeMemberIds(memberIds: unknown, currentUserId: string) {
  const ids = Array.isArray(memberIds) ? memberIds.filter((id): id is string => typeof id === "string") : [];
  return Array.from(new Set([currentUserId, ...ids]));
}

function normalizeAddedMemberIds(body: { userId?: unknown; userIds?: unknown; memberIds?: unknown }) {
  const rawIds = [
    ...(Array.isArray(body.userIds) ? body.userIds : []),
    ...(Array.isArray(body.memberIds) ? body.memberIds : []),
    body.userId
  ];

  return Array.from(
    new Set(
      rawIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

groupsRouter.post("/", asyncRoute(async (req, res) => {
  const name = String(req.body.name ?? "").trim();
  const description = String(req.body.description ?? "").trim() || null;
  const memberIds = normalizeMemberIds(req.body.memberIds, req.user!.id);

  if (!name) {
    return res.status(400).json({ message: "Group name is required." });
  }

  if (memberIds.length < 2) {
    return res.status(400).json({ message: "Add at least one other member." });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true }
  });

  if (users.length !== memberIds.length) {
    return res.status(400).json({ message: "One or more selected users were not found." });
  }

  const conversation = await prisma.conversation.create({
    data: {
      directKey: `group:${crypto.randomUUID()}`
    }
  });

  const group = await prisma.chatGroup.create({
    data: {
      name,
      description,
      creatorId: req.user!.id,
      conversationId: conversation.id,
      members: {
        create: memberIds.map((userId) => ({
          userId,
          role: userId === req.user!.id ? "ADMIN" : "MEMBER"
        }))
      }
    },
    include: groupInclude
  });

  await broadcastGroupCreated(req.app.get("io"), group);

  return res.status(201).json({ group: serializeGroup(group) });
}));

groupsRouter.get("/", asyncRoute(async (req, res) => {
  const groups = await prisma.chatGroup.findMany({
    where: { archivedAt: null, members: { some: { userId: req.user!.id } } },
    include: groupInclude,
    orderBy: { updatedAt: "desc" }
  });

  return res.json({ groups: groups.map((group) => serializeGroup(group)) });
}));

groupsRouter.get("/:groupId", asyncRoute(async (req, res) => {
  const group = await getGroupForUser(req.params.groupId, req.user!.id);

  if (!group) {
    return res.status(404).json({ message: "Group was not found." });
  }

  return res.json({ group });
}));

groupsRouter.patch("/:groupId", asyncRoute(async (req, res) => {
  const admin = await requireGroupAdmin(req.params.groupId, req.user!.id);

  if (!admin) {
    return res.status(403).json({ message: "Only group admins can update this group." });
  }

  const name = String(req.body.name ?? "").trim();
  const description = String(req.body.description ?? "").trim() || null;

  if (!name) {
    return res.status(400).json({ message: "Group name is required." });
  }

  const group = await prisma.chatGroup.update({
    where: { id: req.params.groupId },
    data: { name, description },
    include: groupInclude
  });

  await broadcastGroupUpsert(req.app.get("io"), group.id, "group:updated");

  return res.json({ group: serializeGroup(group) });
}));

groupsRouter.post("/:groupId/members", asyncRoute(async (req, res) => {
  const groupExists = await prisma.chatGroup.findUnique({ where: { id: req.params.groupId } });

  if (!groupExists) {
    return res.status(404).json({ message: "Group was not found." });
  }

  const admin = await requireGroupAdmin(req.params.groupId, req.user!.id);

  if (!admin) {
    return res.status(403).json({ message: "Only group admins can add members." });
  }

  const userIds = normalizeAddedMemberIds(req.body);

  if (userIds.length === 0) {
    return res.status(400).json({ message: "Select at least one user to add." });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true }
  });

  if (users.length !== userIds.length) {
    return res.status(404).json({ message: "One or more selected users were not found." });
  }

  const existingMembers = await prisma.groupMember.findMany({
    where: {
      groupId: req.params.groupId,
      userId: { in: userIds }
    },
    select: { userId: true }
  });

  if (existingMembers.length > 0) {
    return res.status(409).json({ message: "One or more selected users are already members." });
  }

  await prisma.groupMember.createMany({
    data: userIds.map((userId) => ({
      groupId: req.params.groupId,
      userId
    }))
  });

  for (const userId of userIds) {
    await broadcastGroupMemberChanged(req.app.get("io"), req.params.groupId, userId, "group:member-added");
  }

  const group = await getGroupForUser(req.params.groupId, req.user!.id);
  return res.status(201).json({ group });
}));

groupsRouter.delete("/:groupId/members/:userId", asyncRoute(async (req, res) => {
  const admin = await requireGroupAdmin(req.params.groupId, req.user!.id);

  if (!admin) {
    return res.status(403).json({ message: "Only group admins can remove members." });
  }

  if (req.params.userId === req.user!.id) {
    return res.status(400).json({ message: "Use leave group instead." });
  }

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId: req.params.groupId, userId: req.params.userId } }
  });

  await broadcastGroupMemberChanged(req.app.get("io"), req.params.groupId, req.params.userId, "group:member-removed");

  return res.json({ message: "Member removed." });
}));

groupsRouter.post("/:groupId/leave", asyncRoute(async (req, res) => {
  const membership = await requireGroupMember(req.params.groupId, req.user!.id);

  if (!membership) {
    return res.status(404).json({ message: "Group was not found." });
  }

  const remainingMembers = await prisma.groupMember.findMany({
    where: {
      groupId: req.params.groupId,
      userId: { not: req.user!.id }
    },
    orderBy: { joinedAt: "asc" }
  });

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId: req.params.groupId, userId: req.user!.id } }
  });

  if (remainingMembers.length === 0) {
    await prisma.chatGroup.update({
      where: { id: req.params.groupId },
      data: { archivedAt: new Date() }
    });
  } else if (membership.role === "ADMIN") {
    const nextAdmin = remainingMembers.find((member) => member.role === "ADMIN") ?? remainingMembers[0];
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId: req.params.groupId, userId: nextAdmin.userId } },
      data: { role: "ADMIN" }
    });
    await prisma.chatGroup.update({
      where: { id: req.params.groupId },
      data: { creatorId: nextAdmin.userId }
    });
  }

  await broadcastGroupMemberChanged(req.app.get("io"), req.params.groupId, req.user!.id, "group:member-left");

  return res.json({ message: "Left group." });
}));

groupsRouter.post("/:groupId/mute", asyncRoute(async (req, res) => {
  const membership = await requireGroupMember(req.params.groupId, req.user!.id);

  if (!membership) {
    return res.status(404).json({ message: "Group was not found." });
  }

  const updated = await prisma.groupMember.update({
    where: { groupId_userId: { groupId: req.params.groupId, userId: req.user!.id } },
    data: { mutedAt: new Date() }
  });

  req.app.get("io")?.to(`user:${req.user!.id}`).emit("group:muted", {
    groupId: req.params.groupId,
    mutedAt: updated.mutedAt?.toISOString()
  });

  const group = await getGroupForUser(req.params.groupId, req.user!.id);
  return res.json({ group });
}));

groupsRouter.delete("/:groupId/mute", asyncRoute(async (req, res) => {
  const membership = await requireGroupMember(req.params.groupId, req.user!.id);

  if (!membership) {
    return res.status(404).json({ message: "Group was not found." });
  }

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId: req.params.groupId, userId: req.user!.id } },
    data: { mutedAt: null }
  });

  req.app.get("io")?.to(`user:${req.user!.id}`).emit("group:unmuted", {
    groupId: req.params.groupId
  });

  const group = await getGroupForUser(req.params.groupId, req.user!.id);
  return res.json({ group });
}));

groupsRouter.get("/:groupId/messages", asyncRoute(async (req, res) => {
  const group = await prisma.chatGroup.findFirst({
    where: { id: req.params.groupId, archivedAt: null, members: { some: { userId: req.user!.id } } }
  });

  if (!group) {
    return res.status(404).json({ message: "Group was not found." });
  }

  const messages = await prisma.message.findMany({
    where: { groupId: group.id },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
    take: 100
  });

  const blockedUsers = await prisma.userBlock.findMany({
    where: { blockerId: req.user!.id },
    select: { blockedId: true }
  });
  const blockedIds = new Set(blockedUsers.map((block) => block.blockedId));

  return res.json({
    messages: messages
      .filter((message) => !blockedIds.has(message.senderId))
      .map((message) => serializeMessage(message))
  });
}));

groupsRouter.post("/:groupId/messages", asyncRoute(async (req, res) => {
  try {
    await parseMessageUpload(req);
  } catch (error) {
    if (error instanceof UploadError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    throw error;
  }

  const membership = await requireGroupMember(req.params.groupId, req.user!.id);

  if (!membership) {
    return res.status(404).json({ message: "Group was not found." });
  }

  const group = await prisma.chatGroup.findUniqueOrThrow({ where: { id: req.params.groupId } });
  const body = String(req.body.body ?? "").trim();
  const file = req.file;

  if (!body && !file) {
    return res.status(400).json({ message: "Message text or a file is required." });
  }

  const createdMessage = await prisma.message.create({
    data: {
      conversationId: group.conversationId,
      groupId: group.id,
      senderId: req.user!.id,
      body
    }
  });

  if (file) {
    await prisma.attachment.create({
      data: {
        messageId: createdMessage.id,
        conversationId: group.conversationId,
        groupId: group.id,
        senderId: req.user!.id,
        originalName: sanitizeFileName(file.originalname),
        storedName: file.filename,
        url: fileUrlFor(file.filename),
        mimeType: file.mimetype,
        size: file.size
      }
    });
  }

  await prisma.chatGroup.update({ where: { id: group.id }, data: { updatedAt: new Date() } });
  await prisma.conversation.update({ where: { id: group.conversationId }, data: { updatedAt: new Date() } });

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: createdMessage.id },
    include: messageInclude
  });

  await broadcastGroupMessage(req.app.get("io"), group.id, message);

  return res.status(201).json({ message: serializeMessage(message) });
}));
