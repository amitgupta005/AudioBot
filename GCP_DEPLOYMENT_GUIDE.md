# GCP Deployment Guide

This guide walks you through recreating the Google Cloud infrastructure for the
AudioBot backend from scratch. It exists because the original GCP project
(`audio-493721`) and all of its resources were deleted.

The backend is a FastAPI + LangGraph application that runs as a container on
**Cloud Run** and depends on several Google Cloud APIs. The React frontend is
deployed separately (Vercel) and simply points at the Cloud Run URL.

> Everything below was verified by reading the actual source code
> (`backend/app/**`, `Dockerfile`, `migrations/`, `requirements.lock`), not the
> README. Section 14 lists concrete inconsistencies found in the code that will
> bite you during deployment if you are not aware of them.

---

## 1. What the backend depends on

| Dependency | Where it is used | Google Cloud service |
|------------|------------------|----------------------|
| LLM (Gemini) | `app/agent/nodes.py` via `langchain-google-vertexai` | **Vertex AI** |
| Speech-to-Text | `app/audio/stt.py` (`google-cloud-speech`) | **Cloud Speech-to-Text** |
| Text-to-Speech | `app/audio/tts.py` (`google-cloud-texttospeech`) | **Cloud Text-to-Speech** |
| Report PDF storage | `app/reports/gcs.py` (`google-cloud-storage`) | **Cloud Storage** |
| App data (users/jobs/candidates/interviews) | SQLAlchemy async engine, driver **asyncpg** | **PostgreSQL** (Cloud SQL) |
| Conversation state (LangGraph checkpointer) | `app/agent/graph.py` `AsyncConnectionPool`, driver **psycopg3** | **same PostgreSQL** |
| Container hosting | `Dockerfile`, GitHub Actions | **Cloud Run** + **Artifact Registry** |
| CI/CD auth | `.github/workflows/deploy-backend.yml` | **Workload Identity Federation** + **IAM** |

> ⚠️ **Two Postgres drivers hit the same database.** The SQLAlchemy engine
> (`app/core/database.py`) and Alembic (`migrations/env.py`) rewrite the URL to
> `postgresql+asyncpg://` and use **asyncpg**, while the LangGraph checkpointer
> (`app/agent/graph.py`) opens a raw `psycopg` (psycopg3) pool using
> `DATABASE_URL` **as-is**. This has a hard requirement on the URL scheme — see
> section 5.

> The original values were: project `audio-493721` (project number
> `289029706456`), region `asia-south1`, Artifact Registry repo `audiobot-repo`,
> Cloud Run service `audiobot-backend`, deploy service account
> `github-deployer@audio-493721.iam.gserviceaccount.com`, and frontend URL
> `https://audiobot-backend-289029706456.asia-south1.run.app`. Reuse these names
> or pick new ones — just keep them consistent across this guide, the GitHub
> Actions workflow, and `frontend/.env.production`.

---

## 2. Prerequisites

