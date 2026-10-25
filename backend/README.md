# AudioBot Backend

FastAPI + LangGraph service that runs AI interview sessions over a WebSocket.
It transcribes a candidate's speech, drives a stateful interview agent, speaks
the interviewer's replies back, and produces a scored PDF report.

The React frontend lives in `../frontend` and is deployed separately.

---

## Stack

| Concern | Choice |
|---|---|
| API / transport | FastAPI, WebSocket for the live interview |
| Agent | LangGraph with a Postgres checkpointer |
| LLM | Gemini (`gemini-2.5-flash`) via Vertex AI |
| Speech-to-text | Groq Whisper (`whisper-large-v3-turbo`) |
| Text-to-speech | Google Cloud Text-to-Speech |
| App database | Postgres (Supabase), SQLAlchemy async + asyncpg |
| Agent state | Same Postgres, via psycopg3 pool |
| Report storage | Google Cloud Storage, local directory as fallback |
| PDF parsing | pdfplumber |
| Rate limiting | slowapi |
| Hosting | Cloud Run, deployed by GitHub Actions |

---

## Layout

```
app/
  main.py            app factory, lifespan, CORS, rate limits, router wiring
  config.py          env loading, model names, interview system prompts
  dependencies.py    singletons: agent, stt, tts — built at import time
  websocket.py       interview stream: text, audio, code submissions, ping
  helpers.py         pagination, PDF extraction, get-or-404, checkpointer reads
  agent/
    graph.py         StateGraph wiring + psycopg3 pool for the checkpointer
    nodes.py         intent_classifier, clarify, interview_evaluator,
                     ask_question, close_interview, report_generator
    state.py         AgentState
    schema.py        structured-output models
  audio/
    stt.py           Groq Whisper
    tts.py           Google Cloud TTS
  core/
    database.py      async engine + AsyncSessionLocal
    security.py      JWT, password hashing, WebSocket auth
    logging.py       JSON logs in prod, coloured logs in dev
  models/
    users.py jobs.py candidates.py interviews.py
    loading.py       explicit selectinload graphs (see Async loading below)
  schemas/           Pydantic request/response models
  reports/
    pdf.py           report rendering
    gcs.py           upload to Cloud Storage
  routers/           see API below
migrations/          Alembic (2 revisions)
tests/               pytest suite
docs/                operational notes
notebooks/           exploration notebooks + sample PDFs (not shipped)
generated_reports/   local PDF fallback output (not shipped)
tmp/                 ad-hoc scripts, not collected by pytest (not shipped)
cli_chat.py          terminal chat against the agent (dev)
cli_audio.py         terminal audio loop (dev)
.dockerignore        keeps tests, notebooks, tmp, reports, *.md out of the image
```

---

## Agent flow

`build_agent()` in `app/agent/graph.py` compiles this graph:

```
START → intent_classifier ─┬→ clarify → END
                           ├→ interview_evaluator ─┬→ ask_question → END
                           │                       └→ close_interview → report_generator → END
                           └→ END
```

State is persisted by `AsyncPostgresSaver` keyed on `thread_id = interview_id`,
so a dropped WebSocket can reconnect and resume mid-interview without losing the
conversation. `interview_evaluator_node` decides whether to continue or close;
`report_generator_node` writes the PDF and records its location in the
checkpointer under `candidate_report_pdf`.

`nodes.py` also carries the conversational heuristics —
`_is_refusal_or_pushback`, `_is_candidate_termination`,
`_is_substantive_answer` — which drive recovery follow-ups and early exit.

### Startup is fail-fast

`app/dependencies.py` builds the agent, STT and TTS clients **at import time**
and re-raises on failure. A missing `GROQ_API_KEY`, for example, aborts startup
rather than failing on the first voice message. Combined with
`alembic upgrade head` in the entrypoint, an unreachable database or missing
credential means the container never becomes ready.

---

## API

All routes are under `/api/v1`. Interactive docs at `/docs`.

