import type { Server as SocketServer } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { serializeMessage } from "../modules/conversations/conversations.helpers.js";
import { getGroupForUser, serializeGroup } from "../modules/groups/groups.helpers.js";

async function groupMemberUserIds(groupId: string) {
  const members = await prisma.groupMember.findMany({ where: { groupId } });
  return members.map((member) => member.userId);
}

export async function broadcastGroupUpsert(io: SocketServer | undefined, groupId: string, eventName = "group:updated") {
  if (!io) {
    return;
  }

  const userIds = await groupMemberUserIds(groupId);

  for (const userId of userIds) {
    const group = await getGroupForUser(groupId, userId);
    if (group) {
      io.to(`user:${userId}`).emit(eventName, { group });
    }
  }
}

export async function broadcastGroupCreated(io: SocketServer | undefined, group: unknown) {
  if (!io) {
    return;
  }

  const payload = serializeGroup(group as Record<string, unknown>) as Record<string, unknown>;
  const members = (payload.members as Array<{ userId: string }> | undefined) ?? [];
  const groupId = String(payload.id);

  for (const member of members) {
    io.in(`user:${member.userId}`).socketsJoin(`group:${groupId}`);
    io.to(`user:${member.userId}`).emit("group:created", { group: payload });
  }
}

export async function broadcastGroupMemberChanged(
  io: SocketServer | undefined,
  groupId: string,
  userId: string,
  eventName: "group:member-added" | "group:member-removed" | "group:member-left"
) {
  if (!io) {
    return;
  }

  const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
  if (!group) {
    return;
  }

  if (eventName === "group:member-added") {
    io.in(`user:${userId}`).socketsJoin(`group:${groupId}`);
  } else {
    io.in(`user:${userId}`).socketsLeave(`group:${groupId}`);
  }

  await broadcastGroupUpsert(io, groupId, "group:updated");

  const userGroup = await getGroupForUser(groupId, userId);
  if (eventName === "group:member-added" && userGroup) {
    io.to(`user:${userId}`).emit("group:created", { group: userGroup });
  }
  io.to(`user:${userId}`).emit(eventName, userGroup ? { groupId, userId, group: userGroup } : { groupId, userId });
}

export async function broadcastGroupMessage(io: SocketServer | undefined, groupId: string, message: unknown) {
  if (!io) {
    return;
  }

  const userIds = await groupMemberUserIds(groupId);

  for (const userId of userIds) {
    const group = await getGroupForUser(groupId, userId);
    if (group) {
      io.to(`user:${userId}`).emit("group:updated", { group });
    }
  }

  io.to(`group:${groupId}`).emit("group:message:new", {
    message: serializeMessage(message as Record<string, unknown>)
  });
}

export function broadcastGroupMessageUpdated(io: SocketServer | undefined, groupId: string, message: unknown) {
  io?.to(`group:${groupId}`).emit("group:message:updated", {
    message: serializeMessage(message as Record<string, unknown>)
  });
}

export function broadcastGroupMessageDeleted(io: SocketServer | undefined, groupId: string, message: unknown) {
  io?.to(`group:${groupId}`).emit("group:message:deleted", {
    message: serializeMessage(message as Record<string, unknown>)
  });
}
