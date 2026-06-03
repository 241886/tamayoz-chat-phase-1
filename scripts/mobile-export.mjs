import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = join(root, "frontend");
const command = process.platform === "win32" ? "npm.cmd" : "npm";

const result = spawnSync(command, ["exec", "next", "build"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    MOBILE_EXPORT: "true",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "https://tamayoz-chat-api.onrender.com",
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL ?? "https://tamayoz-chat-api.onrender.com"
  },
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