| Method | Path | Router |
|---|---|---|
| POST | `/auth/register` | `auth.py` |
| POST | `/auth/login` | `auth.py` |
| GET | `/auth/me` | `auth.py` |
| POST | `/auth/guest` | `auth.py` — one-off guest session used by the mock-interview flow |
| POST · GET | `/jobs` | `jobs.py` (create takes a multipart JD PDF) |
| GET · PATCH | `/jobs/{job_id}` | `jobs.py` |
| POST | `/jobs/{job_id}/apply` | `candidates.py` (multipart résumé) |
| GET | `/candidates` | `candidates.py` |
| GET · PATCH | `/candidates/{candidate_id}` | `candidates.py` |
| POST · GET | `/interviews` | `interviews.py` |
| GET · PATCH | `/interviews/{interview_id}` | `interviews.py` |
| GET | `/interviews/{interview_id}/report.pdf` | `interviews.py` |
| **WS** | `/interviews/{interview_id}/stream` | `interviews.py` → `websocket.py` |
| POST | `/mock-interviews/start` | `mock_interviews.py` |
| GET | `/conversations/{interview_id}` | `conversations.py` |
| GET | `/recruiter/jobs` | `recruiter.py` |
| GET | `/recruiter/jobs/{job_id}/candidates` | `recruiter.py` |
| GET | `/recruiter/interviews/{interview_id}/conversation` | `recruiter.py` |
| GET | `/admin/conversations` | `admin.py` — all admin routes require `require_admin` |
| GET | `/admin/conversations/{interview_id}` | `admin.py` |
| GET | `/admin/conversations/{interview_id}/report.pdf` | `admin.py` |
| GET | `/admin/health` | `admin.py` |
| GET | `/admin/health/llm` | `admin.py` — live Vertex AI check |

`candidates.py` declares full paths inline instead of using a router prefix,
which is why its routes span two groups above.

Rate limits are applied in `main.py` rather than on the routers: 10/min on
register, 5/min on login, 3/min on the LLM health check.

### Pagination

List endpoints wrap results via `build_paginated_response` in `helpers.py`:

```json
{ "items": [], "total": 0, "page": 1, "page_size": 20, "pages": 1 }
```

Defaults are `page_size` 20, max 100. The frontend tolerates both shapes with
`Array.isArray(data) ? data : data.items`.

### Interview stream

```
ws(s)://<host>/api/v1/interviews/{interview_id}/stream?token=<jwt>
```

The token is a query parameter because browsers cannot set an `Authorization`
header on a WebSocket handshake. Client messages:

| `type` | Payload | Behaviour |
|---|---|---|
| `text` | `message` | Runs the agent turn |
| `audio` | — | Followed by one binary frame; transcribed, then runs the turn and returns synthesized audio |
| `code_submit` | `code`, `language` | Records a submission (10 KB cap) and runs the turn |
| `ping` | — | Ignored before any DB work; tolerated as an app-level heartbeat |

Server replies are JSON with a `type` of `transcription`, `response`,
`interview_complete`, or `auth_error`, plus binary audio frames when the turn
came from speech. On auth failure the socket is accepted first so the browser
can read the reason, then closed with code 4003.

---

## Async loading

`app/models/loading.py` defines explicit `selectinload` tuples
(`JOB_FULL_GRAPH`, `CANDIDATE_FULL_GRAPH`, `INTERVIEW_FULL_GRAPH`, and narrower
variants). Pair them with explicit `select()` calls — as the `get_*_or_404`
helpers do — so relationship access never triggers lazy I/O, which raises under
the async engine.

---

## Local development

