import type { Server } from "http";
import { Server as SocketServer } from "socket.io";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { assertParticipant, messageInclude } from "../modules/conversations/conversations.helpers.js";
import { broadcastMessage } from "./notify.js";
import { verifyToken } from "../utils/auth.js";
import { getOrCreateGuestUser, normalizeGuestId, normalizeGuestName } from "../modules/guests/guest-session.js";

type ClientToServerEvents = {
  "conversation:join": (
    payload: { conversationId: string },
    ack?: (response: { ok: boolean; error?: string }) => void
  ) => void;
  "message:send": (
    payload: { conversationId: string; body: string },
    ack?: (response: { ok: boolean; message?: unknown; error?: string }) => void
  ) => void;
  "message:read": (payload: { conversationId: string; messageId?: string }) => void;
  "typing:start": (payload: { conversationId: string }) => void;
  "typing:stop": (payload: { conversationId: string }) => void;
  "group:typing": (payload: { groupId: string; isTyping: boolean }) => void;
  "group:read": (payload: { groupId: string }) => void;
};

type ServerToClientEvents = {
  "presence:update": (payload: { userId: string; status: "ONLINE" | "OFFLINE"; lastSeenAt?: string }) => void;
  "conversation:upsert": (payload: { conversation: unknown }) => void;
  "message:new": (payload: { message: unknown }) => void;
  "message:updated": (payload: { message: unknown }) => void;
  "message:deleted": (payload: { message: unknown }) => void;
  "message:read": (payload: { conversationId: string; readerId: string; readAt: string }) => void;
  "typing:update": (payload: { conversationId: string; userId: string; isTyping: boolean }) => void;
  "group:created": (payload: { group: unknown }) => void;
  "group:updated": (payload: { group: unknown }) => void;
  "group:member-added": (payload: { groupId: string; userId: string; group?: unknown }) => void;
  "group:member-removed": (payload: { groupId: string; userId: string; group?: unknown }) => void;
  "group:member-left": (payload: { groupId: string; userId: string; group?: unknown }) => void;
  "group:muted": (payload: { groupId: string; mutedAt?: string }) => void;
  "group:unmuted": (payload: { groupId: string }) => void;
  "user:block": (payload: { blockedId: string }) => void;
  "user:unblock": (payload: { blockedId: string }) => void;
  "group:message:new": (payload: { message: unknown }) => void;
  "group:message:updated": (payload: { message: unknown }) => void;
  "group:message:deleted": (payload: { message: unknown }) => void;
  "group:typing": (payload: { groupId: string; userId: string; isTyping: boolean }) => void;
  "group:read": (payload: { groupId: string; readerId: string; readAt: string }) => void;
};

const activeConnections = new Map<string, number>();

