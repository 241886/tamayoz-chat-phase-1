"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  CheckCheck,
  Download,
  Edit3,
  FileText,
  Mic,
  MoreVertical,
  Paperclip,
  Send,
  Square,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { NexusLogo } from "@/components/brand/NexusLogo";
import { Avatar } from "@/components/chat/Avatar";
import { absoluteFileUrl, formatBytes, formatLastSeen, formatTime } from "@/lib/api";
import type { Attachment, Conversation, Group, Message, User } from "@/types/chat";

type ChatWindowProps = {
  currentUser: User;
  conversation?: Conversation | null;
  group?: Group | null;
  messages: Message[];
  compose: string;
  typingText: string;
  sending: boolean;
  selectedFile: File | null;
  uploadProgress: number | null;
  fileError: string;
  editingMessage: Message | null;
  actionError: string;
  actionLoadingId: string | null;
  canManageGroup?: boolean;
  onBack: () => void;
  onAddMembers?: () => void;
  onOpenGroupInfo?: () => void;
  onComposeChange: (value: string) => void;
  onFileSelect: (file: File | null) => void;
  onFileError: (message: string) => void;
  onClearFile: () => void;
  onCancelEdit: () => void;
  onStartEdit: (message: Message) => void;
  onDeleteMessage: (message: Message) => void;
  onSend: () => void;
};

function otherParticipant(conversation: Conversation, currentUserId: string) {
  return conversation.participants.find((participant) => participant.userId !== currentUserId)?.user;
}

