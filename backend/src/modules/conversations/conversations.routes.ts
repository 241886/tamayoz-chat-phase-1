import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../utils/async-route.js";
import {
  assertParticipant,
  conversationInclude,
  directKeyFor,
  messageInclude,
  serializeMessage,
  serializeConversation
} from "./conversations.helpers.js";
import { broadcastMessage } from "../../socket/notify.js";
import { fileUrlFor, parseMessageUpload, sanitizeFileName, UploadError } from "../messages/upload.js";

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);

conversationsRouter.get("/", asyncRoute(async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: {
      participants: {
        some: { userId: req.user!.id }
      }
    },
    include: conversationInclude,
    orderBy: { updatedAt: "desc" }
  });

  const unreadCounts = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      readAt: null,
      senderId: { not: req.user!.id },
      conversation: {
        participants: {
          some: { userId: req.user!.id }
        }
      }
    },
    _count: true
  });

  const unreadByConversation = new Map(
    unreadCounts.map((row) => [row.conversationId, row._count])
  );

  return res.json({
    conversations: conversations.map((conversation) => ({
      ...serializeConversation(conversation),
      unreadCount: unreadByConversation.get(conversation.id) ?? 0
    }))
  });
}));

conversationsRouter.post("/", asyncRoute(async (req, res) => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    return res.status(400).json({ message: "Target userId is required." });
  }

  if (userId === req.user!.id) {
    return res.status(400).json({ message: "You cannot start a chat with yourself." });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return res.status(404).json({ message: "Target user was not found." });
  }

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: req.user!.id, blockedId: userId },
        { blockerId: userId, blockedId: req.user!.id }
      ]
    }
  });

  if (block) {
    return res.status(403).json({ message: "This private chat is blocked." });
  }

  const directKey = directKeyFor(req.user!.id, userId);
  const conversation = await prisma.conversation.upsert({
    where: { directKey },
    create: {
      directKey,
      participants: {
        create: [{ userId: req.user!.id }, { userId }]
      }
    },
    update: {},
    include: conversationInclude
  });

  return res.status(201).json({
    conversation: serializeConversation(conversation)
  });
}));

conversationsRouter.get("/:conversationId/messages", asyncRoute(async (req, res) => {
  const { conversationId } = req.params;

  const participant = await assertParticipant(conversationId, req.user!.id);

  if (!participant) {
    return res.status(404).json({ message: "Conversation was not found." });
  }

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId }
  });
  const otherParticipant = participants.find((item) => item.userId !== req.user!.id);

  if (otherParticipant) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: req.user!.id, blockedId: otherParticipant.userId },
          { blockerId: otherParticipant.userId, blockedId: req.user!.id }
        ]
      }
    });

    if (block) {
      return res.status(403).json({ message: "This private chat is blocked." });
    }
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
    take: 100
  });

  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: req.user!.id },
      readAt: null
    },
    data: { readAt: new Date() }
  });

  return res.json({ messages: messages.map((message) => serializeMessage(message)) });
}));

conversationsRouter.post("/:conversationId/messages", asyncRoute(async (req, res) => {
  try {
    await parseMessageUpload(req);
  } catch (error) {
    if (error instanceof UploadError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    throw error;
  }

  const { conversationId } = req.params;
  const participant = await assertParticipant(conversationId, req.user!.id);

  if (!participant) {
    return res.status(404).json({ message: "Conversation was not found." });
  }

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId }
  });
  const otherParticipant = participants.find((item) => item.userId !== req.user!.id);

  if (otherParticipant) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: req.user!.id, blockedId: otherParticipant.userId },
          { blockerId: otherParticipant.userId, blockedId: req.user!.id }
        ]
      }
    });

    if (block) {
      return res.status(403).json({ message: "This private chat is blocked." });
    }
  }

  const body = String(req.body.body ?? "").trim();
  const file = req.file;

  if (!body && !file) {
    return res.status(400).json({ message: "Message text or a file is required." });
  }

  const createdMessage = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user!.id,
      body
    }
  });

  if (file) {
    await prisma.attachment.create({
      data: {
        messageId: createdMessage.id,
        conversationId,
        senderId: req.user!.id,
        originalName: sanitizeFileName(file.originalname),
        storedName: file.filename,
        url: fileUrlFor(file.filename),
        mimeType: file.mimetype,
        size: file.size
      }
    });
  }

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: createdMessage.id },
    include: messageInclude
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });

  await broadcastMessage(req.app.get("io"), conversationId, req.user!.id, message);

  return res.status(201).json({ message: serializeMessage(message) });
}));
