import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncRoute } from "../../utils/async-route.js";
import { messageInclude, serializeMessage } from "../conversations/conversations.helpers.js";
import { broadcastMessageDeleted, broadcastMessageUpdated } from "../../socket/notify.js";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

messagesRouter.patch("/:messageId", asyncRoute(async (req, res) => {
  const { messageId } = req.params;
  const body = String(req.body.body ?? "").trim();

  if (!body) {
    return res.status(400).json({ message: "Message text is required." });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude
  });

  if (!message) {
    return res.status(404).json({ message: "Message was not found." });
  }

  if (message.senderId !== req.user!.id) {
    return res.status(403).json({ message: "You can only edit your own messages." });
  }

  if (message.isDeleted) {
    return res.status(400).json({ message: "Deleted messages cannot be edited." });
  }

  if (!message.body.trim()) {
    return res.status(400).json({ message: "File-only messages cannot be edited." });
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      body,
      isEdited: true,
      editedAt: new Date()
    },
    include: messageInclude
  });

  await broadcastMessageUpdated(req.app.get("io"), updated.conversationId, updated);

  return res.json({ message: serializeMessage(updated) });
}));

messagesRouter.delete("/:messageId", asyncRoute(async (req, res) => {
  const { messageId } = req.params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude
  });

  if (!message) {
    return res.status(404).json({ message: "Message was not found." });
  }

  if (message.senderId !== req.user!.id) {
    return res.status(403).json({ message: "You can only delete your own messages." });
  }

  if (message.isDeleted) {
    return res.json({ message: serializeMessage(message) });
  }

  const deleted = await prisma.message.update({
    where: { id: message.id },
    data: {
      body: "This message was deleted",
      isDeleted: true,
      deletedAt: new Date()
    },
    include: messageInclude
  });

  await broadcastMessageDeleted(req.app.get("io"), deleted.conversationId, deleted);

  return res.json({ message: serializeMessage(deleted) });
}));

messagesRouter.post("/:messageId/read", asyncRoute(async (req, res) => {
  const { messageId } = req.params;

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      senderId: { not: req.user!.id },
      conversation: {
        participants: {
          some: { userId: req.user!.id }
        }
      }
    }
  });

  if (!message) {
    return res.status(404).json({ message: "Message was not found." });
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { readAt: new Date() }
  });

  return res.json({ message: updated });
}));
