export type UserStatus = "ONLINE" | "OFFLINE";

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  status: UserStatus;
  lastSeenAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Message = {
  id: string;
  conversationId: string;
  groupId?: string | null;
  senderId: string;
  body: string;
  isEdited: boolean;
  editedAt?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  sender: Pick<User, "id" | "name" | "avatarUrl">;
  attachments: Attachment[];
};

export type Attachment = {
  id: string;
  messageId: string;
  conversationId: string;
  groupId?: string | null;
  senderId: string;
  originalName: string;
  storedName: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type Conversation = {
  id: string;
  directKey: string;
  createdAt: string;
  updatedAt: string;
  participants: Array<{
    id: string;
    userId: string;
    conversationId: string;
    user: User;
  }>;
  lastMessage?: Message | null;
  unreadCount: number;
};

export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  role: "ADMIN" | "MEMBER";
  mutedAt?: string | null;
  joinedAt: string;
  user: User;
};

export type Group = {
  id: string;
  conversationId: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  members: GroupMember[];
  lastMessage?: Message | null;
  unreadCount: number;
};