export function registerSocketServer(httpServer: Server) {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: env.clientUrls,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string | undefined;
      if (!token) {
        const guestId = normalizeGuestId(socket.handshake.auth.guestId);
        if (!guestId) {
          return next(new Error("Authentication token or guest session is required."));
        }

        const guestName = normalizeGuestName(socket.handshake.auth.guestName);
        const user = await getOrCreateGuestUser(guestId, guestName);
        socket.data.user = {
          id: user.id,
          name: user.name,
          email: user.email
        };
        return next();
      }

      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, name: true, email: true }
      });

      if (!user) {
        return next(new Error("User was not found."));
      }

      socket.data.user = user;
      return next();
    } catch {
      return next(new Error("Invalid or expired authentication token."));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user as { id: string; name: string; email: string };
    socket.join(`user:${user.id}`);

    const connectionCount = activeConnections.get(user.id) ?? 0;
    activeConnections.set(user.id, connectionCount + 1);

    if (connectionCount === 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "ONLINE", lastSeenAt: null }
      });

      socket.broadcast.emit("presence:update", { userId: user.id, status: "ONLINE" });
    }

    const privateRooms = await prisma.conversationParticipant.findMany({
      where: { userId: user.id },
      select: { conversationId: true }
    });
    privateRooms.forEach((participant) => socket.join(`conversation:${participant.conversationId}`));

    const groupRooms = await prisma.groupMember.findMany({
      where: { userId: user.id },
      select: { groupId: true }
    });
    groupRooms.forEach((member) => socket.join(`group:${member.groupId}`));

    socket.on("conversation:join", async ({ conversationId }, ack) => {
      const participant = await assertParticipant(conversationId, user.id);

      if (participant) {
        socket.join(`conversation:${conversationId}`);
        ack?.({ ok: true });
        return;
      }

      ack?.({ ok: false, error: "Conversation was not found." });
    });

    socket.on("message:send", async ({ conversationId, body }, ack) => {
      try {
        const cleanBody = body.trim();
        if (!cleanBody) {
          ack?.({ ok: false, error: "Message cannot be empty." });
          return;
        }

        const participant = await prisma.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId: user.id
            }
          }
        });

        if (!participant) {
          ack?.({ ok: false, error: "Conversation was not found." });
          return;
        }

        const participants = await prisma.conversationParticipant.findMany({
          where: { conversationId }
        });
        const otherParticipant = participants.find((item) => item.userId !== user.id);

        if (otherParticipant) {
          const block = await prisma.userBlock.findFirst({
            where: {
              OR: [
                { blockerId: user.id, blockedId: otherParticipant.userId },
                { blockerId: otherParticipant.userId, blockedId: user.id }
              ]
            }
          });

          if (block) {
            ack?.({ ok: false, error: "This private chat is blocked." });
            return;
          }
        }

        const message = await prisma.message.create({
          data: {
            conversationId,
            senderId: user.id,
            body: cleanBody
          },
          include: messageInclude
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() }
        });

        await broadcastMessage(io, conversationId, user.id, message);

        ack?.({ ok: true, message });
      } catch {
        ack?.({ ok: false, error: "Unable to send message." });
      }
    });

    socket.on("message:read", async ({ conversationId, messageId }) => {
      const participant = await assertParticipant(conversationId, user.id);

      if (!participant) {
        return;
      }

      const readAt = new Date();
      await prisma.message.updateMany({
        where: {
          ...(messageId ? { id: messageId } : { conversationId }),
          senderId: { not: user.id },
          readAt: null,
          conversation: {
            participants: {
              some: { userId: user.id }
            }
          }
        },
        data: { readAt }
      });

      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId }
      });

      io.to(participants.map((participant) => `user:${participant.userId}`)).emit("message:read", {
        conversationId,
        readerId: user.id,
        readAt: readAt.toISOString()
      });
    });

    socket.on("typing:start", async ({ conversationId }) => {
      const participant = await assertParticipant(conversationId, user.id);
      if (!participant) {
        return;
      }

      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId,
        userId: user.id,
        isTyping: true
      });
    });

    socket.on("typing:stop", async ({ conversationId }) => {
      const participant = await assertParticipant(conversationId, user.id);
      if (!participant) {
        return;
      }

      socket.to(`conversation:${conversationId}`).emit("typing:update", {
        conversationId,
        userId: user.id,
        isTyping: false
      });
    });

    socket.on("group:typing", async ({ groupId, isTyping }) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: user.id } }
      });

      if (!membership) {
        return;
      }

      socket.to(`group:${groupId}`).emit("group:typing", {
        groupId,
        userId: user.id,
        isTyping
      });
    });

    socket.on("group:read", async ({ groupId }) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: user.id } }
      });

      if (!membership) {
        return;
      }

      const readAt = new Date();
      socket.to(`group:${groupId}`).emit("group:read", {
        groupId,
        readerId: user.id,
        readAt: readAt.toISOString()
      });
    });

    socket.on("disconnect", async () => {
      const connectionCount = activeConnections.get(user.id) ?? 1;
      const nextCount = Math.max(connectionCount - 1, 0);

      if (nextCount > 0) {
        activeConnections.set(user.id, nextCount);
        return;
      }

      activeConnections.delete(user.id);

      const lastSeenAt = new Date();
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "OFFLINE", lastSeenAt }
      });

      socket.broadcast.emit("presence:update", {
        userId: user.id,
        status: "OFFLINE",
        lastSeenAt: lastSeenAt.toISOString()
      });
    });
  });

  return io;
}
