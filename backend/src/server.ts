import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { registerSocketServer } from "./socket/index.js";

const httpServer = http.createServer(app);
const io = registerSocketServer(httpServer);

app.set("io", io);

httpServer.listen(env.port, "0.0.0.0", () => {
  console.log(`ALMAJD backend listening on http://localhost:${env.port}`);
});