export function ChatWindow({
  currentUser,
  conversation,
  group,
  messages,
  compose,
  typingText,
  sending,
  selectedFile,
  uploadProgress,
  fileError,
  editingMessage,
  actionError,
  actionLoadingId,
  canManageGroup = false,
  onBack,
  onAddMembers,
  onOpenGroupInfo,
  onComposeChange,
  onFileSelect,
  onFileError,
  onClearFile,
  onCancelEdit,
  onStartEdit,
  onDeleteMessage,
  onSend
}: ChatWindowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingCancelledRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const interval = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (!conversation && !group) {
    return (
      <section className="app-cinematic hidden h-full flex-col items-center justify-center overflow-hidden px-6 text-center md:flex">
        <div className="glass-panel rounded-[2rem] p-8 shadow-nexus">
          <NexusLogo size="lg" />
        </div>
        <h2 className="font-display mt-8 text-2xl font-bold text-white">A focused workspace for every conversation</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-white/45">
          Select a chat or create a group to connect, collaborate, and create with your team.
        </p>
      </section>
    );
  }

  const other = conversation ? otherParticipant(conversation, currentUser.id) : null;
  const isGroup = Boolean(group);
  const title = group?.name ?? other?.name ?? "Unknown user";
  const subtitle = group
    ? `${group.members.length} members`
    : typingText || (other?.status === "ONLINE" ? "Online" : formatLastSeen(other?.lastSeenAt));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  function formatRecordingTime(seconds: number) {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
  }

  function preferredAudioMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }

    return (
      ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/wav"].find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType)
      ) ?? ""
    );
  }

  function fileExtensionForMimeType(mimeType: string) {
    if (mimeType.includes("mp4")) {
      return "m4a";
    }

    if (mimeType.includes("ogg")) {
      return "ogg";
    }

    if (mimeType.includes("wav")) {
      return "wav";
    }

    return "webm";
  }

  function cleanupRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  async function startVoiceRecording() {
    onFileError("");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onFileError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recordingCancelledRef.current = false;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedMimeType = recorder.mimeType || "audio/webm";
        cleanupRecordingStream();
        setIsRecording(false);

        if (recordingCancelledRef.current) {
          recordingChunksRef.current = [];
          return;
        }

        const blob = new Blob(recordingChunksRef.current, { type: recordedMimeType });
        const extension = fileExtensionForMimeType(recordedMimeType);
        const file = new File([blob], `voice-message-${Date.now()}.${extension}`, { type: recordedMimeType });
        recordingChunksRef.current = [];
        onFileSelect(file);
      };

      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      onClearFile();
    } catch {
      cleanupRecordingStream();
      setIsRecording(false);
      onFileError("Could not access your microphone. Check browser permissions and try again.");
    }
  }

  function stopVoiceRecording(save: boolean) {
    const recorder = mediaRecorderRef.current;
    recordingCancelledRef.current = !save;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    cleanupRecordingStream();
    setIsRecording(false);
  }

  function renderAttachment(attachment: Attachment, mine: boolean) {
    const href = absoluteFileUrl(attachment.url);
    const isImage = attachment.mimeType.startsWith("image/");

    if (isImage) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-white/[0.06]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={attachment.originalName} className="max-h-72 w-full object-cover" />
        </a>
      );
    }

    if (attachment.mimeType.startsWith("audio/")) {
      return (
        <div
          className={clsx(
            "mt-2 rounded-xl border p-3",
            mine ? "border-brand-purple/25 bg-white/10" : "border-white/[0.06] bg-white/[0.07]"
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{attachment.originalName}</p>
              <p className={clsx("text-xs", mine ? "text-white/70" : "text-white/42")}>
                Voice message - {formatBytes(attachment.size)}
              </p>
            </div>
            <a
              href={href}
              download={attachment.originalName}
              title="Download voice message"
              className={clsx(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition",
                mine ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/[0.08] text-white/75 hover:bg-white/[0.12]"
              )}
            >
              <Download size={17} />
            </a>
          </div>
          <audio controls src={href} className="w-full" />
        </div>
      );
    }

    if (attachment.mimeType.startsWith("video/")) {
      return (
        <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.06]">
          <video controls src={href} className="max-h-80 w-full bg-black" />
        </div>
      );
    }

    return (
      <div
        className={clsx(
          "mt-2 flex items-center gap-3 rounded-xl border p-3",
          mine ? "border-brand-purple/25 bg-white/10" : "border-white/[0.06] bg-white/[0.07]"
        )}
      >
        <div className="accent-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-[0_0_22px_rgba(200,122,255,0.24)]">
          <FileText size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{attachment.originalName}</p>
          <p className={clsx("text-xs", mine ? "text-white/70" : "text-white/42")}>
            {formatBytes(attachment.size)}
          </p>
        </div>
        <a
          href={href}
          download={attachment.originalName}
          title="Download file"
          className={clsx(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition",
            mine ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/[0.08] text-white/75 hover:bg-white/[0.12]"
          )}
        >
          <Download size={17} />
        </a>
      </div>
    );
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#0d0d12] text-white">
      <header className="flex h-[65px] items-center gap-3 border-b border-white/[0.06] bg-[#12101a]/88 px-3 backdrop-blur-xl sm:px-4">
        <button
          type="button"
          onClick={onBack}
          title="Back to conversations"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.05] text-white/70 transition hover:bg-white/[0.08] hover:text-white md:hidden"
        >
          <ArrowLeft size={20} />
        </button>
        {group ? (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-brand-purple font-display font-bold text-white shadow-[0_0_26px_rgba(200,122,255,0.3)]">
            {group.name.slice(0, 2).toUpperCase()}
          </div>
        ) : (
          <Avatar user={other} />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-sm font-bold text-white">{title}</p>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <p className="truncate text-xs text-white/42">{subtitle}</p>
            {group ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-cyan">
                <span className="online-glow h-1.5 w-1.5 rounded-full" />
                {group.members.filter((member) => member.user.status === "ONLINE").length} online
              </span>
            ) : null}
          </div>
        </div>
        {group && canManageGroup ? (
          <button
            type="button"
            onClick={onAddMembers}
            title="Add members"
            className="accent-gradient flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white shadow-[0_0_28px_rgba(200,122,255,0.24)] transition hover:opacity-95"
          >
            <UserPlus size={17} />
            <span className="hidden sm:inline">Add Members</span>
          </button>
        ) : null}
        {group ? (
          <button
            type="button"
            onClick={onOpenGroupInfo}
            title="Group info"
            className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.05] px-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white"
          >
            <Users size={17} />
            <span className="hidden sm:inline">Group Info</span>
          </button>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_0%,rgba(200,122,255,0.09),transparent_24rem)] sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {messages.map((message) => {
            const mine = message.senderId === currentUser.id;
            return (
              <div key={message.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={clsx(
                    "group relative max-w-[82%] rounded-2xl border px-3 py-2 text-sm shadow-sm backdrop-blur sm:max-w-[68%]",
                    mine
                      ? "rounded-br-md border-brand-purple/25 bg-[linear-gradient(135deg,rgba(140,40,220,0.7),rgba(200,50,150,0.6))] text-white shadow-[0_12px_36px_rgba(200,50,150,0.18)]"
                      : "rounded-bl-md border-white/[0.06] bg-white/[0.07] text-white"
                  )}
                >
                  {isGroup && !mine ? (
                    <p className="mb-1 text-xs font-bold text-brand-purple">{message.sender.name}</p>
                  ) : null}
                  {mine && !message.isDeleted ? (
                    <details className="absolute right-1 top-1">
                      <summary
                        title="Message actions"
                        className={clsx(
                          "grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg opacity-0 transition group-hover:opacity-100 [&::-webkit-details-marker]:hidden",
                          mine ? "bg-white/10 hover:bg-white/20" : "bg-white/[0.08] hover:bg-white/[0.12]"
                        )}
                      >
                        <MoreVertical size={15} />
                      </summary>
                      <div className="absolute right-0 top-8 z-10 w-32 overflow-hidden rounded-xl border border-white/[0.06] bg-[#12101a] py-1 text-white shadow-nexus">
                        {message.body.trim() ? (
                          <button
                            type="button"
                            disabled={actionLoadingId === message.id}
                            onClick={() => onStartEdit(message)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.07] disabled:opacity-50"
                          >
                            <Edit3 size={14} />
                            <span>Edit</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={actionLoadingId === message.id}
                          onClick={() => onDeleteMessage(message)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </details>
                  ) : null}
                  {message.body ? <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p> : null}
                  {!message.isDeleted
                    ? message.attachments?.map((attachment) => (
                        <div key={attachment.id}>{renderAttachment(attachment, mine)}</div>
                      ))
                    : null}
                  <div
                    className={clsx(
                      "mt-1 flex items-center justify-end gap-1 text-[11px]",
                      mine ? "text-white/72" : "text-white/38"
                    )}
                  >
                    <span>{formatTime(message.createdAt)}</span>
                    {message.isEdited && !message.isDeleted ? <span>edited</span> : null}
                    {mine ? <CheckCheck size={14} className={message.readAt ? "text-emerald-200" : ""} /> : null}
                  </div>
                </div>
              </div>
            );
          })}
          {typingText ? (
            <div className="flex justify-start">
              <div className="glass-panel flex items-center gap-1.5 rounded-2xl px-4 py-3">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-white/[0.06] bg-[#12101a]/88 p-3 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          {selectedFile ? (
            <div className="glass-panel mb-2 flex items-center gap-3 rounded-xl p-2 text-sm text-white">
              <FileText size={18} className="shrink-0 text-brand-purple" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{selectedFile.name}</p>
                <p className="text-xs text-white/42">{formatBytes(selectedFile.size)}</p>
              </div>
              {uploadProgress !== null ? (
                <span className="text-xs font-bold text-brand-purple">{uploadProgress}%</span>
              ) : null}
              <button
                type="button"
                onClick={onClearFile}
                title="Remove file"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/55 hover:bg-white/[0.08] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {isRecording ? (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-2 text-sm text-rose-100">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
              <span className="font-medium">Recording {formatRecordingTime(recordingSeconds)}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => stopVoiceRecording(false)}
                title="Cancel recording"
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-rose-500/15"
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => stopVoiceRecording(true)}
                title="Stop recording"
                className="grid h-8 w-8 place-items-center rounded-lg bg-rose-500 text-white hover:bg-rose-400"
              >
                <Square size={14} />
              </button>
            </div>
          ) : null}
          {fileError ? (
            <div className="mb-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {fileError}
            </div>
          ) : null}
          {actionError ? (
            <div className="mb-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {actionError}
            </div>
          ) : null}
          {editingMessage ? (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-brand-purple/25 bg-brand-purple/10 p-2 text-sm">
              <Edit3 size={17} className="shrink-0 text-brand-purple" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">Editing message</p>
                <p className="truncate text-xs text-white/45">{editingMessage.body}</p>
              </div>
              <button
                type="button"
                onClick={onCancelEdit}
                title="Cancel edit"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/[0.08] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={Boolean(editingMessage)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.06] text-white/70 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            title="Record voice message"
            onClick={startVoiceRecording}
            disabled={sending || isRecording || Boolean(editingMessage)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.06] text-white/70 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic size={18} />
          </button>
          <textarea
            value={compose}
            onChange={(event) => onComposeChange(event.target.value)}
            placeholder={editingMessage ? "Edit message" : "Message"}
            rows={1}
            className="glass-input max-h-32 min-h-11 flex-1 resize-none rounded-xl px-3 py-2.5 text-sm placeholder:text-white/35"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
          />
          <button
            type="submit"
            title="Send message"
            disabled={(editingMessage ? !compose.trim() : !compose.trim() && !selectedFile) || sending}
            className="accent-gradient grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-[0_0_28px_rgba(200,122,255,0.34)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={18} />
          </button>
          </div>
        </div>
      </form>
    </section>
  );
}
