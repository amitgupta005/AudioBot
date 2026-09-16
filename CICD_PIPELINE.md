# CI/CD Pipeline

Yes — this project has a CI/CD pipeline. It is a **GitHub Actions** workflow that
builds the backend container and deploys it to **Google Cloud Run**.

- **Workflow file:** [`.github/workflows/deploy-backend.yml`](./.github/workflows/deploy-backend.yml)
- **Scope:** backend only. The frontend is deployed separately via Vercel
  (`frontend/vercel.json`), not by this pipeline.

> ⚠️ Because the original GCP project (`audio-493721`) was deleted, this pipeline
> **will fail** until you recreate the Google Cloud side (project, Artifact
> Registry, Workload Identity Federation, and the deployer service account). See
> the last section, "Recreating the GCP side", and
> [`GCP_DEPLOYMENT_GUIDE.md`](./GCP_DEPLOYMENT_GUIDE.md).

---

## 1. What it does

On a qualifying push it:

1. Checks out the repo.
2. Authenticates to Google Cloud using **Workload Identity Federation** (no
   long-lived JSON key stored in GitHub).
3. Sets up the `gcloud` CLI and configures Docker to push to Artifact Registry.
4. Builds the Docker image from `./backend` and tags it twice — with the commit
   SHA and with `latest`.
5. Pushes both tags to Artifact Registry.
6. Deploys the SHA-tagged image to the Cloud Run service.

Because each image is tagged with the immutable commit SHA, every deploy is
traceable to an exact commit, and rollbacks are just a redeploy of an older SHA.

---

## 2. When it runs (triggers)

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/deploy-backend.yml'
  workflow_dispatch:
```

- **Automatic:** a push to `main` that touches anything under `backend/` or the
  workflow file itself. Pushes that only change the frontend or docs will **not**
  trigger a deploy.
- **Manual:** `workflow_dispatch` lets you trigger it by hand from the GitHub UI
  (see "How to use" below).

---

## 3. Configuration (env block)

```yaml
env:
  PROJECT_ID: audio-493721
  REGION: asia-south1
  SERVICE: audiobot-backend
  IMAGE: asia-south1-docker.pkg.dev/audio-493721/audiobot-repo/audiobot-backend
```

| Key | Meaning |
|-----|---------|
| `PROJECT_ID` | Target GCP project |
| `REGION` | Cloud Run + Artifact Registry region |
| `SERVICE` | Cloud Run service name |
| `IMAGE` | Fully-qualified Artifact Registry image path |

All four still reference the **deleted** project `audio-493721`. Update them to
your new project/region/repo before the pipeline can work again.

---

## 4. How authentication works

```yaml
permissions:
  contents: read
  id-token: write   # required to mint the OIDC token for WIF

- id: auth
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: projects/289029706456/locations/global/workloadIdentityPools/github-pool/providers/github-provider
    service_account: github-deployer@audio-493721.iam.gserviceaccount.com
```

Instead of storing a service-account key, GitHub issues a short-lived OIDC token
that Google exchanges — via the **Workload Identity Pool/Provider** — for
credentials to impersonate the `github-deployer` service account. The
`id-token: write` permission is what allows GitHub to mint that OIDC token.

Both the provider path (project number `289029706456`) and the service account
belonged to the deleted project, so both must be recreated.

---

## 5. Build and deploy steps

```yaml
- name: Build & Push
  run: |
    docker build \
      -t ${{ env.IMAGE }}:${{ github.sha }} \
      -t ${{ env.IMAGE }}:latest \
      ./backend
    docker push ${{ env.IMAGE }}:${{ github.sha }}
    docker push ${{ env.IMAGE }}:latest

- name: Deploy
  uses: google-github-actions/deploy-cloudrun@v2
  with:
    service: ${{ env.SERVICE }}
    region: ${{ env.REGION }}
    image: ${{ env.IMAGE }}:${{ github.sha }}
