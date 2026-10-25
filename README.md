# AudioBot

An AI interviewer that holds a real conversation. A candidate joins a session in
the browser, speaks or types, and a stateful LangGraph agent asks follow-up
questions, decides on its own when it has enough evidence, ends the interview,
and produces a scored PDF report for the recruiter.

Two halves, deployed independently:

| Part | Stack | Host | Docs |
|---|---|---|---|
| [`backend/`](backend) | FastAPI + LangGraph, Python 3.11 | Cloud Run (`asia-south1`) | [backend/README.md](backend/README.md) |
| [`frontend/`](frontend) | React 18 + Vite | Vercel | [frontend/README.md](frontend/README.md) |

Provisioning a deployment from scratch is covered in
[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

---

## Repository layout

```
backend/              FastAPI service, LangGraph agent, Alembic migrations, pytest suite
frontend/             React SPA: landing page, candidate + recruiter portals, interview room
nginx/default.conf    reverse proxy used only by backend/docker-compose.yml
.github/workflows/    deploy-backend.yml — test gate, build, push, deploy to Cloud Run
DEPLOYMENT_GUIDE.md   provisioning GCP, Supabase and Groq from zero
package.json          root-level dev dependency: the Supabase CLI, nothing else
```

Each half has its own README with the detail that belongs to it — routes, state
management, environment variables, rough edges. This file covers how they fit
together.

---

## External services

| Concern | Service | Why this one |
|---|---|---|
| LLM | Gemini 2.5 Flash via Vertex AI | Used for both the conversational and reasoning paths |
| Speech-to-text | Groq Whisper (`whisper-large-v3-turbo`) | 28,800 free seconds/day; Google STT V1 gives only 60 free minutes/month |
| Text-to-speech | Google Cloud Text-to-Speech | 1M free characters/month covers current usage |
| Database | Supabase Postgres | Free tier; replaced Cloud SQL and cut roughly $27/month |
| Report storage | Google Cloud Storage | Local directory as fallback |

Running cost is roughly $3.50/month, dominated by Cloud Run. See
[DEPLOYMENT_GUIDE.md §12](DEPLOYMENT_GUIDE.md).

---

## Architecture

```
  Browser (React SPA on Vercel)
      │
      │  HTTPS  /api/v1/*            ← JSON + multipart (PDF uploads)
      │  WSS    /api/v1/interviews/{id}/stream?token=<jwt>
      ▼
  FastAPI on Cloud Run
      ├── routers/        auth, jobs, candidates, interviews, mock_interviews,
      │                   conversations, recruiter, admin
      ├── websocket.py    the live interview loop
      └── agent/          LangGraph StateGraph
            │
            ├──► Vertex AI (Gemini)          reasoning + question generation
            ├──► Groq Whisper                audio frame → text
            ├──► Google Cloud TTS            reply text → audio frame
            └──► Cloud Storage               the generated PDF report
      │
      ▼
  Supabase Postgres — one database, two independent sets of tables:
      ├── application tables   users, jobs, candidates, interviews
      │                        (SQLAlchemy async over asyncpg)
      └── checkpointer tables  LangGraph AsyncPostgresSaver
                               (psycopg3 pool, keyed on thread_id = interview_id)
```

### Two stores in one database

This split is the single most important thing to understand about the codebase.

**Live conversation state lives in the LangGraph checkpointer, not in the
`interviews` table.** The checkpointer is keyed on `thread_id = interview_id`,
which is what makes a dropped WebSocket survivable: the browser reconnects,
the agent reloads the thread, and the interview resumes mid-conversation with
nothing lost.

The `interviews` row only receives the transcript and report at the end, when
`_mark_interview_completed` in `backend/app/websocket.py` copies them across and
flips both the interview and the candidate to `completed`.

The two stores also use **different Postgres drivers over the same URL** —
asyncpg for the ORM, psycopg3 for the checkpointer. Each rewrites the scheme
itself, so `DATABASE_URL` must be plain `postgresql://`. Any other scheme breaks
one of the two. This is the most common way to misconfigure the project.

---

## The interview flow, end to end

A single turn, from a spoken answer to a spoken reply:

1. **Connect.** `ChatPage.jsx` opens `WSS /api/v1/interviews/{id}/stream?token=<jwt>`.
   The JWT travels as a query parameter because browsers cannot set an
   `Authorization` header on a WebSocket handshake. `websocket_handler`
   authenticates *before* the interview loop; on failure it accepts the socket
   anyway, sends `{"type": "auth_error"}` so the browser can read the reason,
   then closes with code 4003.
2. **Seed context.** `_ensure_interview_context` checks the checkpointer for
   `jd_text` and `resume_text`. If absent, it reads the job description and
   résumé from Postgres once and writes them into the thread. Subsequent turns
   skip the query.
3. **Send.** The client sends `{"type": "audio"}` followed by one binary frame
   (`MediaRecorder`, 50-second cap). `text` and `code_submit` are the other two
   message types.
4. **Transcribe.** Groq Whisper runs via `asyncio.to_thread`, since it is a
   blocking call and would otherwise stall the event loop. The transcript is
   echoed back as `{"type": "transcription"}` so the candidate sees their own
   words immediately.
5. **Run the agent.** `agent.ainvoke(state, config)` executes the graph below.
6. **Reply.** The server sends `{"type": "response"}` with the reply text and
   completion flags, then — only for audio turns — a binary frame of synthesized
   speech.
7. **Close out.** When the agent sets `interview_complete`, the report node
   renders a PDF, uploads it to Cloud Storage, and records the location in the
   checkpointer. The transcript and report JSON are written to the `interviews`
   row, and the candidate's status becomes `completed`. Later turns on a finished
   thread are refused with `{"type": "interview_complete"}`.

### The agent graph

Compiled by `build_agent()` in `backend/app/agent/graph.py`:

```
START → intent_classifier ─┬→ clarify → END
                           ├→ interview_evaluator ─┬→ ask_question → END
                           │                       └→ close_interview → report_generator → END
                           └→ END
```

Each WebSocket turn is one pass through the graph, so `END` means "this turn is
done", not "the interview is over". `interview_evaluator_node` owns that
decision. It skips the LLM entirely for the first four questions, enforces a
per-type question ceiling (8 for HR, 10 behavioral, 12 technical), and applies
regex heuristics — `_is_refusal_or_pushback`, `_is_candidate_termination`,
`_is_substantive_answer` — to handle a candidate who stonewalls or asks to stop.

---

## Data model

Four tables, all string UUID primary keys, defined in `backend/app/models/`.

```
User (role: admin | candidate | recruiter)
 ├── jobs ──────────► Job (company_id → users.id)
 │                     ├── candidates ──► Candidate
 │                     └── interviews ──► Interview
 └── candidates ────► Candidate (user_id → users.id, job_id → jobs.id)
                       └── interviews ──► Interview (candidate_id, job_id)
```

| Table | Carries |
|---|---|
| `users` | email, password hash, role, company name; `is_admin` / `is_candidate` / `is_recruiter` properties |
| `jobs` | title, `raw_job_description` (fed to the agent), `structured_job_description` JSONB |
| `candidates` | **an application**, not a person: one row per user-job pair, plus `resume_text`, score, feedback, status |
| `interviews` | `interview_mode` (`live` / `mock`), type, difficulty, `report` JSONB, `transcript` JSONB, timestamps |

Every relationship is declared `lazy="raise"`. Touching one that wasn't eagerly
loaded raises instead of silently issuing blocking I/O under the async engine, so
queries must use the explicit `selectinload` graphs in
`backend/app/models/loading.py`. The `get_*_or_404` helpers already do.

Two Alembic revisions: `20260415_0001_initial_schema` and
`5b8c06e5c832_add_mock_interview_fields`. They run automatically at container
start, before uvicorn.

---

## Two ways an interview starts

**Recruiter pipeline.** A recruiter posts a job with a JD PDF
(`POST /api/v1/jobs`). A candidate applies with a résumé PDF
(`POST /api/v1/jobs/{id}/apply`), which creates the `candidates` row. The
recruiter then creates the interview (`POST /api/v1/interviews`) and reviews
transcripts and reports from the recruiter portal.

**Self-service mock.** `POST /api/v1/mock-interviews/start` takes an interview
type, difficulty, a résumé PDF and a JD (text or PDF), then creates a throwaway
job owned by a `system@audiobot.local` account, a candidate row, and an
interview with `interview_mode="mock"` — and seeds the checkpointer with the
system prompt for the chosen type. `/mock-interview` is public: an anonymous
visitor gets a guest account via `POST /api/v1/auth/guest`.

Guests are nominally capped at one interview, but **the cap is not a control.**
`mock_interviews.py` does check server-side, counting interviews belonging to the
calling guest account — yet `/auth/guest` mints a fresh account with a random
UUID on every call and carries no rate limit, so clearing `localStorage` yields a
new account and another interview. Treat it as friction.

### Roles

JWT bearer tokens, 30-minute default expiry. `backend/app/core/security.py`
exposes `get_current_user` plus `require_candidate`, `require_recruiter` and
`require_admin`; `authenticate_websocket_token` handles the query-parameter case.
Routes additionally scope rows by ownership: a candidate sees only their own
interviews, a recruiter only interviews for jobs their account owns, and admin
sees everything.

---

## Running locally

Two terminals. The backend first.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env        # then fill in real values
.venv\Scripts\alembic upgrade head
.venv\Scripts\python -m uvicorn app.main:app --reload
```

```powershell
cd frontend
npm install
npm run dev
```

The frontend serves on **http://localhost:5173** and proxies `/api` to
`http://localhost:8000` with `ws: true`, so WebSocket upgrades work without any
CORS setup and no frontend `.env` is needed in development. API docs at
http://localhost:8000/docs.

You need a Postgres URL, a Groq API key, and Google Cloud ADC for Vertex AI and
TTS (`gcloud auth application-default login`). Startup is deliberately
fail-fast: `backend/app/dependencies.py` builds the agent, STT and TTS clients at
import time and re-raises, so a missing credential stops the server rather than
surfacing on the first voice message.

Prompt work doesn't need the frontend at all — `backend/cli_chat.py` and
`backend/cli_audio.py` drive the agent from a terminal.

### Docker Compose

`backend/docker-compose.yml` brings up the backend, a local Postgres 15, and an
nginx container. Treat it as a convenience for one machine, not a portable
setup: it mounts a hardcoded Windows path for ADC credentials, and the nginx
service mounts `../frontend` (the source directory) as its web root rather than a
built `frontend/dist`, so it does not serve a working SPA as written.

### Tests

```powershell
cd backend;  .venv\Scripts\pytest     # 51 tests
cd frontend; npm test                 # 5 tests, vitest single pass
```

The backend suite needs no credentials and no network: `dotenv.load_dotenv` is
stubbed out and the Groq, Vertex AI and TTS clients are all faked. It passes in
forward and reverse module order, and every module passes standalone — worth
keeping that way, because several of these tests install fakes into
`sys.modules` and an earlier version leaked a stub `langchain_core.messages`
across the whole session.

The frontend suite queries by accessible role and label, so renaming a button or
orphaning a `<label>` breaks it. That is intentional, and it has already caught a
real accessibility regression.

---

## Deployment

**Backend.** Pushing to `main` with changes under `backend/**` triggers
`.github/workflows/deploy-backend.yml`: run the pytest suite, then build the
image, tag it with the commit SHA and `latest`, push to Artifact Registry, and
deploy a new Cloud Run revision. The deploy job declares `needs: test`, so a red
suite stops the release before anything is built. Authentication uses Workload
Identity Federation — no long-lived service account key is stored in the repo.

**Frontend.** Vercel builds on push. `vercel.json` rewrites every path to
`/index.html` so deep links and refreshes survive client-side routing. Note that
**Vercel dashboard environment variables override `.env.production`**; if a
deployed bundle points at the wrong backend, check the dashboard first.
`frontend/dist/` is gitignored on purpose — it used to be committed, which
shipped a stale bundle with an old backend URL baked in.

### WebSockets on Cloud Run need two specific flags

The interview stream dies about 20 seconds after connecting unless both of these
hold:

- `--ws-ping-interval 3600 --ws-ping-timeout 3600` in the Dockerfile `CMD`.
  uvicorn 0.42 → 0.46 added keepalive pings to the `websockets-sansio`
  implementation; those server-to-client Ping frames don't survive Cloud Run's
  proxy, the pong never returns, and uvicorn tears the socket down at
  `interval + timeout`. Do not use `0` here — that makes the handshake return 502.
- `--no-cpu-throttling` in the workflow's `flags:` block. With CPU throttled the
  event loop is starved between requests and the socket is dropped anyway.

Neither is sufficient alone; both were verified by measurement.
**Read [backend/docs/websockets-on-cloud-run.md](backend/docs/websockets-on-cloud-run.md)
before touching the Dockerfile `CMD` or the deploy flags.**

### Supabase free tier pauses

A Supabase free project pauses after about seven days idle. The symptom is a
Cloud Run 503 with `(ENOTFOUND) tenant/user postgres.<ref> not found` in the
logs, and a crash-looping container — the entrypoint runs `alembic upgrade head`,
which cannot reach a paused database. Resuming the project in the Supabase
dashboard fixes it with no redeploy.

When reading production logs, read `jsonPayload.message`, not `textPayload`.
Logging is JSON in production, so `textPayload` is empty and application logs
appear to be missing entirely.

---

## Configuration

Per-variable detail lives in [backend/README.md](backend/README.md#configuration),
[frontend/README.md](frontend/README.md#environment-variables) and
`backend/.env.example`. The four that break things most often:

| Variable | Note |
|---|---|
| `DATABASE_URL` | Must be plain `postgresql://` — two drivers share it |
| `SECRET_KEY` | JWT signing; raises at startup outside development |
| `VERTEX_AI_LOCATION` | `us-central1`, independent of the Cloud Run region |
| `VITE_API_BASE_URL` | Frontend target; the Vercel dashboard overrides the file |

---

## Known rough edges

Verified against the repository, roughly in order of how much they matter.

- **Candidate PII is in git history.** Thirteen generated report PDFs and a
  sample résumé were committed earlier. They are untracked and gitignored now,
  but still reachable in history. If any of it is real candidate data, removing
  it needs `git filter-repo` and a force push.
- **`/docs` is publicly reachable in production**, exposing the full OpenAPI
  schema. Gating it means first adding an unauthenticated health endpoint: the
  Docker `HEALTHCHECK` curls `/docs`, and the only other health route
  (`/admin/health`) requires admin auth.
- **`POST /api/v1/auth/guest` is unauthenticated, unthrottled, and writes a row.**
  Rate limits are applied to `register`, `login` and the LLM health check, but
  not to this. Anyone can mint unlimited `users` rows, which both inflates the
  table and defeats the one-mock-interview guest cap.
- **`key.json` sits at the repo root, tracked and empty** (0 bytes, in every
  revision). No credential leaked, but the name invites someone to fill it in.
  Delete it and gitignore the path.
- **Alembic runs per instance at startup**, so concurrent cold starts can race.
  Fine at current traffic; move to a one-off migration job if that changes.
- **No linter anywhere.** No ESLint config, no ruff, no `lint` script, so style
  drifts between files.
- **Landing images are ~1.5 MB of unoptimized PNGs** (`ai-agent.png` 931 KB,
  `hero-dashboard.png` 618 KB). Worth converting to WebP.
- **`frontend/src/pages/ChatPage.jsx` is 771 lines** and owns socket lifecycle,
  recording, playback, transcript, code challenges and reports at once. The
  natural split is a `useInterviewSocket` hook.
- **Split branding**: the document title and landing page say "Noventra
  Analytics" while the in-app header says "AudioBot".
- **Reports are not durable without `GCP_REPORTS_BUCKET`.** The fallback writes
  to the container filesystem, which is ephemeral and per-instance on Cloud Run,
  so reports vanish on restart or 404 when another instance serves the download.
