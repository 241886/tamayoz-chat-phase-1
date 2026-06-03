import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

export function createSocket(token: string): Socket {
  if (token.startsWith("guest:")) {
    return io(SOCKET_URL, {
      auth: {
        guestId: token.slice("guest:".length),
        guestName: window.localStorage.getItem("nexus_guest_name") ?? ""
      },
      transports: ["websocket"]
    });
  }

  return io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket"]
  });
}