```

The image is built from `backend/Dockerfile`, which installs pinned
dependencies from `backend/requirements.lock` (not the unpinned
`requirements.txt`), so CI builds are reproducible. The container runs as a
non-root `appuser`.

That Dockerfile's entrypoint runs `alembic upgrade head` before starting
Uvicorn, so **database migrations apply automatically** as part of every deploy
— the pipeline does not run migrations as a separate step. (Caveat: migrations
run per instance at cold start; see `GCP_DEPLOYMENT_GUIDE.md` section 14 #7.)

Note: the deploy step does **not** set environment variables. Runtime config
(`DATABASE_URL`, `SECRET_KEY`, Vertex/CORS settings, `GCP_REPORTS_BUCKET`, etc.)
must already be configured on the Cloud Run service (see
`GCP_DEPLOYMENT_GUIDE.md` sections 8–9). `deploy-cloudrun` preserves the
service's existing env vars across deploys, so a **first** automated deploy will
only work if the service was already created and configured once (e.g. via the
manual `gcloud run deploy` in the deployment guide).

Two config values are especially easy to get wrong and are documented in the
deployment guide's findings section (14): `DATABASE_URL` must use the plain
`postgresql://` scheme (two different DB drivers consume it), and
`GCP_REPORTS_BUCKET` must be set or report downloads break on Cloud Run. The
pipeline does not manage or validate these.

---

## 6. How to use it

### Automatic deploy (normal workflow)

1. Make backend changes on a branch.
2. Merge/push to `main`.
3. If the change touched `backend/**`, the workflow runs automatically.
4. Watch progress under the repo's **Actions** tab → "Deploy Backend to Cloud Run".

### Manual deploy

1. Go to the GitHub repo → **Actions** tab.
2. Select **Deploy Backend to Cloud Run** in the left sidebar.
3. Click **Run workflow**, choose the `main` branch, and confirm.

This uses the `workflow_dispatch` trigger and is handy for redeploying without a
code change (e.g., after updating Cloud Run env vars).

### Rollback

Redeploy a previous image by its SHA tag:

```bash
gcloud run deploy audiobot-backend \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/audiobot-repo/audiobot-backend:<OLD_SHA> \
  --region=<REGION>
```

---

## 7. Recreating the GCP side (required after project deletion)

The workflow needs three things to exist in your new GCP project. Run these
after completing steps 1–4 of `GCP_DEPLOYMENT_GUIDE.md`.

```bash
# Reuse the variables from the deployment guide
export PROJECT_ID="<your-new-project>"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# 1. Deployer service account
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions deployer"
export DEPLOYER_SA="github-deployer@$PROJECT_ID.iam.gserviceaccount.com"

# Roles needed to push images and deploy Cloud Run
for role in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER_SA" \
    --role="$role"
done

# 2. Workload Identity Pool + Provider
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='<YOUR_GITHUB_ORG>/<YOUR_REPO>'"

# 3. Let the GitHub repo impersonate the deployer SA
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attributes.repository/<YOUR_GITHUB_ORG>/<YOUR_REPO>"
```

Then update `deploy-backend.yml` to match your new project:

- `env.PROJECT_ID`, `env.REGION`, `env.IMAGE`
- `workload_identity_provider` → `projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `service_account` → `github-deployer@$PROJECT_ID.iam.gserviceaccount.com`

The `attribute-condition` restricting to your specific repo is an important
security control — it prevents other GitHub repos from impersonating your
deployer service account.

---

## 8. Gaps worth noting

- **No tests run in the pipeline.** The repo has backend tests (`backend/tests/`)
  and frontend tests (`frontend/src/test/`), but the workflow builds and deploys
  without running them. Consider adding a test job that must pass before deploy.
- **No frontend pipeline.** Frontend deploys rely on Vercel's own
  git integration, not this workflow.
- **Env vars are managed out-of-band.** Runtime secrets live on the Cloud Run
  service, not in the pipeline, so a fresh service must be configured before the
  first automated deploy succeeds.
