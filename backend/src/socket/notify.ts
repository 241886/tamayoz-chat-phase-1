import type { Server as SocketServer } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { getConversationForUser, serializeMessage } from "../modules/conversations/conversations.helpers.js";
import { broadcastGroupMessageDeleted, broadcastGroupMessageUpdated } from "./group-notify.js";

export async function broadcastMessage(
  io: SocketServer | undefined,
  conversationId: string,
  senderId: string,
  message: unknown
) {
  if (!io) {
    return;
  }

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId }
  });

  for (const participant of participants) {
    const conversation = await getConversationForUser(
      conversationId,
      participant.userId,
      participant.userId === senderId ? 0 : 1
    );

    if (conversation) {
      io.to(`user:${participant.userId}`).emit("conversation:upsert", { conversation });
    }

    io.to(`user:${participant.userId}`).emit("message:new", { message: serializeMessage(message as Record<string, unknown>) });
  }
}

async function broadcastMessageChange(
  io: SocketServer | undefined,
  conversationId: string,
  message: unknown,
  eventName: "message:updated" | "message:deleted"
) {
  if (!io) {
    return;
  }

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId }
  });

  for (const participant of participants) {
    const conversation = await getConversationForUser(conversationId, participant.userId, 0);

    if (conversation) {
      io.to(`user:${participant.userId}`).emit("conversation:upsert", { conversation });
    }

    io.to(`user:${participant.userId}`).emit(eventName, {
      message: serializeMessage(message as Record<string, unknown>)
    });
  }
}

export function broadcastMessageUpdated(io: SocketServer | undefined, conversationId: string, message: unknown) {
  const payload = message as { groupId?: string | null };
  if (payload.groupId) {
    broadcastGroupMessageUpdated(io, payload.groupId, message);
  }

  return broadcastMessageChange(io, conversationId, message, "message:updated");
}

export function broadcastMessageDeleted(io: SocketServer | undefined, conversationId: string, message: unknown) {
  const payload = message as { groupId?: string | null };
  if (payload.groupId) {
    broadcastGroupMessageDeleted(io, payload.groupId, message);
  }

  return broadcastMessageChange(io, conversationId, message, "message:deleted");
}
