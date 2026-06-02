import { prisma } from "../../lib/prisma.js";
import { userSelect } from "../auth/auth.helpers.js";

const guestIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;

export function normalizeGuestId(value: unknown) {
  const id = String(value ?? "").trim();
  return guestIdPattern.test(id) ? id : null;
}

export function normalizeGuestName(value: unknown) {
  const name = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);

  return name || `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
}

export function guestEmailFor(guestId: string) {
  return `${guestId.toLowerCase()}@guest.local`;
}

export async function getOrCreateGuestUser(guestId: string, displayName: string) {
  const name = normalizeGuestName(displayName);

  return prisma.user.upsert({
    where: { id: guestId },
    update: {
      name
    },
    create: {
      id: guestId,
      name,
      email: guestEmailFor(guestId),
      passwordHash: "guest-session",
      status: "OFFLINE"
    },
    select: userSelect
  });
}