- A Google account with billing enabled.
- [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installed and
  authenticated: `gcloud auth login`.
- Docker installed (only needed for local image builds; CI builds in GitHub).

Set some shell variables you will reuse (values shown match the original setup —
change them if you want a fresh naming scheme):

```bash
export PROJECT_ID="audiobot-$(date +%s)"   # must be globally unique
export REGION="asia-south1"
export REPO="audiobot-repo"
export SERVICE="audiobot-backend"
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE"
```

---

## 3. Create the project and enable APIs

```bash
gcloud projects create "$PROJECT_ID" --name="AudioBot"
gcloud config set project "$PROJECT_ID"

# Link billing (find your billing account id with: gcloud billing accounts list)
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX

# Enable every API the app needs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  speech.googleapis.com \
  texttospeech.googleapis.com \
  storage.googleapis.com \
  sqladmin.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com
```

- `aiplatform.googleapis.com` = Vertex AI (Gemini models).
- `iamcredentials.googleapis.com` is required for Workload Identity Federation
  used by the CI/CD pipeline.

---

## 4. Create the Artifact Registry repository

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="AudioBot backend images"
```

---

## 5. Provision PostgreSQL — and get the connection string right

The app needs one Postgres database that serves **both** the SQLAlchemy layer
(asyncpg) and the LangGraph checkpointer (psycopg3).

```bash
gcloud sql instances create audiobot-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="$REGION"

gcloud sql databases create audiobot --instance=audiobot-db

gcloud sql users create audiobot_user \
  --instance=audiobot-db \
  --password="CHANGE_ME_STRONG_PASSWORD"
```

Note the instance connection name: `PROJECT_ID:REGION:audiobot-db`.

### ⚠️ Critical: the `DATABASE_URL` scheme

The value of `DATABASE_URL` **must start with plain `postgresql://`**. Do not use
`postgresql+asyncpg://` or `postgresql+psycopg://`. Here is exactly why, from the
code:

- `app/core/database.py` and `migrations/env.py` do
  `DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")` — they add the
  asyncpg driver themselves. If you pre-add it, the string won't match and things
  break; worse, the checkpointer breaks (below).
- `app/agent/graph.py` passes `DATABASE_URL` **unmodified** to a psycopg3
  `AsyncConnectionPool`. psycopg cannot parse a SQLAlchemy-style
  `postgresql+asyncpg://` DSN.

So plain `postgresql://` is the only scheme that satisfies both consumers.

**Using the Cloud SQL unix socket** (recommended with `--add-cloudsql-instances`):

```
postgresql://audiobot_user:PASSWORD@/audiobot?host=/cloudsql/PROJECT_ID:REGION:audiobot-db
```

Both asyncpg and libpq/psycopg3 accept the `host` query parameter, so this single
socket-style DSN works for both drivers.

> If you hit driver-specific socket issues, the low-risk fallback is TCP: run the
> [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy)
> as a sidecar (or use a private IP) and use
> `postgresql://audiobot_user:PASSWORD@127.0.0.1:5432/audiobot`.

> Alternative managed Postgres (Supabase, Neon, RDS) works too — just supply a
> plain `postgresql://user:pass@host:5432/audiobot` URL and skip the Cloud SQL
> attachment in step 8. The repo already lists `supabase` as a dev dependency.

---

## 6. Create the Cloud Storage bucket for reports

Interview report PDFs are uploaded here (`GCP_REPORTS_BUCKET`).

```bash
gcloud storage buckets create gs://$PROJECT_ID-reports \
  --location="$REGION" \
  --uniform-bucket-level-access
```

> **This bucket is effectively required in production.** See section 14: without
> `GCP_REPORTS_BUCKET`, PDFs fall back to a container-local directory that is
> ephemeral and per-instance on Cloud Run, so report downloads will 404 after a
> restart or when a different instance serves the request.

---

## 7. Create the runtime service account

This is the identity the **running** Cloud Run service uses. All Google clients
in the app authenticate via Application Default Credentials (ADC), which on Cloud
Run resolves to this attached service account automatically — **no `key.json` is
needed in the container.**

```bash
gcloud iam service-accounts create audiobot-runtime \
  --display-name="AudioBot Cloud Run runtime"

export RUNTIME_SA="audiobot-runtime@$PROJECT_ID.iam.gserviceaccount.com"

for role in \
  roles/aiplatform.user \
  roles/speech.client \
  roles/cloudsql.client \
  roles/storage.objectAdmin ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="$role"
done
```

> Cloud Text-to-Speech has no narrow predefined client role; access works once
> the API is enabled and the runtime SA is a project member. If you hit
> permission errors, grant `roles/serviceusage.serviceUsageConsumer`.

---

## 8. Deploy the backend to Cloud Run

### 8a. Build and push the image manually (first deploy)

```bash
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build -t "$IMAGE:latest" ./backend
docker push "$IMAGE:latest"
```

### 8b. Deploy the service

```bash
gcloud run deploy "$SERVICE" \
  --image="$IMAGE:latest" \
  --region="$REGION" \
  --platform=managed \
  --service-account="$RUNTIME_SA" \
  --allow-unauthenticated \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:audiobot-db" \
  --set-env-vars="ENVIRONMENT=production" \
  --set-env-vars="VERTEX_AI_PROJECT=$PROJECT_ID" \
  --set-env-vars="VERTEX_AI_LOCATION=us-central1" \
  --set-env-vars="VERTEX_AI_MODEL_CHAT=gemini-2.5-flash" \
  --set-env-vars="VERTEX_AI_MODEL_REASONING=gemini-2.5-flash" \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID" \
  --set-env-vars="GCP_REPORTS_BUCKET=$PROJECT_ID-reports" \
  --set-env-vars="CORS_ALLOW_ORIGINS=https://YOUR-FRONTEND.vercel.app" \
  --set-env-vars="^@^DATABASE_URL=postgresql://audiobot_user:PASSWORD@/audiobot?host=/cloudsql/$PROJECT_ID:$REGION:audiobot-db" \
  --set-env-vars="SECRET_KEY=$(python -c 'import secrets;print(secrets.token_urlsafe(32))')"
```

Key points:
- **Do not set `GOOGLE_APPLICATION_CREDENTIALS`.** ADC uses the attached runtime
  service account automatically. (The `key.json` mount in `docker-compose.yml` is
  a *local dev* convenience only.)
- `--allow-unauthenticated` is required because the browser connects directly,
  including the WebSocket at `/api/v1/interviews/{id}/stream`. Auth is enforced
  inside the app via JWT (`app/core/security.py`), including for the WebSocket
  (token passed as `?token=`).
- The `DATABASE_URL` value contains `:` and `/`; the `^@^` prefix changes the
  `gcloud` delimiter to `@` so the URL isn't split on commas. Keep the scheme as
  plain `postgresql://` (section 5).
- The container entrypoint runs `alembic upgrade head` **before** starting
  Uvicorn, so migrations apply automatically on every deploy/cold start.
- Vertex AI location (`us-central1`) is independent of the Cloud Run region
  (`asia-south1`); that mismatch is intentional and fine.

> **Security note:** passing `SECRET_KEY` and the DB password as plain env vars is
> convenient but not ideal. For production, store them in **Secret Manager** and
> reference them with `--set-secrets`. Note also that FastAPI's `/docs` is left
> enabled even in production (used by the Docker healthcheck) — lock it down if
> you don't want a public schema.

After deploy, note the service URL (e.g.
`https://audiobot-backend-XXXXXXXX.asia-south1.run.app`).

---

## 9. Environment variables reference

Sourced from `app/config.py` and `backend/.env.example`.

| Variable | Purpose | Recommended value | Code default (⚠️ if unset) |
|----------|---------|-------------------|-----------------------------|
| `ENVIRONMENT` | App mode; must not be `development` in prod | `production` | `development` |
| `SECRET_KEY` | JWT signing key | 32+ random chars | dev-only key in dev; **raises at startup in prod if unset** |
| `DATABASE_URL` | Postgres URL — plain `postgresql://` only | see section 5 | `postgresql://user:password@localhost:5432/audiobot` |
| `VERTEX_AI_PROJECT` | GCP project for Gemini | `$PROJECT_ID` | `audio-493721` (**deleted project!**) |
| `VERTEX_AI_LOCATION` | Vertex region | `us-central1` | `us-central1` |
| `VERTEX_AI_MODEL_CHAT` | Chat model | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `VERTEX_AI_MODEL_REASONING` | Reasoning/report model | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `GCP_PROJECT_ID` | Project for Cloud Storage | `$PROJECT_ID` | `None` |
| `GCP_REPORTS_BUCKET` | Report PDF bucket (see §6/§14) | `$PROJECT_ID-reports` | `None` (local fallback) |
| `CORS_ALLOW_ORIGINS` | Comma-separated allowed origins | frontend URL | `http://localhost:3000,http://localhost:5173` |
| `CORS_ALLOW_CREDENTIALS` | Allow credentials | `true` | `true` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime (minutes) | `30` | `30` |
| `MOCK_INTERVIEW_COMPANY_NAME` | Label on mock interviews | any | `Noventra Practice Lab` |

> Note: `backend/.env.example` still lists `VERTEX_AI_PROJECT=audio-493721`
> (deleted) and `gemini-1.5-flash` / `gemini-1.5-pro`, which disagree with the
> `config.py` defaults (`gemini-2.5-flash` for both). Always set these explicitly.

---

## 10. Point the frontend at the new backend

`frontend/.env.production` currently reads:

```
VITE_API_BASE_URL=https://audiobot-backend-289029706456.asia-south1.run.app
```

That URL belongs to the deleted project. Update it to your new Cloud Run URL,
commit, and redeploy the frontend (Vercel). The API client
(`frontend/src/lib/api.js`) derives the WebSocket URL by swapping `https`→`wss`,
so no separate WS variable is needed. Add the frontend origin to
`CORS_ALLOW_ORIGINS` on the backend (step 8).

---

## 11. Set up CI/CD (Workload Identity Federation)

Automated deploys are documented in [`CICD_PIPELINE.md`](./CICD_PIPELINE.md),
including the "Recreating the GCP side" commands for the WIF pool/provider and
the `github-deployer` service account.

---

## 12. Smoke test

```bash
curl -f https://<your-cloud-run-url>/docs
gcloud run services logs read "$SERVICE" --region="$REGION"
```

If `/docs` returns HTML, FastAPI is up. Then log in from the frontend and start a
mock interview to exercise Vertex AI, STT, and TTS end to end, and download the
report PDF to confirm the GCS path works.

---

## 13. Teardown (to avoid charges)

```bash
gcloud run services delete "$SERVICE" --region="$REGION"
gcloud sql instances delete audiobot-db
gcloud storage rm --recursive gs://$PROJECT_ID-reports
gcloud artifacts repositories delete "$REPO" --location="$REGION"
# Or nuke everything:
gcloud projects delete "$PROJECT_ID"
```

---

## 14. Codebase findings & inconsistencies (verified)

These were confirmed by reading the code. Address them before or during
deployment.

1. **Dual DB driver, one URL (highest impact).**
   `app/core/database.py` + `migrations/env.py` use **asyncpg** (they rewrite the
   scheme), while `app/agent/graph.py` uses a **psycopg3** pool with the raw URL.
   `DATABASE_URL` must therefore be plain `postgresql://…`. Any other scheme
   breaks one of the two subsystems. Both `asyncpg` and `psycopg[binary,pool]`
   are pinned in `requirements.lock` (`asyncpg==0.31.0`, `psycopg==3.3.4`), so
   the image has both drivers.

2. **Report storage is not durable without GCS.**
   `app/reports/pdf.py` uploads to GCS only when `GCP_REPORTS_BUCKET` is set;
   otherwise it writes to `REPORTS_DIR` (default: a directory inside the app).
   The download endpoint (`app/routers/interviews.py`) then does
   `os.path.exists(...)` on that path. On Cloud Run the filesystem is ephemeral
   and per-instance, so local-only reports will disappear on restart or fail to
   download from a different instance. **Set `GCP_REPORTS_BUCKET` in production.**

3. **Defaults reference the deleted project.**
   `config.py` defaults `VERTEX_AI_PROJECT="audio-493721"`. If you forget to set
   it, Vertex AI calls target a project that no longer exists. Always set
   `VERTEX_AI_PROJECT` and `GCP_PROJECT_ID` explicitly.

4. **Model name drift between `.env.example` and `config.py`.**
   `.env.example` says `gemini-1.5-flash` / `gemini-1.5-pro`; `config.py` defaults
   to `gemini-2.5-flash` for both chat and reasoning. Pick one deliberately and
   set both env vars. (Both roles default to the same model, which is fine but
   worth knowing — the "reasoning" path just gets a larger token budget.)

5. **`pyproject.toml` lists an unused driver.**
   It declares both `psycopg[binary,pool]` (psycopg3, actually used) and
   `psycopg2-binary` (not used anywhere in `app/`). Harmless, but the lock file
   used by the Docker build is the real source of truth.

6. **Docker `HEALTHCHECK` targets `/docs`.**
   Cloud Run ignores the Docker `HEALTHCHECK` and uses its own probes, so this is
   only relevant for local `docker compose`. `/docs` also implies the OpenAPI UI
   is publicly reachable in production.

7. **Migrations run at container start, per instance.**
   The entrypoint runs `alembic upgrade head` before Uvicorn. With multiple cold
   starts this can run concurrently; Alembic is not built for concurrent runners.
   For most low-traffic deploys this is fine, but for safety you can run
   migrations as a one-off job and remove them from the entrypoint.

8. **STT config sends no encoding/sample rate.**
   `app/audio/stt.py` builds `RecognitionConfig(language_code=...)` only, relying
   on Google to auto-detect the browser's audio format. Not a deployment blocker,
   but a source of transcription failures if the frontend changes its recording
   format.
