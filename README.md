# AudioBot — Enhanced Architecture

A layered enhancement on top of the original FastAPI AudioBot. The Python FastAPI backend is **untouched** — a Node.js middleware layer sits in front of it adding JWT authentication, MongoDB persistence, and Redis session management.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ┌──────────────────┐    ┌───────────────────────────────┐   │
│  │  React Frontend  │    │     React Admin Panel         │   │
│  │  :5173           │    │     :5174                     │   │
│  └────────┬─────────┘    └──────────────┬────────────────┘   │
└───────────┼───────────────────────────────┼──────────────────┘
            │ REST + WebSocket             │ REST
            ▼                             ▼
┌───────────────────────────────────────────────────────────┐
│         Node.js Middleware  :4000                         │
│                                                           │
│  POST /api/auth/*       — JWT register/login/refresh      │
│  GET  /api/conversations — list user's conversations      │
│  POST /api/conversations/start — create session           │
│  POST /api/conversations/:id/message — persist message    │
│  POST /api/conversations/:id/end — end session            │
│  GET  /api/admin/*      — full admin API (admin only)     │
│  WS   /ws/audio?token=<jwt>&session=<id> — WS proxy       │
│  /api/ai/*              — HTTP proxy → FastAPI            │
│                                                           │
│  ┌─────────────────┐    ┌──────────────────────────────┐  │
│  │  MongoDB        │    │  Redis                       │  │
│  │  · users        │    │  · session:<id>  (1h TTL)    │  │
│  │  · conversations│    │  · user_sessions:<userId>    │  │
│  │  · system_config│    │  (in-memory fallback if down)│  │
│  └─────────────────┘    └──────────────────────────────┘  │
└────────────────────────────────┬──────────────────────────┘
                                 │ proxied with X-User-* headers
                                 ▼
┌────────────────────────────────────────────────────────────┐
│  FastAPI Backend  :8000  (ORIGINAL — UNTOUCHED)            │
│  · faster-whisper STT                                      │
│  · edge TTS                                               │
│  · Groq LLM (Qwen 32B)                                     │
│  · LangGraph agent                                         │
│  · WebSocket /ws/audio                                     │
└────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Prerequisites
- Node.js 20+, Python 3.13+
- MongoDB running locally or via Docker
- Redis running locally or via Docker

### 2. Start infrastructure (Docker)
```bash
docker compose up mongodb redis -d
```

### 3. Start the original FastAPI backend (unchanged)
```bash
cd backend

cp app/.env.example app/.env   # add GROQ_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 4. Start Node.js middleware
```bash
cd node-middleware
npm install
cp .env.example .env           # edit .env values
npm run seed                   # creates admin user + default configs
npm run dev
```

### 5. Start React Frontend
```bash
cd react-frontend
npm install
npm run dev                    # → http://localhost:5173
```

### 6. Start React Admin Panel
```bash
cd react-admin
npm install
npm run dev                    # → http://localhost:5174
```

---

## Admin Panel Credentials
Default admin is seeded by `npm run seed`:
- **Email:** `admin@audiobot.com`  
- **Password:** `Admin@123!`

Change in `node-middleware/.env` before running seed.

---

## Node Middleware `.env`

```env
PORT=4000
FASTAPI_URL=http://localhost:8000

# JWT — CHANGE THESE IN PRODUCTION
JWT_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# MongoDB & Redis
MONGODB_URI=mongodb://localhost:27017/audiobot
REDIS_URL=redis://localhost:6379

# Admin seed
ADMIN_EMAIL=admin@audiobot.com
ADMIN_PASSWORD=Admin@123!

# Frontend origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

---

## FastAPI Patch (Optional)

Apply `FASTAPI_PATCH.py` to your FastAPI backend to:
- Read `X-User-Id`, `X-User-Email`, `X-Session-Id` headers injected by the middleware
- Expose `/internal/config` endpoint so admin config changes propagate instantly

The system works without this patch — it just provides tighter integration.

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login → returns JWT pair |
| POST | `/api/auth/refresh` | Refresh access token |
| GET  | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Conversations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations/start` | Create session in Redis + MongoDB |
| GET  | `/api/conversations` | List user's conversations |
| GET  | `/api/conversations/:sessionId` | Get full conversation |
| POST | `/api/conversations/:sessionId/message` | Persist message |
| POST | `/api/conversations/:sessionId/end` | End session |
| GET  | `/api/conversations/:sessionId/context` | Get Redis context |

### Admin (requires admin JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/admin/stats` | Dashboard stats |
| GET  | `/api/admin/users` | List users (search, filter) |
| POST | `/api/admin/users/:id/ban` | Ban user + kill sessions |
| POST | `/api/admin/users/:id/unban` | Unban user |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET  | `/api/admin/conversations` | All conversations |
| POST | `/api/admin/conversations/:id/end` | Force-end session |
| GET  | `/api/admin/sessions` | All active Redis sessions |
| DELETE | `/api/admin/sessions/:id` | Terminate session |
| GET  | `/api/admin/config` | Get system config |
| PUT  | `/api/admin/config` | Update system config |

### WebSocket
```
ws://localhost:4000/ws/audio?token=<JWT>&session=<sessionId>
```
JWT is validated, session ownership verified, then proxied to FastAPI.

---

## Data Flow

1. **User logs in** → Node middleware issues JWT pair
2. **Start session** → Node creates Redis entry (TTL 1h) + MongoDB document
3. **Hold mic** → React opens WebSocket to Node `/ws/audio`
4. **Node WS proxy** → validates JWT, injects user headers, proxies to FastAPI
5. **FastAPI** → STT → LangGraph → Groq → TTS → streams audio back
6. **Audio complete** → React calls `POST /conversations/:id/message` to persist both turns to MongoDB
7. **Admin** → can view all sessions live, end any session, ban users, change AI config
