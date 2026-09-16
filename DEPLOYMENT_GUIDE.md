# Deployment Guide

This guide covers everything needed to deploy the AudioBot backend from scratch:
infrastructure setup, CI/CD pipeline, environment variables, and operational notes.

The backend is a FastAPI + LangGraph application running on **Google Cloud Run**.
The database is hosted on **Supabase** (managed Postgres). STT uses **Groq Whisper**,
TTS uses **Google Cloud Text-to-Speech**, and the LLM is **Gemini via Vertex AI**.
The React frontend is deployed separately on **Vercel**.

---

## 1. Architecture & dependencies

| Component | Service | Notes |
|-----------|---------|-------|
| LLM (Gemini) | Vertex AI | `langchain-google-vertexai`, model `gemini-2.5-flash` |
| Speech-to-Text | Groq Whisper | `groq` SDK, model `whisper-large-v3-turbo`, free tier |
| Text-to-Speech | Google Cloud TTS | `google-cloud-texttospeech`, Neural2 voice, 1M chars/month free |
| Report PDF storage | Google Cloud Storage | `google-cloud-storage`, bucket name in `GCP_REPORTS_BUCKET` |
| App data (users/jobs/candidates/interviews) | Supabase (Postgres) | SQLAlchemy + asyncpg |
| Conversation state (LangGraph checkpointer) | Supabase (Postgres, same DB) | psycopg3 pool |
| Container hosting | Cloud Run + Artifact Registry | auto-scales to zero |
| CI/CD auth | Workload Identity Federation + IAM | no long-lived keys stored in GitHub |
| Frontend | Vercel | git integration, independent of this pipeline |

> ⚠️ **Two Postgres drivers connect to the same Supabase database.** `database.py`
> and `migrations/env.py` rewrite the URL to `postgresql+asyncpg://`, while
> `graph.py` passes `DATABASE_URL` raw to a psycopg3 pool. `DATABASE_URL` must
> therefore always start with plain `postgresql://`. See section 4.

---

## 2. Prerequisites

