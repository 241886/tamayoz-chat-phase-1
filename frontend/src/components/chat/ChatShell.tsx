"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ConversationList } from "@/components/chat/ConversationList";
import { UserSearch } from "@/components/chat/UserSearch";
import { useAuth } from "@/context/AuthContext";
import { API_URL, absoluteFileUrl, api } from "@/lib/api";
import { createSocket } from "@/lib/socket";
import type { Conversation, Group, Message, User } from "@/types/chat";

export function ChatShell() {
  const router = useRouter();
  const { user, token, isReady, changeName } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [compose, setCompose] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupCandidates, setGroupCandidates] = useState<User[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [memberCandidates, setMemberCandidates] = useState<User[]>([]);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<Set<string>>(new Set());
  const [addMembersLoading, setAddMembersLoading] = useState(false);
  const [addMembersMessage, setAddMembersMessage] = useState("");
  const [addMembersError, setAddMembersError] = useState("");
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [groupActionMessage, setGroupActionMessage] = useState("");
  const [groupActionError, setGroupActionError] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    if (isReady && !token) {
      router.replace("/chat");
    }
  }, [isReady, router, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    api<{ conversations: Conversation[] }>("/api/conversations", { token }).then((response) => {
      setConversations(response.conversations);
    });
    api<{ groups: Group[] }>("/api/groups", { token }).then((response) => {
      setGroups(response.groups);
    });
    api<{ blocks: Array<{ blockedId: string }> }>("/api/users/blocks", { token }).then((response) => {
      setBlockedUserIds(new Set(response.blocks.map((block) => block.blockedId)));
    });
  }, [token]);

  const upsertConversationFromMessage = useCallback(
    (message: Message) => {
      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== message.conversationId) {
            return conversation;
          }

          return {
            ...conversation,
            updatedAt: message.createdAt,
            lastMessage: message,
            unreadCount: activeIdRef.current === conversation.id || message.senderId === user?.id ? 0 : conversation.unreadCount
          };
        })
      );
    },
    [user?.id]
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = createSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      if (activeIdRef.current) {
        socket.emit("conversation:join", { conversationId: activeIdRef.current });
      }
    });

    socket.on("conversation:upsert", ({ conversation }: { conversation: Conversation }) => {
      setConversations((current) => {
        const nextConversation = {
          ...conversation,
          unreadCount: activeIdRef.current === conversation.id ? 0 : conversation.unreadCount
        };
        const exists = current.some((item) => item.id === conversation.id);
        const next = exists
          ? current.map((item) => (item.id === conversation.id ? nextConversation : item))
          : [nextConversation, ...current];

        return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    });

    const upsertGroup = ({ group }: { group: Group }) => {
      setGroups((current) => {
        const nextGroup = { ...group, unreadCount: activeGroupIdRef.current === group.id ? 0 : group.unreadCount };
        const exists = current.some((item) => item.id === group.id);
        const next = exists ? current.map((item) => (item.id === group.id ? nextGroup : item)) : [nextGroup, ...current];
        return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    };

    socket.on("group:created", upsertGroup);
    socket.on("group:updated", upsertGroup);
    socket.on("group:muted", ({ groupId, mutedAt }: { groupId: string; mutedAt?: string }) => {
      setGroups((current) =>
        current.map((group) =>
          group.id === groupId
            ? {
                ...group,
                members: group.members.map((member) =>
                  member.userId === user?.id ? { ...member, mutedAt: mutedAt ?? new Date().toISOString() } : member
                )
              }
            : group
        )
      );
    });
    socket.on("group:unmuted", ({ groupId }: { groupId: string }) => {
      setGroups((current) =>
        current.map((group) =>
          group.id === groupId
            ? {
                ...group,
                members: group.members.map((member) =>
                  member.userId === user?.id ? { ...member, mutedAt: null } : member
                )
              }
            : group
        )
      );
    });
    socket.on("user:block", ({ blockedId }: { blockedId: string }) => {
      setBlockedUserIds((current) => new Set(current).add(blockedId));
    });
    socket.on("user:unblock", ({ blockedId }: { blockedId: string }) => {
      setBlockedUserIds((current) => {
        const next = new Set(current);
        next.delete(blockedId);
        return next;
      });
    });
    socket.on("group:member-added", ({ group }: { group?: Group }) => {
      if (group) {
        upsertGroup({ group });
      }
    });
    const removeGroupForUser = ({ groupId, userId }: { groupId: string; userId: string }) => {
      if (userId === user?.id) {
        setGroups((current) => current.filter((group) => group.id !== groupId));
        if (activeGroupIdRef.current === groupId) {
          setActiveGroupId(null);
          setMessages([]);
        }
      }
    };

    socket.on("group:member-removed", removeGroupForUser);
    socket.on("group:member-left", removeGroupForUser);

    socket.on("presence:update", (payload: { userId: string; status: "ONLINE" | "OFFLINE"; lastSeenAt?: string }) => {
      setConversations((current) =>
        current.map((conversation) => ({
          ...conversation,
          participants: conversation.participants.map((participant) =>
            participant.userId === payload.userId
              ? {
                  ...participant,
                  user: {
                    ...participant.user,
                    status: payload.status,
                    lastSeenAt: payload.lastSeenAt ?? participant.user.lastSeenAt
                  }
                }
              : participant
          )
        }))
      );
    });

    socket.on("message:new", ({ message }: { message: Message }) => {
      upsertConversationFromMessage(message);

      if (activeIdRef.current === message.conversationId) {
        setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
        socket.emit("message:read", { conversationId: message.conversationId });
      }
    });

    socket.on("group:message:new", ({ message }: { message: Message }) => {
      if (blockedUserIds.has(message.senderId)) {
        return;
      }
      if (activeGroupIdRef.current === message.groupId) {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) {
            return current;
          }

          const withoutOptimisticCopy = current.filter(
            (item) =>
              !(
                item.id.startsWith("pending-") &&
                item.senderId === message.senderId &&
                item.body === message.body &&
                item.groupId === message.groupId
              )
          );
          return [...withoutOptimisticCopy, message];
        });
      }
    });

    const applyMessageChange = ({ message }: { message: Message }) => {
      setMessages((current) => current.map((item) => (item.id === message.id ? message : item)));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === message.conversationId && conversation.lastMessage?.id === message.id
            ? { ...conversation, lastMessage: message }
            : conversation
        )
      );
      setEditingMessage((current) => (current?.id === message.id ? null : current));
    };

    socket.on("message:updated", applyMessageChange);
    socket.on("message:deleted", applyMessageChange);
    socket.on("group:message:updated", applyMessageChange);
    socket.on("group:message:deleted", applyMessageChange);

    socket.on("message:read", (payload: { conversationId: string; readAt: string }) => {
      setMessages((current) =>
        current.map((message) =>
          message.conversationId === payload.conversationId && !message.readAt
            ? { ...message, readAt: payload.readAt }
            : message
        )
      );
    });

    socket.on("typing:update", (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (payload.conversationId !== activeIdRef.current) {
        return;
      }

      setTypingUsers((current) => {
        const next = new Set(current);
        if (payload.isTyping) {
          next.add(payload.userId);
        } else {
          next.delete(payload.userId);
        }
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [blockedUserIds, token, upsertConversationFromMessage, user?.id]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [activeId, conversations]
  );
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) ?? null, [activeGroupId, groups]);
  const isActiveGroupAdmin = useMemo(
    () => activeGroup?.members.some((member) => member.userId === user?.id && member.role === "ADMIN") ?? false,
    [activeGroup, user?.id]
  );
  const activeGroupMembership = useMemo(
    () => activeGroup?.members.find((member) => member.userId === user?.id) ?? null,
    [activeGroup, user?.id]
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => !blockedUserIds.has(message.senderId)),
    [blockedUserIds, messages]
  );
  const sharedAttachments = useMemo(
    () => visibleMessages.flatMap((message) => message.attachments ?? []).slice(-6).reverse(),
    [visibleMessages]
  );

  const typingText = useMemo(() => {
    if (!activeConversation || typingUsers.size === 0) {
      return "";
    }

    const names = activeConversation.participants
      .filter((participant) => typingUsers.has(participant.userId))
      .map((participant) => participant.user.name);

    return names.length ? `${names.join(", ")} typing...` : "";
  }, [activeConversation, typingUsers]);

  const selectConversation = useCallback(
    async (conversation: Conversation) => {
      if (!token) {
        return;
      }

      setActiveId(conversation.id);
      setActiveGroupId(null);
      setTypingUsers(new Set());
      socketRef.current?.emit("conversation:join", { conversationId: conversation.id });

      const response = await api<{ messages: Message[] }>(`/api/conversations/${conversation.id}/messages`, { token });
      setMessages(response.messages);
      setConversations((current) =>
        current.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item))
      );
      socketRef.current?.emit("message:read", { conversationId: conversation.id });
    },
    [token]
  );

  const selectGroup = useCallback(
    async (group: Group) => {
      if (!token) {
        return;
      }

      setActiveGroupId(group.id);
      setActiveId(null);
      setTypingUsers(new Set());

      const response = await api<{ messages: Message[] }>(`/api/groups/${group.id}/messages`, { token });
      setMessages(response.messages);
      setGroups((current) => current.map((item) => (item.id === group.id ? { ...item, unreadCount: 0 } : item)));
      socketRef.current?.emit("group:read", { groupId: group.id });
    },
    [token]
  );

  function handleFileSelect(file: File | null) {
    setFileError("");
    setUploadProgress(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = new Set([
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "pdf",
      "doc",
      "docx",
      "txt",
      "xls",
      "xlsx",
      "csv",
      "ppt",
      "pptx",
      "zip",
      "rar",
      "mp3",
      "wav",
      "m4a",
      "ogg",
      "mp4",
      "mov",
      "webm"
    ]);
    const blockedExtensions = new Set(["exe", "bat", "cmd", "ps1", "sh", "msi", "com", "scr"]);

    if (!extension || blockedExtensions.has(extension) || !allowedExtensions.has(extension)) {
      setFileError("This file type is not supported.");
      setSelectedFile(null);
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setFileError("File size must be 25MB or less.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setUploadProgress(null);
    setFileError("");
  }

  function startEditMessage(message: Message) {
    setActionError("");
    setFileError("");
    setSelectedFile(null);
    setUploadProgress(null);
    setEditingMessage(message);
    setCompose(message.body);
  }

  function cancelEditMessage() {
    setEditingMessage(null);
    setCompose("");
    setActionError("");
  }

  async function editMessage(message: Message, body: string) {
    if (!token) {
      return;
    }

    setActionLoadingId(message.id);
    setActionError("");

    try {
      await api<{ message: Message }>(`/api/messages/${message.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ body })
      });
      setEditingMessage(null);
      setCompose("");
    } catch (error) {
      setCompose(body);
      setActionError(error instanceof Error ? error.message : "Unable to edit message.");
    } finally {
      setActionLoadingId(null);
      setSending(false);
    }
  }

  async function deleteMessage(message: Message) {
    if (!token || !window.confirm("Delete this message?")) {
      return;
    }

    setActionLoadingId(message.id);
    setActionError("");

    try {
      await api<{ message: Message }>(`/api/messages/${message.id}`, {
        method: "DELETE",
        token
      });
      setEditingMessage((current) => (current?.id === message.id ? null : current));
      if (editingMessage?.id === message.id) {
        setCompose("");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete message.");
    } finally {
      setActionLoadingId(null);
    }
  }

  function uploadMessage(target: { type: "conversation"; id: string } | { type: "group"; id: string }, body: string, file: File) {
    if (!token) {
      return Promise.reject(new Error("You must be logged in."));
    }

    const formData = new FormData();
    formData.append("body", body);
    formData.append("file", file);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const path =
        target.type === "group"
          ? `/api/groups/${target.id}/messages`
          : `/api/conversations/${target.id}/messages`;
      xhr.open("POST", `${API_URL}${path}`);
      if (token.startsWith("guest:")) {
        xhr.setRequestHeader("x-guest-id", token.slice("guest:".length));
        xhr.setRequestHeader("x-guest-name", window.localStorage.getItem("nexus_guest_name") ?? "");
      } else {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        const response = JSON.parse(xhr.responseText || "{}") as { message?: string };
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }

        reject(new Error(response.message ?? "Upload failed."));
      };

      xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
      xhr.send(formData);
    });
  }

  async function startConversation(target: User) {
    if (!token) {
      return;
    }

    const response = await api<{ conversation: Conversation }>("/api/conversations", {
      method: "POST",
      token,
      body: JSON.stringify({ userId: target.id })
    });

    setConversations((current) => {
      const exists = current.some((conversation) => conversation.id === response.conversation.id);
      return exists
        ? current.map((conversation) =>
            conversation.id === response.conversation.id ? response.conversation : conversation
          )
        : [response.conversation, ...current];
    });
    setSearchOpen(false);
    await selectConversation(response.conversation);
  }

  async function searchGroupMembers() {
    if (!token || !groupSearch.trim()) {
      setGroupCandidates([]);
      return;
    }

    const response = await api<{ users: User[] }>(`/api/users?q=${encodeURIComponent(groupSearch)}`, { token });
    setGroupCandidates(response.users);
  }

  async function createGroup() {
    if (!token || !groupName.trim()) {
      return;
    }

    const response = await api<{ group: Group }>("/api/groups", {
      method: "POST",
      token,
      body: JSON.stringify({
        name: groupName,
        description: groupDescription,
        memberIds: Array.from(selectedMemberIds)
      })
    });

    setGroups((current) => [response.group, ...current.filter((group) => group.id !== response.group.id)]);
    setGroupModalOpen(false);
    setGroupName("");
    setGroupDescription("");
    setGroupSearch("");
    setGroupCandidates([]);
    setSelectedMemberIds(new Set());
    await selectGroup(response.group);
  }

  function updateGroupInState(group: Group) {
    setGroups((current) => current.map((item) => (item.id === group.id ? group : item)));
  }

  async function renameActiveGroup() {
    if (!activeGroup || !token) return;

    const name = window.prompt("Rename group", activeGroup.name)?.trim();
    if (!name) return;

    const response = await api<{ group: Group }>(`/api/groups/${activeGroup.id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ name, description: activeGroup.description ?? "" })
    });
    updateGroupInState(response.group);
  }

  async function searchMembersForActiveGroup() {
    if (!token || !memberSearch.trim()) {
      setMemberCandidates([]);
      return;
    }

    setAddMembersError("");
    setAddMembersMessage("");
    const response = await api<{ users: User[] }>(`/api/users?q=${encodeURIComponent(memberSearch)}`, { token });
    const existingIds = new Set(activeGroup?.members.map((member) => member.userId) ?? []);
    setMemberCandidates(response.users.filter((candidate) => !existingIds.has(candidate.id)));
  }

  function openAddMembersModal() {
    if (!activeGroup || !token) return;

    setAddMembersOpen(true);
    setMemberSearch("");
    setMemberCandidates([]);
    setSelectedAddMemberIds(new Set());
    setAddMembersError("");
    setAddMembersMessage("");
  }

  function closeAddMembersModal() {
    setAddMembersOpen(false);
    setMemberSearch("");
    setMemberCandidates([]);
    setSelectedAddMemberIds(new Set());
    setAddMembersError("");
    setAddMembersMessage("");
  }

  async function addMembersToActiveGroup() {
    if (!activeGroup || !token || selectedAddMemberIds.size === 0) return;

    setAddMembersLoading(true);
    setAddMembersError("");
    setAddMembersMessage("");

    try {
      const response = await api<{ group: Group }>(`/api/groups/${activeGroup.id}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ userIds: Array.from(selectedAddMemberIds) })
      });
      if (response.group) updateGroupInState(response.group);
      setAddMembersMessage("Members added.");
      setTimeout(() => closeAddMembersModal(), 500);
    } catch (error) {
      setAddMembersError(error instanceof Error ? error.message : "Unable to add members.");
    } finally {
      setAddMembersLoading(false);
    }
  }

  async function removeMemberFromActiveGroup(userId: string) {
    if (!activeGroup || !token || !window.confirm("Remove this member from the group?")) return;

    await api<{ message: string }>(`/api/groups/${activeGroup.id}/members/${userId}`, {
      method: "DELETE",
      token
    });
    setGroups((current) =>
      current.map((group) =>
        group.id === activeGroup.id ? { ...group, members: group.members.filter((member) => member.userId !== userId) } : group
      )
    );
  }

  async function leaveActiveGroup() {
    if (!activeGroup || !token || !window.confirm("Leave this group?")) return;

    await api<{ message: string }>(`/api/groups/${activeGroup.id}/leave`, {
      method: "POST",
      token
    });
    setGroups((current) => current.filter((group) => group.id !== activeGroup.id));
    setActiveGroupId(null);
    setMessages([]);
    setGroupInfoOpen(false);
  }

  async function toggleMuteActiveGroup() {
    if (!activeGroup || !token) return;

    setGroupActionError("");
    setGroupActionMessage("");

    try {
      const isMuted = Boolean(activeGroupMembership?.mutedAt);
      const response = await api<{ group: Group }>(`/api/groups/${activeGroup.id}/mute`, {
        method: isMuted ? "DELETE" : "POST",
        token
      });
      if (response.group) updateGroupInState(response.group);
      setGroupActionMessage(isMuted ? "Group unmuted." : "Group muted.");
    } catch (error) {
      setGroupActionError(error instanceof Error ? error.message : "Unable to update mute setting.");
    }
  }

  async function toggleBlockMember(userId: string) {
    if (!token || userId === user?.id) return;

    const isBlocked = blockedUserIds.has(userId);
    const label = isBlocked ? "Unblock this member?" : "Block this member?";
    if (!window.confirm(label)) return;

    setGroupActionError("");
    setGroupActionMessage("");

    try {
      await api<{ message?: string }>(`/api/users/${userId}/block`, {
        method: isBlocked ? "DELETE" : "POST",
        token
      });

      setBlockedUserIds((current) => {
        const next = new Set(current);
        if (isBlocked) next.delete(userId);
        else next.add(userId);
        return next;
      });
      setGroupActionMessage(isBlocked ? "Member unblocked." : "Member blocked.");
    } catch (error) {
      setGroupActionError(error instanceof Error ? error.message : "Unable to update block setting.");
    }
  }

  function handleComposeChange(value: string) {
    setCompose(value);

    if (!activeId) {
      if (activeGroupId) {
        socketRef.current?.emit("group:typing", { groupId: activeGroupId, isTyping: true });
      }
      return;
    }

    socketRef.current?.emit("typing:start", { conversationId: activeId });

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit("typing:stop", { conversationId: activeId });
      if (activeGroupId) {
        socketRef.current?.emit("group:typing", { groupId: activeGroupId, isTyping: false });
      }
    }, 900);
  }

  async function sendMessage() {
    if (!user) {
      return;
    }

    if (editingMessage) {
      if (!compose.trim()) {
        return;
      }

      setSending(true);
      await editMessage(editingMessage, compose);
      return;
    }

    if (!activeId && !activeGroupId) {
      return;
    }

    if (!compose.trim() && !selectedFile) {
      return;
    }

    setSending(true);
    const body = compose;
    setCompose("");

    if (selectedFile) {
      const file = selectedFile;
      setSelectedFile(null);
      setFileError("");

      try {
        await uploadMessage(activeGroupId ? { type: "group", id: activeGroupId } : { type: "conversation", id: activeId! }, body, file);
      } catch (error) {
        setCompose(body);
        setSelectedFile(file);
        setFileError(error instanceof Error ? error.message : "Upload failed.");
      } finally {
        setUploadProgress(null);
        setSending(false);
      }

      if (activeId) socketRef.current?.emit("typing:stop", { conversationId: activeId });
      if (activeGroupId) socketRef.current?.emit("group:typing", { groupId: activeGroupId, isTyping: false });
      return;
    }

    if (activeGroupId) {
      const optimistic: Message = {
        id: `pending-${Date.now()}`,
        conversationId: activeGroup?.conversationId ?? activeGroupId,
        groupId: activeGroupId,
        senderId: user.id,
        body,
        isEdited: false,
        editedAt: null,
        isDeleted: false,
        deletedAt: null,
        readAt: null,
        createdAt: new Date().toISOString(),
        sender: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
        attachments: []
      };
      setMessages((current) => [...current, optimistic]);
      try {
        await api<{ message: Message }>(`/api/groups/${activeGroupId}/messages`, {
          method: "POST",
          token,
          body: JSON.stringify({ body })
        });
      } catch (error) {
        setMessages((current) => current.filter((message) => message.id !== optimistic.id));
        setCompose(body);
        setFileError(error instanceof Error ? error.message : "Unable to send group message.");
      } finally {
        setSending(false);
      }
      socketRef.current?.emit("group:typing", { groupId: activeGroupId, isTyping: false });
      return;
    }

    socketRef.current?.emit("message:send", { conversationId: activeId, body }, (response: { ok: boolean; error?: string }) => {
      setSending(false);
      if (!response.ok) {
        setCompose(body);
        setFileError(response.error ?? "Unable to send message.");
      }
    });
    socketRef.current?.emit("typing:stop", { conversationId: activeId });
  }

  async function handleChangeName() {
    const name = window.prompt("Change display name", user?.name ?? "")?.trim();
    if (!name) return;

    await changeName(name);
  }

  if (!isReady || !user || !token) {
    return (
      <main className="app-cinematic flex min-h-screen items-center justify-center overflow-hidden text-white">
        <div className="glass-panel grid h-20 w-20 place-items-center rounded-[2rem] shadow-nexus">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-purple border-t-transparent" />
        </div>
      </main>
    );
  }

  return (
    <main className="app-cinematic h-screen overflow-hidden bg-[#0d0d12] text-white">
      <div className="mx-auto grid h-full max-w-[1500px] grid-cols-1 overflow-hidden border-x border-white/[0.06] bg-[#0d0d12]/92 shadow-nexus md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr]">
        <div className={clsx("relative min-h-0", activeId || activeGroupId ? "hidden md:block" : "block")}>
          <ConversationList
            currentUser={user}
            conversations={conversations}
            groups={groups}
            activeConversationId={activeId}
            activeGroupId={activeGroupId}
            onSelect={selectConversation}
            onSelectGroup={selectGroup}
            onSearchFocus={() => setSearchOpen(true)}
            onCreateGroup={() => setGroupModalOpen(true)}
            onChangeName={handleChangeName}
          />
          <UserSearch
            token={token}
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onStartConversation={startConversation}
          />
        </div>
        <div className={clsx("min-h-0", activeId || activeGroupId ? "block" : "hidden md:block")}>
          <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[1fr_220px]">
            <ChatWindow
              currentUser={user}
              conversation={activeConversation}
              group={activeGroup}
              messages={visibleMessages}
              compose={compose}
              typingText={typingText}
              sending={sending}
              selectedFile={selectedFile}
              uploadProgress={uploadProgress}
              fileError={fileError}
              editingMessage={editingMessage}
              actionError={actionError}
              actionLoadingId={actionLoadingId}
              canManageGroup={isActiveGroupAdmin}
              onBack={() => {
                setActiveId(null);
                setActiveGroupId(null);
              }}
              onAddMembers={openAddMembersModal}
              onOpenGroupInfo={() => setGroupInfoOpen(true)}
              onComposeChange={handleComposeChange}
              onFileSelect={handleFileSelect}
              onFileError={setFileError}
              onClearFile={clearSelectedFile}
              onCancelEdit={cancelEditMessage}
              onStartEdit={startEditMessage}
              onDeleteMessage={deleteMessage}
              onSend={sendMessage}
            />
            {activeGroup ? (
              <aside className="hidden min-h-0 overflow-y-auto border-l border-white/[0.06] bg-[#12101a]/88 p-4 text-white backdrop-blur-xl xl:block">
                <div className="mb-4">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-brand-purple font-display text-lg font-bold text-white shadow-[0_0_28px_rgba(200,122,255,0.28)]">
                    {activeGroup.name.slice(0, 2).toUpperCase()}
                  </div>
                  <h2 className="font-display mt-3 truncate text-base font-bold">{activeGroup.name}</h2>
                  <p className="text-xs text-white/42">{activeGroup.members.length} members</p>
                </div>
                <div className="mb-4 flex gap-2">
                  <button onClick={toggleMuteActiveGroup} className="h-9 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.05] text-xs font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white">
                    {activeGroupMembership?.mutedAt ? "Unmute" : "Mute"}
                  </button>
                  {isActiveGroupAdmin ? (
                    <button onClick={renameActiveGroup} className="h-9 flex-1 rounded-xl border border-brand-purple/25 bg-brand-purple/10 text-xs font-semibold text-brand-purple transition hover:bg-brand-purple/15">
                      Rename
                    </button>
                  ) : null}
                  <button onClick={leaveActiveGroup} className="h-9 flex-1 rounded-xl border border-rose-400/20 bg-rose-500/10 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/15">
                    Leave
                  </button>
                </div>
                {isActiveGroupAdmin ? (
                  <button onClick={openAddMembersModal} className="accent-gradient mb-4 h-10 w-full rounded-xl text-sm font-bold text-white shadow-[0_0_24px_rgba(200,122,255,0.25)]">
                    Add Members
                  </button>
                ) : null}
                <div className="mb-5">
                  <p className="font-display mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Members</p>
                  <div className="space-y-2">
                  {activeGroup.members.map((member) => (
                    <div key={member.id} className="glass-panel flex items-center gap-2 rounded-xl p-2 text-sm">
                      <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-purple to-brand-pink text-xs font-bold text-white">
                        {member.user.name.slice(0, 2).toUpperCase()}
                        {member.user.status === "ONLINE" ? (
                          <span className="online-glow absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#12101a]" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{member.user.name}</p>
                        <p className="text-[11px] text-white/42">{member.role === "ADMIN" ? "Admin" : member.user.status.toLowerCase()}</p>
                      </div>
                      {member.userId !== user.id ? (
                        <button onClick={() => toggleBlockMember(member.userId)} className="rounded-lg px-2 py-1 text-xs font-semibold text-white/55 hover:bg-white/[0.08] hover:text-white">
                          {blockedUserIds.has(member.userId) ? "Unblock" : "Block"}
                        </button>
                      ) : null}
                      {isActiveGroupAdmin && member.userId !== user.id ? (
                        <button onClick={() => removeMemberFromActiveGroup(member.userId)} className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                  </div>
                </div>
                <div>
                  <p className="font-display mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Shared Media</p>
                  <div className="grid grid-cols-3 gap-2">
                    {sharedAttachments.length === 0 ? (
                      <p className="col-span-3 text-xs leading-5 text-white/35">No shared files yet</p>
                    ) : (
                      sharedAttachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={absoluteFileUrl(attachment.url)}
                          target="_blank"
                          rel="noreferrer"
                          title={attachment.originalName}
                          className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06] text-[10px] font-semibold text-white/60 transition hover:bg-white/[0.1]"
                        >
                          {attachment.mimeType.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={absoluteFileUrl(attachment.url)} alt={attachment.originalName} className="h-full w-full object-cover" />
                          ) : (
                            <span className="px-1 text-center">FILE</span>
                          )}
                        </a>
                      ))
                    )}
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
      {groupModalOpen ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-[#0d0d12]/78 p-4 backdrop-blur-xl">
          <div className="glass-panel w-full max-w-md rounded-3xl p-5 text-white shadow-nexus">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Create Group</h2>
              <button onClick={() => setGroupModalOpen(false)} className="grid h-8 w-8 place-items-center rounded-xl text-white/60 hover:bg-white/[0.08] hover:text-white">
                x
              </button>
            </div>
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Group name"
              className="glass-input mb-3 h-11 w-full rounded-xl px-3 placeholder:text-white/35"
            />
            <input
              value={groupDescription}
              onChange={(event) => setGroupDescription(event.target.value)}
              placeholder="Description optional"
              className="glass-input mb-3 h-11 w-full rounded-xl px-3 placeholder:text-white/35"
            />
            <div className="mb-3 flex gap-2">
              <input
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                placeholder="Search users"
                className="glass-input h-11 min-w-0 flex-1 rounded-xl px-3 placeholder:text-white/35"
              />
              <button onClick={searchGroupMembers} className="rounded-xl border border-brand-purple/25 bg-brand-purple/10 px-3 text-sm font-bold text-brand-purple transition hover:bg-brand-purple/15">
                Search
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-white/[0.06]">
              {groupCandidates.map((candidate) => (
                <label key={candidate.id} className="flex cursor-pointer items-center gap-3 border-b border-white/[0.06] p-3 text-sm hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.has(candidate.id)}
                    onChange={(event) => {
                      setSelectedMemberIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(candidate.id);
                        else next.delete(candidate.id);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{candidate.name} - {candidate.email}</span>
                </label>
              ))}
            </div>
            <button onClick={createGroup} className="accent-gradient mt-4 h-11 w-full rounded-xl font-bold text-white shadow-[0_0_28px_rgba(200,122,255,0.26)] disabled:opacity-50" disabled={!groupName.trim() || selectedMemberIds.size === 0}>
              Create Group
            </button>
          </div>
        </div>
      ) : null}
      {addMembersOpen && activeGroup ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-[#0d0d12]/78 p-4 backdrop-blur-xl">
          <div className="glass-panel w-full max-w-md rounded-3xl p-5 text-white shadow-nexus">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold">Add Members</h2>
                <p className="text-xs text-white/42">{activeGroup.name}</p>
              </div>
              <button onClick={closeAddMembersModal} className="grid h-8 w-8 place-items-center rounded-xl text-white/60 hover:bg-white/[0.08] hover:text-white">
                x
              </button>
            </div>
            <div className="mb-3 flex gap-2">
              <input
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchMembersForActiveGroup();
                }}
                placeholder="Search users"
                className="glass-input h-11 min-w-0 flex-1 rounded-xl px-3 placeholder:text-white/35"
              />
              <button onClick={searchMembersForActiveGroup} className="rounded-xl border border-brand-purple/25 bg-brand-purple/10 px-3 text-sm font-bold text-brand-purple transition hover:bg-brand-purple/15">
                Search
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-white/[0.06]">
              {memberCandidates.length === 0 ? (
                <p className="p-4 text-sm text-white/42">Search for users who are not already in this group.</p>
              ) : (
                memberCandidates.map((candidate) => (
                  <label key={candidate.id} className="flex cursor-pointer items-center gap-3 border-b border-white/[0.06] p-3 text-sm hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      checked={selectedAddMemberIds.has(candidate.id)}
                      onChange={(event) => {
                        setSelectedAddMemberIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(candidate.id);
                          else next.delete(candidate.id);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{candidate.name} - {candidate.email}</span>
                  </label>
                ))
              )}
            </div>
            {addMembersError ? (
              <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {addMembersError}
              </p>
            ) : null}
            {addMembersMessage ? (
              <p className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                {addMembersMessage}
              </p>
            ) : null}
            <button
              onClick={addMembersToActiveGroup}
              className="accent-gradient mt-4 h-11 w-full rounded-xl font-bold text-white shadow-[0_0_28px_rgba(200,122,255,0.26)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedAddMemberIds.size === 0 || addMembersLoading}
            >
              {addMembersLoading ? "Adding..." : `Add ${selectedAddMemberIds.size || ""} Members`}
            </button>
          </div>
        </div>
      ) : null}
      {groupInfoOpen && activeGroup ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-[#0d0d12]/78 p-4 backdrop-blur-xl">
          <div className="glass-panel max-h-[88vh] w-full max-w-md overflow-hidden rounded-3xl text-white shadow-nexus">
            <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
              <div className="min-w-0">
                <h2 className="font-display truncate text-lg font-bold">{activeGroup.name}</h2>
                <p className="text-xs text-white/42">{activeGroup.members.length} members</p>
              </div>
              <button onClick={() => setGroupInfoOpen(false)} className="grid h-8 w-8 place-items-center rounded-xl text-white/60 hover:bg-white/[0.08] hover:text-white">
                x
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={toggleMuteActiveGroup} className="h-10 rounded-xl border border-white/[0.06] bg-white/[0.05] text-sm font-semibold text-white/75 hover:bg-white/[0.08] hover:text-white">
                  {activeGroupMembership?.mutedAt ? "Unmute Group" : "Mute Group"}
                </button>
                <button onClick={leaveActiveGroup} className="h-10 rounded-xl border border-rose-400/20 bg-rose-500/10 text-sm font-semibold text-rose-200 hover:bg-rose-500/15">
                  Leave Group
                </button>
              </div>
              {isActiveGroupAdmin ? (
                <button onClick={openAddMembersModal} className="accent-gradient h-10 w-full rounded-xl text-sm font-bold text-white shadow-[0_0_24px_rgba(200,122,255,0.24)]">
                  Add Members
                </button>
              ) : null}
              {groupActionError ? (
                <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {groupActionError}
                </p>
              ) : null}
              {groupActionMessage ? (
                <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                  {groupActionMessage}
                </p>
              ) : null}
              <div className="space-y-2">
                {activeGroup.members.map((member) => (
                  <div key={member.id} className="glass-panel flex items-center gap-2 rounded-xl p-2 text-sm">
                    <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-purple to-brand-pink text-xs font-bold text-white">
                      {member.user.name.slice(0, 2).toUpperCase()}
                      {member.user.status === "ONLINE" ? (
                        <span className="online-glow absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#12101a]" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{member.user.name}</p>
                      <p className="text-xs text-white/42">{member.role === "ADMIN" ? "Admin" : member.user.status.toLowerCase()}</p>
                    </div>
                    {member.userId !== user.id ? (
                      <button onClick={() => toggleBlockMember(member.userId)} className="rounded-lg px-2 py-1 text-xs font-semibold text-white/55 hover:bg-white/[0.08] hover:text-white">
                        {blockedUserIds.has(member.userId) ? "Unblock" : "Block"}
                      </button>
                    ) : null}
                    {isActiveGroupAdmin && member.userId !== user.id ? (
                      <button onClick={() => removeMemberFromActiveGroup(member.userId)} className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