Requires Python 3.11+, a Postgres URL, and Google Cloud ADC for Vertex AI and
TTS (`gcloud auth application-default login`).

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env   # then fill in real values
.venv\Scripts\alembic upgrade head
.venv\Scripts\python -m uvicorn app.main:app --reload
```

Open http://localhost:8000/docs.

`requirements.txt` is unpinned for development. `requirements.lock` holds the
pinned set used by the Docker build — treat it as the source of truth for
anything that ships.

`cli_chat.py` and `cli_audio.py` drive the agent from a terminal without the
frontend, which is useful for prompt work.

### Docker Compose

`docker-compose.yml` brings up the backend, a local Postgres 15, and an nginx
container that serves the frontend and proxies `/api/`. Note that it mounts a
**Windows-specific absolute path** for ADC credentials and overrides
`DATABASE_URL` to the local `db` service, so it is a convenience for one machine
rather than a portable setup.

```powershell
docker compose up --build
```

### Tests

```powershell
.venv\Scripts\pytest
```

`pyproject.toml` sets `testpaths = ["tests"]` and `asyncio_mode = "auto"`.
Coverage spans the agent nodes, graph wiring, audio modules, dependencies, app
startup, admin routes, and both unit and integration WebSocket tests.

Scripts in `tmp/` are **not** collected, since they sit outside `testpaths`.

---

## Configuration

Full list with defaults in `app/config.py` and `.env.example`. The ones that
matter most:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | local Postgres | **Must be plain `postgresql://`** — see below |
| `GROQ_API_KEY` | none | Required; startup fails without it |
| `SECRET_KEY` | none | JWT signing. **Raises at startup** outside development |
| `ENVIRONMENT` | `development` | `production` switches logging to JSON |
| `VERTEX_AI_PROJECT` | `audio-493721` | A **deleted** project; always set explicitly |
| `VERTEX_AI_LOCATION` | `us-central1` | Independent of the Cloud Run region |
| `VERTEX_AI_MODEL_CHAT` | `gemini-2.5-flash` | |
| `VERTEX_AI_MODEL_REASONING` | `gemini-2.5-flash` | Same model; the reasoning path gets a larger token budget |
| `GCP_REPORTS_BUCKET` | none | Required in production, or reports are not durable |
| `GCP_PROJECT_ID` | none | Project for Cloud Storage |
| `CORS_ALLOW_ORIGINS` | localhost:3000,5173 | Comma-separated |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `MOCK_INTERVIEW_COMPANY_NAME` | `Noventra Practice Lab` | Label on mock sessions |
| `REPORTS_DIR` | `../generated_reports` | Local fallback when no bucket is set |

> **`DATABASE_URL` scheme.** Two drivers share one URL. `core/database.py` and
> `migrations/env.py` rewrite `postgresql://` to `postgresql+asyncpg://`
> themselves, while `agent/graph.py` hands the value to a psycopg3 pool
> unmodified. Plain `postgresql://` is the only scheme that satisfies both;
> anything else breaks one of them.

> **Report durability.** Without `GCP_REPORTS_BUCKET`, `reports/pdf.py` writes to
> `REPORTS_DIR` on the container filesystem, which is ephemeral and per-instance
> on Cloud Run. Reports then vanish on restart or 404 when another instance
> serves the download.

---

## Deployment

Pushing to `main` with changes under `backend/**` triggers
`.github/workflows/deploy-backend.yml`, which builds the image, tags it with the
commit SHA and `latest`, pushes to Artifact Registry, and deploys a new Cloud
Run revision. Authentication uses Workload Identity Federation, so no
long-lived key is stored.

Migrations run at container start: the entrypoint executes
`alembic upgrade head` before uvicorn. A new migration therefore applies
automatically on the next revision.

The deploy asserts required runtime flags on every run, including
`--no-cpu-throttling` and disabled uvicorn WebSocket pings. **Both are required
for the interview stream to stay connected** — the reasoning, evidence, and
troubleshooting steps are in
[`docs/websockets-on-cloud-run.md`](docs/websockets-on-cloud-run.md). Read that
before changing the Dockerfile `CMD` or the workflow's `flags:` block.

See [`../DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md) for provisioning a GCP
project from scratch.

---

## Rough edges

Verified against the repository, roughly in order of how much they matter.

- **No test job gates the deploy.** The workflow builds and ships straight to
  production. A container that fails to start leaves the previous revision
  serving, so this costs you early warning rather than availability. Adding a
  gate needs test-time `DATABASE_URL` and `GROQ_API_KEY` in CI.
- **`/docs` is publicly reachable in production**, so the full OpenAPI schema is
  exposed. Note the Docker `HEALTHCHECK` curls `/docs`, and the only other
  health route (`/admin/health`) requires admin auth — so gating `/docs` means
  adding an unauthenticated health endpoint first.
- **Alembic runs per instance at startup**, so concurrent cold starts can race.
  Fine at low traffic; split migrations into a one-off job if that changes.
- **`tests/cli_audio.py`** is a CLI script living in the test directory.
- **`notebooks/`, `generated_reports/` and `tmp/` are untracked but still on
  disk**, and remain in git history from earlier commits. If any of those
  reports or résumés are real candidate data, removing them from history needs
  a rewrite (`git filter-repo`) and a force push.

### Recently cleaned up

- Untracked `generated_reports/` (13 candidate report PDFs), the sample résumé
  and JD under `notebooks/`, the five scratch scripts in `tmp/`, and 10 stale
  `.pyc` files. All are now gitignored; the files remain on disk.
- Removed the unused `psycopg2-binary` declaration from `pyproject.toml`. The
  real driver is psycopg3 via `psycopg[binary,pool]`.
