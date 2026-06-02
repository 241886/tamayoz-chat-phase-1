import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../utils/auth.js";
import { userSelect } from "../modules/auth/auth.helpers.js";
import { getOrCreateGuestUser, normalizeGuestId, normalizeGuestName } from "../modules/guests/guest-session.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!token) {
      const guestId = normalizeGuestId(req.headers["x-guest-id"]);

      if (!guestId) {
        return res.status(401).json({ message: "Authentication token or guest session is required." });
      }

      const guestName = normalizeGuestName(req.headers["x-guest-name"]);
      const user = await getOrCreateGuestUser(guestId, guestName);
      req.user = user;
      return next();
    }

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: userSelect
    });

    if (!user) {
      return res.status(401).json({ message: "User no longer exists." });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired authentication token." });
  }
}
