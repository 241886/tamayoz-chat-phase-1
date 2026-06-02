import { prisma } from "../../lib/prisma.js";
import { lastMessageInclude, serializeMessage } from "../conversations/conversations.helpers.js";

export const groupInclude = {
  creator: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      status: true,
      lastSeenAt: true
    }
  },
  members: {
    include: {
      user: {
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
    orderBy: [{ role: "asc" as const }, { joinedAt: "asc" as const }]
  },
  conversation: {
    include: {
      messages: lastMessageInclude
    }
  }
};

type GroupPayload = {
  conversation?: { messages?: unknown[] };
  [key: string]: unknown;
};

export function serializeGroup(group: GroupPayload, unreadCount = 0) {
  const last = group.conversation?.messages?.[0] as Record<string, unknown> | undefined;

  return {
    ...group,
    lastMessage: last ? serializeMessage(last) : null,
    unreadCount
  };
}

export async function getGroupForUser(groupId: string, userId: string) {
  const group = await prisma.chatGroup.findFirst({
    where: {
      id: groupId,
      archivedAt: null,
      members: {
        some: { userId }
      }
    },
    include: groupInclude
  });

  return group ? serializeGroup(group) : null;
}

export async function requireGroupMember(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId
      }
    }
  });
}

export async function requireGroupAdmin(groupId: string, userId: string) {
  const membership = await requireGroupMember(groupId, userId);
  return membership?.role === "ADMIN" ? membership : null;
}
