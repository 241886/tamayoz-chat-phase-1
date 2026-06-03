# Nexus

Connect. Collaborate. Create.

Nexus is a modern full-stack real-time workspace chat system with guest access, private and group conversations, Socket.IO messaging, file sharing, SQLite local persistence, Prisma ORM, a responsive Next.js interface, PWA metadata, and a dark-mode-first professional UI.

## Tech Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, Socket.IO client
- Backend: Node.js, Express, TypeScript, Socket.IO
- Database: SQLite for local development, Prisma ORM
- Auth: JWT access token, bcrypt password hashing

## Project Structure

```txt
nexus/
  backend/
    prisma/schema.prisma
    src/
      app.ts
      server.ts
      config/
      lib/
      middleware/
      modules/
      socket/
  frontend/
    src/
      app/
      components/
      context/
      lib/
      types/
  docker-compose.yml
  .env.example
  render.yaml
```

## Setup

1. Install dependencies from the project root.

```bash
npm install
```

2. Copy the environment files.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

On Windows CMD:

```cmd
copy .env.example .env
copy backend\.env.example backend\.env
```

3. Generate Prisma client and apply the SQLite schema.

```bash
npm run prisma:generate --workspace backend
npm run prisma:migrate --workspace backend
```

4. Start the backend.

```bash
npm run dev --workspace backend
```

5. In another terminal, start the frontend.

```bash
npm run dev --workspace frontend
```

6. Open the app.

```txt
http://localhost:3000
```

The backend runs on:

```txt
http://localhost:4000
```

## Authentication Checkpoint

Authentication is the first completed platform slice. It includes:

- Register with normalized name/email
- Login with email/password
- Logout
- JWT signing and verification
- bcrypt password hashing
- Protected `/api/auth/me`
- Safe user responses that never return `passwordHash`
- Frontend auth state stored in `localStorage`
- Auth page with login/register modes

Run the focused auth test suite:

```bash
npm run test:auth
```

Run compile/lint verification:

```bash
npm run build
npm run lint --workspace frontend
```

## Real-Time Chat Checkpoint

The Phase 2 chat system is implemented and covered by focused tests. It includes:

- One-to-one private conversations with stable direct keys
- User search to start a chat
- Conversation list with last message and unread count
- Socket.IO authenticated connections
- Real-time message delivery between users
- SQLite-backed local message persistence through Prisma
- Chat history retrieval
- Read/unread updates and read receipts
- Typing indicators scoped to conversation participants
- Online/offline presence with multiple active sockets handled correctly
- Responsive WhatsApp-like chat shell with sidebar, message bubbles, mobile list/detail flow, and dark mode
- Message edit for your own text messages
- Soft delete for your own messages with real-time replacement text

Run the focused chat test suite:

```bash
npm run test:chat
```

Run all backend feature tests:

```bash
npm test
```

The chat integration test starts a real Socket.IO server and connects two authenticated Socket.IO clients. It verifies that one user can join a private conversation, send a message, persist it, deliver it to the other user, update the recipient conversation list, send typing indicators, send read receipts, and emit online/offline presence.

## File Sharing Checkpoint

File sharing is implemented for private chat conversations. It includes:

- Attachment button in the chat composer
- Uploads up to 25MB
- Local file storage in `backend/uploads`
- Safe static serving from `/uploads`
- Prisma `Attachment` metadata records
- Messages that support text only, file only, or text plus file
- Real-time Socket.IO delivery for uploaded file messages
- Image previews inside chat bubbles
- File cards for documents, archives, audio, video, spreadsheets, and presentations
- File name, file size, and download button
- Upload progress and friendly client/server validation errors
- Blocked executable/script extensions such as `.exe`, `.bat`, `.cmd`, `.ps1`, and `.sh`
- Voice message recording from the chat composer microphone button
- Audio playback controls inside chat bubbles for voice messages

Allowed local-development file types:

```txt
png, jpg, jpeg, webp, gif,
pdf, doc, docx, txt,
xls, xlsx, csv,
ppt, pptx,
zip, rar,
mp3, wav, m4a, ogg,
mp4, mov, webm
```

