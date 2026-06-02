import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Request } from "express";

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const uploadsDir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve("uploads");

const deniedExtensions = new Set([".exe", ".bat", ".cmd", ".ps1", ".sh", ".msi", ".com", ".scr"]);

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/quicktime",
  "video/webm"
]);

const allowedExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".xls",
  ".xlsx",
  ".csv",
  ".ppt",
  ".pptx",
  ".zip",
  ".rar",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".mp4",
  ".mov",
  ".webm"
]);

export class UploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function ensureUploadsDir() {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export function sanitizeFileName(fileName: string) {
  const parsed = path.parse(fileName);
  const safeBase = parsed.name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const safeExt = parsed.ext.toLowerCase().replace(/[^.\w]/g, "");

  return `${safeBase || "file"}${safeExt}`;
}

function validateFile(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.split(";")[0].toLowerCase();

  if (deniedExtensions.has(extension)) {
    throw new UploadError("This file type is not allowed.");
  }

  if (!allowedExtensions.has(extension)) {
    throw new UploadError("Unsupported file extension.");
  }

  if (!allowedMimeTypes.has(mimeType)) {
    throw new UploadError("Unsupported file type.");
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadsDir();
    callback(null, uploadsDir);
  },
  filename: (_req, file, callback) => {
    const safeName = sanitizeFileName(file.originalname);
    const extension = path.extname(safeName);
    const base = path.basename(safeName, extension);
    callback(null, `${base}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    try {
      validateFile(file);
      callback(null, true);
    } catch (error) {
      callback(error as Error);
    }
  }
});

export function parseMessageUpload(req: Request) {
  return new Promise<void>((resolve, reject) => {
    upload.single("file")(req, {} as never, (error) => {
      if (!error) {
        resolve();
        return;
      }

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        reject(new UploadError("File size must be 25MB or less."));
        return;
      }

      reject(error);
    });
  });
}

export function fileUrlFor(storedName: string) {
  return `/uploads/${encodeURIComponent(storedName)}`;
}
