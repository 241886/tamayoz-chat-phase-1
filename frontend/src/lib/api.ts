export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type RequestOptions = RequestInit & {
  token?: string | null;
};

function guestHeaders(token?: string | null): Record<string, string> {
  if (!token?.startsWith("guest:")) {
    return {};
  }

  const guestId = token.slice("guest:".length);
  const guestName = window.localStorage.getItem("tamayoz_chat_guest_name") ?? "";

  return {
    "x-guest-id": guestId,
    "x-guest-name": guestName
  };
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");

  if (token?.startsWith("guest:")) {
    const guest = guestHeaders(token);
    requestHeaders.set("x-guest-id", guest["x-guest-id"]);
    requestHeaders.set("x-guest-name", guest["x-guest-name"]);
  } else if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: requestHeaders
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Request failed.");
  }

  return data as T;
}

export function formatTime(value?: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatLastSeen(value?: string | null) {
  if (!value) {
    return "Online";
  }

  return `Last seen ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value))}`;
}

export function absoluteFileUrl(url: string) {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

export function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