## Environment Variables

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-this-secret-before-production"
JWT_EXPIRES_IN="7d"
PORT=4000
CLIENT_URL="http://localhost:3000"
UPLOAD_DIR="./uploads"
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:4000"
```

## Vercel + Render Deployment

Use this path instead of Azure:

- Render: backend Express/Socket.IO API
- Vercel: frontend Next.js UI

Important storage note: the current app uses SQLite and local uploads. Render Free web services have an ephemeral filesystem, so uploaded files and the SQLite database can be lost after redeploys/restarts/spin-down. For a stable demo with this SQLite setup, use a paid Render web service with a persistent disk mounted at `/var/data`. For production, move Prisma to PostgreSQL and store files in object storage.

### 1. Push the project to GitHub

From the project root:

```cmd
cd /d C:\path\to\nexus
```

Create a GitHub repository, then push this folder to it. Render and Vercel both deploy most easily from GitHub.

### 2. Deploy the backend on Render

Option A, recommended for this project:

1. Open Render.
2. Click New > Blueprint.
3. Select the GitHub repository.
4. Render will read `render.yaml`.
5. When Render asks for `CLIENT_URL`, enter your final Vercel URL after creating the Vercel project. If you do not know it yet, enter a temporary URL such as `https://nexus-chat.vercel.app`, then update it later.
6. Create the service.

The included `render.yaml` config uses:

```yaml
Root Directory: backend
Runtime: Node
Region: singapore
Plan: starter
Build Command: npm install --include=dev && npm run build
Start Command: npm run start:render
Health Check Path: /health
Disk Mount Path: /var/data
```

Render backend environment variables:

```env
DATABASE_URL=file:/var/data/nexus.db
UPLOAD_DIR=/var/data/uploads
JWT_SECRET=<generated-by-render-or-long-random-secret>
JWT_EXPIRES_IN=7d
CLIENT_URL=https://your-vercel-project.vercel.app
```

If you deploy manually instead of Blueprint, create a Render Web Service with:

```txt
Name: nexus-api
Root Directory: backend
Runtime: Node
Build Command: npm install --include=dev && npm run build
Start Command: npm run start:render
Health Check Path: /health
```

Then add a persistent disk:

```txt
Mount Path: /var/data
Size: 1 GB
```

After the backend deploys, copy the Render URL. It will look like:

```txt
https://nexus-api.onrender.com
```

Backend health check:

```txt
https://nexus-api.onrender.com/health
```

### 3. Deploy the frontend on Vercel

1. Open Vercel.
2. Click Add New > Project.
3. Import the same GitHub repository.
4. Set Root Directory to `frontend`.
5. Keep Framework Preset as Next.js.
6. Add the frontend environment variables below.
7. Deploy.

Vercel frontend environment variables:

```env
NEXT_PUBLIC_API_URL=https://your-render-service.onrender.com
NEXT_PUBLIC_SOCKET_URL=https://your-render-service.onrender.com
```

After Vercel deploys, copy the Vercel production URL. It will look like:

```txt
https://your-vercel-project.vercel.app
```

### 4. Update Render CORS after Vercel deploys

In Render > backend service > Environment, set:

```env
CLIENT_URL=https://your-vercel-project.vercel.app
```

If you want both production and local frontend access, use comma-separated URLs:

```env
CLIENT_URL=https://your-vercel-project.vercel.app,http://localhost:3000
```

Redeploy the Render backend after changing `CLIENT_URL`.

### 5. Final production URLs

Open the app:

```txt
https://your-vercel-project.vercel.app
```

Backend health:

```txt
https://your-render-service.onrender.com/health
```

### Free Render demo warning

You can choose Render's Free instance type only for a temporary demo, but do not attach a disk. Use:

```env
DATABASE_URL=file:./dev.db
UPLOAD_DIR=./uploads
```

This will run, but chat history and uploads can disappear when Render restarts, redeploys, or spins down the service.

## Azure App Service Deployment

This project deploys cleanly as two Azure App Services:

- Backend App Service: Node/Express/Socket.IO API
- Frontend App Service: Next.js UI

For a first demo deployment, SQLite can run on Azure App Service persistent storage. Use:

```txt
DATABASE_URL=file:/home/site/data/nexus.db
UPLOAD_DIR=/home/site/uploads
```

For production, move the database to Azure Database for PostgreSQL and file uploads to Azure Blob Storage.

### 1. Login

```cmd
az login
```

### 2. Create Azure resources

Change the app names because Azure App Service names must be globally unique.

