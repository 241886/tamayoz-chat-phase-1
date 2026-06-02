import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const required = ["DATABASE_URL", "JWT_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const clientUrls = (process.env.CLIENT_URL ?? "http://localhost:3000")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

export function isAllowedClientOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  if (clientUrls.includes(origin)) {
    return true;
  }

  return /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
}

export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  port: Number(process.env.PORT ?? 4000),
  clientUrl: clientUrls[0] ?? "http://localhost:3000",
  clientUrls
};
