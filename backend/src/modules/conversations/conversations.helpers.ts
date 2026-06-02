import { prisma } from "../../lib/prisma.js";

export function directKeyFor(userA: string, userB: string) {
  return [userA, userB].sort().join(":");
}

export const conversationInclude = {
  participants: {
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
    }
  },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: {
      attachments: true,
      sender: {
        select: {
          id: true,
          name: true,
          avatarUrl: true
        }
      }
    }
  }
};

export const messageInclude = {
  attachments: true,
  sender: {
    select: {
      id: true,
      name: true,
      avatarUrl: true
    }
  }
};

export const lastMessageInclude = {
  orderBy: { createdAt: "desc" as const },
  take: 1,
  include: messageInclude
};

export const conversationWithMessagesInclude = {
  participants: conversationInclude.participants,
  messages: lastMessageInclude
};

type ConversationWithLastMessage = {
  messages: unknown[];
  [key: string]: unknown;
};

export function serializeMessage(message: Record<string, unknown>) {
  if (message.isDeleted) {
    return {
      ...message,
      body: "This message was deleted",
      attachments: []
    };
  }

  return {
    ...message,
    attachments: message.attachments ?? []
  };
}

export function serializeConversation(conversation: ConversationWithLastMessage, unreadCount = 0) {
  const { messages, ...rest } = conversation;

  return {
    ...rest,
    lastMessage: messages[0] ? serializeMessage(messages[0] as Record<string, unknown>) : null,
    unreadCount
  };
}

export async function getConversationForUser(conversationId: string, userId: string, unreadCount = 0) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: {
        some: { userId }
      }
    },
    include: conversationInclude
  });

  return conversation ? serializeConversation(conversation, unreadCount) : null;
}

export async function assertParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId
      }
    }
  });
}
