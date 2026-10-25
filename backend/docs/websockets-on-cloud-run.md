# WebSockets on Cloud Run

Runbook for the interview stream (`/api/v1/interviews/{id}/stream`). Written after
an incident where the socket closed ~20s after connecting and the interview UI
went silently dead.

Every number below was measured against the live service, not inferred.

---

## Required configuration

The stream needs **two** settings. Neither is sufficient alone, and both are
non-obvious, so they are declared in code rather than applied by hand.

| Setting | Where | Why |
|---|---|---|
| `--ws-ping-interval 3600 --ws-ping-timeout 3600` | `backend/Dockerfile` (`CMD`) | Disables uvicorn's WebSocket keepalive pings |
| `--no-cpu-throttling` | `.github/workflows/deploy-backend.yml` (`flags:`) | Keeps the asyncio loop alive between requests |

Supporting settings in the same `flags:` block: `--timeout=3600` (long
interviews), `--service-account=audiobot-runtime@…` (Vertex AI + GCS), and
`--allow-unauthenticated` (the browser connects directly; auth is enforced
in-app via JWT).

> Do **not** set the ping flags to `0`. uvicorn starts, `/docs` serves
> normally, but the WebSocket *handshake* returns 502. Use a large value.

---

## Root cause

**uvicorn 0.42 → 0.46 added WebSocket keepalive pings** to the
`websockets-sansio` implementation ([Kludex/uvicorn#2884][pr]). Version 0.42
sent none.

Those server→client Ping control frames do not survive Cloud Run's proxy. The
pong never comes back, so uvicorn tears the connection down at
`ws-ping-interval + ws-ping-timeout` (20s + 20s by default). The browser sees an
abrupt **1006** close with no close frame, roughly 20s after connecting.

Separately, with **CPU throttling** enabled (the Cloud Run default), the
container is starved of CPU between requests. The event loop stops servicing the
socket and Cloud Run drops it regardless of ping settings.

Because both the uvicorn bump and a GCP project migration landed in the same
commit range, this looked like the new GCP project was at fault. It was not.
Supabase, Groq, and IAM were never involved.

[pr]: https://github.com/Kludex/uvicorn/pull/2884

---

## Evidence

| uvicorn pings | Cloud Run CPU | Result |
|---|---|---|
| 20s (default) | throttled | died 12–22s |
| 5s | throttled | died 12.5s (sooner) |
| 20s (default) | always allocated | died 21–62s |
| disabled | throttled | died 23.8s |
| **disabled** | **always allocated** | **survived 150s+** |

Controls that ruled out other causes:

- **localhost, pings every 5s** — never dropped. Pings and pongs both logged
  cleanly. No proxy in the path.
- **third-party WSS endpoint, same machine and network** — held 181s+. The
  local network was not the problem.
- **Cloud Run request logs** — status `101`, `HTTP/1.1`, durations of 40.4s and
  40.5s, i.e. exactly `ping_interval(20) + ping_timeout(20)`.

A shorter ping interval made failures happen *sooner*, which is what ruled out
"idle timeout" and pointed at the ping frames themselves.

---

## Diagnosing

### Read the logs correctly

`setup_logging()` emits **JSON in production**, so application logs land in
Cloud Logging's `jsonPayload`, not `textPayload`. Filtering on `textPayload`
shows only uvicorn/system lines and makes the app look silent — this wasted
significant time during the original investigation.

```powershell
$f = 'resource.type=cloud_run_revision AND resource.labels.service_name="audiobot-backend"'
gcloud logging read $f --project=black-moon-508816-a8 --limit=40 --freshness=30m `
  --format="csv[no-heading](timestamp,resource.labels.revision_name,textPayload,jsonPayload.message)"
```

### Symptom map

| Symptom | Likely cause |
|---|---|
| Socket opens, dies ~20s, code 1006 | Ping flags or `--no-cpu-throttling` missing |
| `/docs` 200 but WS handshake 502 | Ping flags set to `0` |
| 503 on every request; logs show `(ENOTFOUND) tenant/user … not found` | Supabase project paused — see below |
| Socket closes immediately, no handler log | Expired/invalid JWT; expect a `type: auth_error` payload |
| Send and Record buttons dead, no error shown | Socket closed; the client gates both on `socketState === "open"` |

### Supabase free tier pauses after ~7 days idle

Migrations run at container startup (`alembic upgrade head` in the entrypoint),
so a paused database means the container **cannot boot at all** — not merely
degraded database features. Cloud Run returns 503 and the container crash-loops.

Resume the project in the Supabase dashboard. No redeploy is needed: Cloud Run
starts a fresh container on the next request. The revision config is never
damaged by a crash loop.

---

## Verifying a fix

Simulate a browser exactly: **no client-initiated pings**, because browsers
cannot send WebSocket pings (the JS API does not expose them). A Python client
sends them by default, which masks and changes the behaviour.

```python
# ping_interval=None mirrors a browser
async with websockets.connect(url, ping_interval=None) as ws:
    ...
```

Surviving 90s is decisive, since every pre-fix failure died in under 24s.

Confirm live configuration:

```powershell
gcloud run services describe audiobot-backend --region=asia-south1 `
  --project=black-moon-508816-a8 `
  --format="value(status.latestReadyRevisionName,spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'],spec.template.spec.timeoutSeconds)"
```

Expect `cpu-throttling` = `false` and `timeoutSeconds` = `3600`.

---

## Container command overrides

A `--command`/`--args` override on the service **shadows the image `CMD`**, so
Dockerfile changes appear to have no effect. Check for one with:

```powershell
gcloud run services describe audiobot-backend --region=asia-south1 `
  --project=black-moon-508816-a8 `
  --format="yaml(spec.template.spec.containers[0].command,spec.template.spec.containers[0].args)"
```

There is no `--clear-args` flag. Reset by passing empty strings:

```powershell
gcloud run services update audiobot-backend --region=asia-south1 `
  --project=black-moon-508816-a8 --command="" --args=""
```

Order matters: only clear the override **after** an image containing the ping
flags has deployed, or the service reverts to default pings and the bug returns.

---

## Client behaviour

`frontend/src/pages/ChatPage.jsx` reconnects automatically with exponential
backoff (1s → 30s cap) and releases `sendLockRef`, `sending`, and `recording` on
close, so a dropped connection can no longer leave the composer permanently
locked. Conversation state is safe across reconnects because LangGraph keys the
checkpointer on `thread_id = interview_id`.

Auth failures are treated as fatal and stop the retry loop — reconnecting with a
token the server already rejected would loop forever.

---

## Rollback

Images are tagged with the commit SHA, so rollback is a redeploy:

```powershell
gcloud run deploy audiobot-backend --region=asia-south1 `
  --project=black-moon-508816-a8 `
  --image=asia-south1-docker.pkg.dev/black-moon-508816-a8/audiobot-repo/audiobot-backend:<OLD_SHA>
```

This inherits the service's current flags. If the service is ever recreated from
scratch, re-apply the `flags:` values from the workflow.

---

## Cost note

`--no-cpu-throttling` bills CPU for an instance's whole lifetime rather than
only during request processing. With min-instances at 0 the service still scales
to zero, so the impact is modest at low volume. It is not optional here: without
it the interview stream does not stay connected.