```cmd
set RG=nexus-rg
set LOCATION=uaenorth
set PLAN=nexus-plan
set API_APP=nexus-api-yourname
set WEB_APP=nexus-web-yourname

az group create --name %RG% --location %LOCATION%
az appservice plan create --name %PLAN% --resource-group %RG% --location %LOCATION% --sku F1 --is-linux
az webapp create --resource-group %RG% --plan %PLAN% --name %API_APP% --runtime "NODE:22-lts"
az webapp create --resource-group %RG% --plan %PLAN% --name %WEB_APP% --runtime "NODE:22-lts"
```

### 3. Configure backend

```cmd
az webapp config appsettings set --resource-group %RG% --name %API_APP% --settings DATABASE_URL="file:/home/site/data/nexus.db" JWT_SECRET="change-this-to-a-long-random-secret" JWT_EXPIRES_IN="7d" CLIENT_URL="https://%WEB_APP%.azurewebsites.net" UPLOAD_DIR="/home/site/uploads" SCM_DO_BUILD_DURING_DEPLOYMENT="true" WEBSITES_ENABLE_APP_SERVICE_STORAGE="true" WEBSITE_NODE_DEFAULT_VERSION="~22"
az webapp config set --resource-group %RG% --name %API_APP% --startup-file "npm run start:azure" --web-sockets-enabled true
```

### 4. Configure frontend

```cmd
az webapp config appsettings set --resource-group %RG% --name %WEB_APP% --settings NEXT_PUBLIC_API_URL="https://%API_APP%.azurewebsites.net" NEXT_PUBLIC_SOCKET_URL="https://%API_APP%.azurewebsites.net" SCM_DO_BUILD_DURING_DEPLOYMENT="true" WEBSITE_NODE_DEFAULT_VERSION="~22"
az webapp config set --resource-group %RG% --name %WEB_APP% --startup-file "npm run start -- -p $PORT"
```

### 5. Deploy backend

Run from the project root:

```cmd
powershell -NoProfile -Command "Compress-Archive -Path backend\* -DestinationPath backend.zip -Force"
az webapp deploy --resource-group %RG% --name %API_APP% --src-path backend.zip
```

### 6. Deploy frontend

Run from the project root:

```cmd
powershell -NoProfile -Command "Compress-Archive -Path frontend\* -DestinationPath frontend.zip -Force"
az webapp deploy --resource-group %RG% --name %WEB_APP% --src-path frontend.zip
```

### 7. Open the app

```txt
https://nexus-web-yourname.azurewebsites.net
```

Backend health check:

```txt
https://nexus-api-yourname.azurewebsites.net/health
```

## Database Schema

The Prisma schema is in `backend/prisma/schema.prisma`.

Core models:

- `User`: name, email, password hash, avatar placeholder URL, online/offline status, last seen timestamp.
- `Conversation`: one-to-one private chat container with a unique `directKey`.
- `ConversationParticipant`: join table that keeps the structure ready for future account types and permissions.
- `Message`: saved chat messages with timestamps and nullable `readAt` for read/unread status.

## API Routes

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Users:

- `GET /api/users?q=search`
- `GET /api/users/profile`

Conversations:

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:conversationId/messages`

Messages:

- `POST /api/messages/:messageId/read`

Protected routes require:

```txt
Authorization: Bearer <jwt>
```

## Socket.IO Events

The frontend connects with:

```ts
io(SOCKET_URL, {
  auth: { token }
});
```

Client to server:

- `conversation:join` with `{ conversationId }`
- `message:send` with `{ conversationId, body }`
- `message:read` with `{ conversationId, messageId? }`
- `typing:start` with `{ conversationId }`
- `typing:stop` with `{ conversationId }`

Server to client:

- `presence:update`
- `message:new`
- `message:updated`
- `message:deleted`
- `message:read`
- `typing:update`
- `conversation:upsert`

## Current Nexus Features

- Register, login, logout
- JWT authentication
- bcrypt password hashing
- User profile fields
- Avatar placeholder initials
- Online/offline presence
- Search users
- Start one-to-one private conversations
- Real-time messages
- Persist messages in SQLite locally
- Message timestamps
- Read/unread status
- Typing indicator
- Conversation list
- Responsive premium workspace layout
- Dark mode toggle

## Architecture Notes

The code is intentionally split by feature modules in the backend and by UI/domain layers in the frontend. The database keeps participants separate from conversations so later platform phases can add parent accounts, student accounts, admin permissions, file sharing, notifications, AI assistant interactions, and training-management modules without flattening everything into the message table.

For production, add refresh tokens or secure HTTP-only cookie sessions, rate limiting, input validation with a schema library, centralized logging, and notification delivery.