- A Google account with billing enabled
- [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installed: `gcloud auth login`
- A [Supabase](https://supabase.com) account (free)
- A [Groq](https://console.groq.com) account (free)
- Docker (only needed for local image builds; CI builds via GitHub Actions)
- [`gh` CLI](https://cli.github.com) (optional, for managing GitHub secrets)

Set shell variables you'll reuse throughout:

```bash
export PROJECT_ID="your-gcp-project-id"   # must be globally unique
export REGION="asia-south1"               # or whichever region you prefer
export REPO="audiobot-repo"
export SERVICE="audiobot-backend"
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE"
```

---

## 3. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
   - Region: pick the closest to your Cloud Run region (e.g. Singapore for `asia-south1`)
   - Use "Generate a password" for the DB password — copy it immediately
   - Security: uncheck "Enable Data API" and "Automatically expose new tables"; leave RLS off

2. Get the connection string: click **Connect** (top bar) → **Direct** tab → **Session pooler** → copy the URI (port `5432`).
   It looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

3. Run Alembic migrations to create all tables:
   ```bash
   cd backend
   DATABASE_URL="postgresql://..." alembic upgrade head
   ```

> **Why Session pooler, not Direct connection?** Direct connections use IPv6 by
> default. Cloud Run uses IPv4. The Session pooler works on IPv4 without needing a
> paid add-on, and `prepare_threshold=0` is already set in `graph.py`, which is
> required for PgBouncer compatibility.

---

## 4. The `DATABASE_URL` scheme — critical

The value **must start with plain `postgresql://`**. Never use
`postgresql+asyncpg://` or `postgresql+psycopg://`. Here's why:

- `app/core/database.py` and `migrations/env.py` call
  `.replace("postgresql://", "postgresql+asyncpg://")` — they add the driver
  prefix themselves.
- `app/agent/graph.py` passes the URL raw to a psycopg3 `AsyncConnectionPool`,
  which cannot parse SQLAlchemy-style driver prefixes.

So plain `postgresql://` is the only scheme that satisfies both consumers.

---

## 5. Groq (Speech-to-Text)

1. Create an account at [console.groq.com](https://console.groq.com)
2. Go to **API Keys** → **Create new key**
3. Set `GROQ_API_KEY` in your environment and in GitHub Actions secrets

Free tier: 28,800 audio seconds/day (~480 minutes/day) — enough for hundreds of
interviews per day before hitting limits.

---

## 6. GCP project setup

### 6a. Create the project and enable APIs

```bash
gcloud projects create "$PROJECT_ID" --name="AudioBot"
gcloud config set project "$PROJECT_ID"

# Link billing
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX

# Enable APIs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  texttospeech.googleapis.com \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com
```

Note: `speech.googleapis.com` (Cloud Speech-to-Text) is **not needed** — STT is
now handled by Groq. `sqladmin.googleapis.com` is also not needed — database is
on Supabase.

### 6b. Create the Artifact Registry repository

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="AudioBot backend images"
```

### 6c. Create the Cloud Storage bucket for report PDFs

```bash
gcloud storage buckets create gs://$PROJECT_ID-reports \
  --location="$REGION" \
  --uniform-bucket-level-access
```

> Without `GCP_REPORTS_BUCKET`, PDFs fall back to the container's local
> filesystem, which is ephemeral on Cloud Run. Report downloads will 404 after
> restarts or across instances. Always set this in production.

### 6d. Create the runtime service account

This is the identity the running Cloud Run service uses. ADC resolves it
automatically — no `key.json` needed.

```bash
gcloud iam service-accounts create audiobot-runtime \
  --display-name="AudioBot Cloud Run runtime"

export RUNTIME_SA="audiobot-runtime@$PROJECT_ID.iam.gserviceaccount.com"

for role in \
  roles/aiplatform.user \
  roles/storage.objectAdmin ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="$role"
done
```

Note: `roles/speech.client` and `roles/cloudsql.client` are no longer needed.
Cloud TTS has no narrow client role; it works once the API is enabled. If you
hit TTS permission errors, grant `roles/serviceusage.serviceUsageConsumer`.

---

## 7. Deploy to Cloud Run

### 7a. Build and push the image (first deploy / manual)

```bash
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build -t "$IMAGE:latest" ./backend
docker push "$IMAGE:latest"
```

### 7b. Deploy the service

```bash
gcloud run deploy "$SERVICE" \
  --image="$IMAGE:latest" \
  --region="$REGION" \
  --platform=managed \
  --service-account="$RUNTIME_SA" \
  --allow-unauthenticated \
  --set-env-vars="ENVIRONMENT=production" \
  --set-env-vars="VERTEX_AI_PROJECT=$PROJECT_ID" \
  --set-env-vars="VERTEX_AI_LOCATION=us-central1" \
  --set-env-vars="VERTEX_AI_MODEL_CHAT=gemini-2.5-flash" \
  --set-env-vars="VERTEX_AI_MODEL_REASONING=gemini-2.5-flash" \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID" \
  --set-env-vars="GCP_REPORTS_BUCKET=$PROJECT_ID-reports" \
  --set-env-vars="GROQ_API_KEY=YOUR_GROQ_API_KEY" \
  --set-env-vars="CORS_ALLOW_ORIGINS=https://YOUR-FRONTEND.vercel.app" \
  --set-env-vars="^@^DATABASE_URL=postgresql://..." \
  --set-env-vars="SECRET_KEY=$(python -c 'import secrets;print(secrets.token_urlsafe(32))')"
```

Key points:
- **Do not set `GOOGLE_APPLICATION_CREDENTIALS`** — ADC picks up the attached
  runtime service account automatically on Cloud Run.
- `--allow-unauthenticated` is required: the browser connects directly,
  including the WebSocket at `/api/v1/interviews/{id}/stream`. App-level auth is
  enforced via JWT in `app/core/security.py`.
- The `DATABASE_URL` value contains `:` and `/`; the `^@^` prefix changes the
  `gcloud` delimiter to `@` to prevent the URL being split on commas.
- The container entrypoint runs `alembic upgrade head` before starting Uvicorn,
  so migrations apply automatically on every deploy.
- Vertex AI location (`us-central1`) can differ from the Cloud Run region
  (`asia-south1`) — that's intentional and fine.

> For production, store `SECRET_KEY`, `DATABASE_URL`, and `GROQ_API_KEY` in
> **Secret Manager** and reference them with `--set-secrets` instead of
> `--set-env-vars`. FastAPI's `/docs` endpoint is publicly reachable in the
> current setup — consider disabling it if you don't want a public schema.

---

## 8. CI/CD pipeline

The GitHub Actions workflow at `.github/workflows/deploy-backend.yml` builds
the backend container and deploys it to Cloud Run automatically.

### When it runs

- **Automatic:** any push to `main` that touches `backend/**` or the workflow
  file itself
- **Manual:** via `workflow_dispatch` from the GitHub Actions UI

### What it does

1. Checks out the repo
2. Authenticates to GCP using **Workload Identity Federation** (no long-lived key)
3. Configures Docker for Artifact Registry
4. Builds and pushes the image tagged with both the commit SHA and `latest`
5. Deploys the SHA-tagged image to Cloud Run, injecting all runtime env vars
   from GitHub Actions secrets

SHA tagging means every deploy is traceable to an exact commit. Rollback is
just redeploying an older SHA tag.

### Setting up Workload Identity Federation (required once)

```bash
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# Deployer service account
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions deployer"
export DEPLOYER_SA="github-deployer@$PROJECT_ID.iam.gserviceaccount.com"

for role in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER_SA" \
    --role="$role"
done

# Workload Identity Pool + Provider
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='YOUR_GITHUB_ORG/YOUR_REPO'"

# Allow the repo to impersonate the deployer SA
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attributes.repository/YOUR_GITHUB_ORG/YOUR_REPO"
```

Then update `deploy-backend.yml`:
- `env.PROJECT_ID`, `env.REGION`, `env.IMAGE`
- `workload_identity_provider` → `projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `service_account` → `github-deployer@$PROJECT_ID.iam.gserviceaccount.com`

### GitHub Actions secrets required

Set these on the repo (Settings → Secrets → Actions), or via `gh secret set`:

| Secret | Value |
|--------|-------|
| `DATABASE_URL` | Supabase session pooler URI |
| `GROQ_API_KEY` | Groq API key |
| `SECRET_KEY` | 32+ random chars (`python -c "import secrets;print(secrets.token_urlsafe(32))"`) |
| `CORS_ALLOW_ORIGINS` | Comma-separated frontend origins |
| `GCP_REPORTS_BUCKET` | GCS bucket name for PDFs |

### Rollback

```bash
gcloud run deploy "$SERVICE" \
  --image="$IMAGE:<OLD_COMMIT_SHA>" \
  --region="$REGION"
```

---

## 9. Environment variables reference

Sourced from `app/config.py` and `backend/.env.example`.

| Variable | Purpose | Recommended value | Default if unset |
|----------|---------|-------------------|-----------------|
| `ENVIRONMENT` | App mode | `production` | `development` |
| `SECRET_KEY` | JWT signing key | 32+ random chars | dev-only key in dev; **raises at startup in prod** |
| `DATABASE_URL` | Postgres — plain `postgresql://` only | Supabase session pooler URI | local fallback |
| `GROQ_API_KEY` | Groq Whisper STT | your Groq key | — (STT will fail) |
| `VERTEX_AI_PROJECT` | GCP project for Gemini | `$PROJECT_ID` | `audio-493721` (deleted!) |
| `VERTEX_AI_LOCATION` | Vertex AI region | `us-central1` | `us-central1` |
| `VERTEX_AI_MODEL_CHAT` | Chat model | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `VERTEX_AI_MODEL_REASONING` | Report generation model | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `GCP_PROJECT_ID` | GCP project for Cloud Storage | `$PROJECT_ID` | `None` |
| `GCP_REPORTS_BUCKET` | PDF report bucket | `$PROJECT_ID-reports` | `None` (local fallback) |
| `CORS_ALLOW_ORIGINS` | Comma-separated allowed origins | frontend URL | `http://localhost:3000,...` |
| `CORS_ALLOW_CREDENTIALS` | Allow credentials | `true` | `true` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime | `1440` (24h) | `30` |
| `MOCK_INTERVIEW_COMPANY_NAME` | Label on mock interview UI | any | `Noventra Practice Lab` |

---

## 10. Point the frontend at the backend

After deploy, note your Cloud Run URL (e.g.
`https://audiobot-backend-XXXXXXXX.asia-south1.run.app`).

Update `frontend/.env.production`:

```
VITE_API_BASE_URL=https://audiobot-backend-XXXXXXXX.asia-south1.run.app
```

Commit and redeploy the frontend on Vercel. The API client (`frontend/src/lib/api.js`)
derives the WebSocket URL by swapping `https` → `wss`, so no separate WS variable
is needed. Add the frontend origin to `CORS_ALLOW_ORIGINS` on the backend.

---

## 11. Smoke test

```bash
curl -f https://<your-cloud-run-url>/docs
gcloud run services logs read "$SERVICE" --region="$REGION"
```

If `/docs` returns HTML, FastAPI is up. Then log in from the frontend, start a
mock interview to exercise Vertex AI, Groq STT, and Google TTS end to end, and
download the report PDF to confirm the GCS path works.

---

## 12. Estimated cost

At 100 interviews/month with the current stack:

| Service | Cost |
|---------|------|
| Supabase | $0 (free tier: 500 MB DB) |
| Groq STT | $0 (free tier: 28,800 sec/day) |
| Google TTS | $0 (free tier: 1M chars/month) |
| Vertex AI (Gemini 2.5 Flash) | ~$3.50 |
| Cloud Run | ~$0 (free tier: 2M req/month) |
| Cloud Storage (PDFs) | ~$0 |
| **Total** | **~$3.50/month** |

---

## 13. Teardown

```bash
gcloud run services delete "$SERVICE" --region="$REGION"
gcloud storage rm --recursive gs://$PROJECT_ID-reports
gcloud artifacts repositories delete "$REPO" --location="$REGION"
# Or delete the whole project:
gcloud projects delete "$PROJECT_ID"
```

Supabase: delete the project from the Supabase dashboard.

---

## 14. Known caveats

1. **Dual DB driver, one URL.** `database.py` and `migrations/env.py` use asyncpg
   (they rewrite the URL scheme themselves), while `graph.py` uses a psycopg3 pool
   with the raw URL. `DATABASE_URL` must be plain `postgresql://` — any other
   scheme breaks one of the two subsystems.

2. **Report storage is not durable without GCS.** Without `GCP_REPORTS_BUCKET`,
   PDFs are written to the container filesystem. On Cloud Run this is ephemeral and
   per-instance — reports disappear on restart or won't be found by other instances.
   Always set `GCP_REPORTS_BUCKET` in production.

3. **`VERTEX_AI_PROJECT` defaults to deleted project.** `config.py` defaults to
   `audio-493721`. Forgetting to override it causes all Gemini calls to fail.
   Always set `VERTEX_AI_PROJECT` and `GCP_PROJECT_ID` explicitly.

4. **Migrations run at container start, per instance.** The entrypoint runs
   `alembic upgrade head` before Uvicorn. For low-traffic deploys this is fine,
   but concurrent cold starts can race. For safety, run migrations as a one-off
   job and remove them from the entrypoint on high-traffic services.

5. **No tests in the CI pipeline.** The workflow builds and deploys without running
   the test suite (`backend/tests/`). Consider adding a test job that must pass
   before the deploy step runs.

6. **`/docs` is publicly accessible.** FastAPI's OpenAPI UI is not gated in
   production. Lock it down with an `ENVIRONMENT` check in `main.py` if you don't
   want a public schema.

7. **`psycopg2-binary` is listed but unused.** `pyproject.toml` declares both
   `psycopg[binary,pool]` (psycopg3, actually used) and `psycopg2-binary` (not
   used anywhere in `app/`). Harmless, but worth cleaning up.
