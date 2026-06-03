import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { env, isAllowedClientOrigin } from "./config/env.js";
import { ensureUploadsDir, uploadsDir } from "./modules/messages/upload.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { conversationsRouter } from "./modules/conversations/conversations.routes.js";
import { groupsRouter } from "./modules/groups/groups.routes.js";
import { messagesRouter } from "./modules/messages/messages.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedClientOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS."));
    },
    credentials: true
  })
);
app.use(express.json());

ensureUploadsDir();
app.use(
  "/uploads",
  express.static(uploadsDir, {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline");
    }
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "almajd-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/messages", messagesRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Unexpected server error." });
};

app.use(errorHandler);
