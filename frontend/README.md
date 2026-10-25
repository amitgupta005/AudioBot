# AudioBot Frontend

React single-page app for the AudioBot interview platform. It serves a marketing
landing page, two authenticated portals (candidate and recruiter), and the live
interview room that streams audio and text over a WebSocket.

Built with Vite. Deployed on Vercel. Talks to the FastAPI backend in `../backend`.

---

## Stack

| Concern | Choice |
|---|---|
| UI | React 18.3 |
| Routing | react-router-dom 6.30 (`BrowserRouter`) |
| Build / dev server | Vite 6.3 |
| Code editor | `@monaco-editor/react` 4.7 |
| Tests | Vitest 3.1, Testing Library, jsdom |
| Styling | Hand-written CSS, no framework |
| State | React hooks + `localStorage` / `sessionStorage`. No Redux or context store |

---

## Layout

```
index.html              entry; title/meta use "Noventra Analytics" branding
vite.config.js          dev server on :5173, /api proxy, vitest config
vercel.json             build + SPA rewrite for Vercel
.env.production         VITE_API_BASE_URL for production builds
public/
  images/               landing page art (ai-agent.png, hero-dashboard.png)
src/
  main.jsx              StrictMode + BrowserRouter, imports styles.css
  App.jsx               routes, ProtectedRoute, global theme toggle
  styles.css            36 KB — the bulk of app styling
  landing.css           13 KB — landing page only
  pages/
    LandingPage.jsx     251 lines  public marketing page
    AuthPage.jsx        243 lines  sign in / register, portal switcher
    UploadPage.jsx      292 lines  candidate portal: apply to jobs
    RecruiterPortal.jsx 578 lines  jobs, applicants, transcripts, reports
    MockInterviewPage.jsx 261 lines self-service practice setup
    ChatPage.jsx        771 lines  the live interview room
  components/
    CodeEditor.jsx      207 lines  Monaco wrapper for coding challenges
  lib/
    api.js              all HTTP calls + WebSocket factory
    authStore.js        token/user persistence, role checks
    sessionStore.js     local index of recent interview sessions
  test/
    app.flows.test.jsx  end-to-end-ish flow tests
    setupTests.js       jest-dom, cleanup, BlobEvent + matchMedia polyfills
    testUtils.jsx       shared helpers
```

---

## Routes

Defined in `src/App.jsx`.

| Path | Page | Access |
|---|---|---|
| `/` | LandingPage | public |
| `/auth` | AuthPage | public; redirects away if already signed in |
| `/mock-interview` | MockInterviewPage | public by design — supports a guest flow |
| `/chat/:sessionId` | ChatPage | candidate, recruiter, admin |
| `/candidate` | UploadPage | candidate, recruiter, admin |
| `/recruiter` | RecruiterPortal | recruiter, admin |
| `*` | → `/` | — |

`ProtectedRoute` reads the stored session directly. With no token it redirects to
`/auth`, preserving the attempted location in router state so `AuthPage` can send
the user back afterwards. With a token but the wrong role, it redirects to that
role's home (`/recruiter` for recruiter/admin, otherwise `/candidate`).

---

## Client state

No global store. State lives in component hooks, with these persisted keys:

| Key | Storage | Written by | Purpose |
|---|---|---|---|
| `audiobot.auth.token` | local **or** session | `authStore.js` | JWT |
| `audiobot.auth.user` | local **or** session | `authStore.js` | user object |
| `audiobot.activeSessionId` | local | `sessionStore.js` | current interview id |
| `audiobot.sessions` | local | `sessionStore.js` | recent sessions, capped at 20 |
| `audiobot.guest.taken` | local | `MockInterviewPage.jsx` | one-free-guest-interview flag |
| `audiobot-theme` | local | `App.jsx` | `light` / `dark` |

"Remember this device" picks the storage: checked writes to `localStorage`,
unchecked to `sessionStorage`. `saveAuthSession` clears the other one first so a
stale token can't linger in the unused store. Reads check `localStorage` first,
then `sessionStorage`.

The theme toggle is rendered globally in `App`, defaults to the OS
`prefers-color-scheme`, and sets `document.documentElement.dataset.theme`.

---

## API layer (`src/lib/api.js`)

**Base URL resolution**, in order: `VITE_API_BASE_URL` → `window.location.origin`
→ `http://localhost:8000`. Trailing slashes are stripped.

**WebSocket URL**: `VITE_WS_URL` if set, otherwise derived from the base URL by
swapping `https`→`wss` / `http`→`ws`. So pointing `VITE_API_BASE_URL` at the
backend is normally enough.

**Auth**: `createHeaders()` adds `Authorization: Bearer <token>` whenever a token
exists. `Content-Type` is set only for JSON bodies — `FormData` uploads
deliberately let the browser set the boundary.

**Errors**: `ensureOk` unwraps FastAPI error shapes, including validation arrays
(`[{loc, msg}]`), into a single readable message. `request()` wraps network
failures with a hint that the backend may be unreachable, which is why the UI
shows "Check that the backend is running…" rather than a bare `TypeError`.

Exported calls, grouped by consumer:

- **Auth** — `loginUser`, `registerUser`, `createGuestSession`
- **Jobs** — `fetchJobs`, `createJob`, `applyToJob`
- **Candidates** — `fetchCandidates`, `updateCandidate`
- **Interviews** — `fetchInterviews`, `fetchInterview`, `createInterview`
- **Mock** — `startMockInterview`
- **Recruiter** — `fetchRecruiterJobs`, `fetchRecruiterJobCandidates`,
  `fetchRecruiterInterviewConversation`
- **Conversations / reports** — `fetchAuthenticatedConversation`,
  `downloadConversationReport`, `buildConversationReportUrl`
- **Helpers** — `resolveApiUrl`, `createChatSocket`, `API_BASE_URL`

---

## The interview room (`ChatPage.jsx`)

The most involved part of the app. It opens a WebSocket via `createChatSocket`,
which appends the JWT as a query parameter because browsers cannot set an
`Authorization` header on a WebSocket handshake.

**Outbound messages**

| `type` | Payload | Trigger |
|---|---|---|
| `text` | `message` | Send button or Enter |
| `audio` | — then a binary `Blob` | Record Voice (MediaRecorder, 50s cap) |
| `code_submit` | `code`, `language` | Submit in the code editor |

**Inbound messages** are JSON with `type` of `transcription`, `response`,
`interview_complete`, or `auth_error`, plus binary frames carrying synthesized
audio, which are played via `URL.createObjectURL`.

**Reconnection.** The socket reconnects automatically with exponential backoff
(1s doubling to a 30s cap), and releases `sendLockRef`, `sending`, and
`recording` on close — without that, a dropped connection left the composer
permanently disabled with no error shown. Conversation state survives because
the backend keys its checkpointer on the interview id. An `auth_error` is
treated as fatal and stops the retry loop, since reconnecting with a rejected
token would spin forever.

Both the Send and Record controls are gated on `socketState === "open"`, so
connection health is directly visible in the UI.

> Server-side WebSocket constraints on Cloud Run are documented in
> [`../backend/docs/websockets-on-cloud-run.md`](../backend/docs/websockets-on-cloud-run.md).

**Code challenges.** When an AI reply contains `[CODE_CHALLENGE]`, the tag is
stripped, the panel switches to the editor, and a 15-minute deadline starts.
`CodeEditor.jsx` supports Python, JavaScript, TypeScript, Java, C++, SQL and Go
with per-language boilerplate, a 10,000-character limit matching the backend cap,
a countdown that locks the editor at zero, and a submission history view.

---

## Guest flow

`/mock-interview` is intentionally public. If an unauthenticated visitor launches
an interview, the page dynamically imports `createGuestSession`, calls
`POST /api/v1/auth/guest`, stores the returned session, and sets
`audiobot.guest.taken`. A second attempt is refused with a prompt to sign up.

That limit is enforced **client-side only**, so clearing `localStorage` grants
another guest interview. Treat it as friction, not a control.

---

## Local development

Requires Node 18+ and the backend running on `http://localhost:8000`.

```powershell
npm install
npm run dev
```

Dev server runs on **http://localhost:5173** and proxies `/api` to
`http://localhost:8000` with `ws: true`, so WebSocket upgrades work without CORS
configuration. Because `api.js` falls back to `window.location.origin` when
`VITE_API_BASE_URL` is unset, the proxy handles everything in dev — no `.env`
needed locally.

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built output locally |
| `npm test` | `vitest run` (single pass, not watch) |

### Tests

```powershell
npm test
```

`src/test/app.flows.test.jsx` drives real user flows against mocked
infrastructure: a `FakeWebSocket` with manual `emit`, a `FakeMediaRecorder`, a
stubbed `fetch`, and a `signInAsCandidate` helper. `setupTests.js` adds jest-dom
matchers, auto-cleanup, and polyfills `BlobEvent` and `matchMedia`, neither of
which jsdom provides but both of which this app needs.

All 5 tests pass. Note that the suite queries by **accessible role and label**,
so renaming a button or orphaning a `<label>` breaks it — that is intentional,
and it has already caught one real accessibility regression in `UploadPage`.

---

## Environment variables

Vite only exposes variables prefixed `VITE_`.

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | production | Backend origin, no trailing slash |
| `VITE_WS_URL` | no | Only if the WebSocket host differs from the API host |

`.env.production` holds the committed default, but **Vercel's dashboard
environment variables take precedence** during its builds. If the deployed
bundle points somewhere unexpected, check the dashboard before the file.

To confirm what a deployed bundle actually targets, grep the served JS:

```powershell
$html = (Invoke-WebRequest "https://<your-app>.vercel.app/" -UseBasicParsing).Content
$asset = [regex]::Match($html, '/assets/[A-Za-z0-9._-]+\.js').Value
(Invoke-WebRequest "https://<your-app>.vercel.app$asset" -UseBasicParsing).Content `
  | Select-String -Pattern 'https://[a-z0-9.-]*run\.app' -AllMatches
```

---

## Deployment

Vercel builds on push. `vercel.json` sets `installCommand`, `buildCommand`,
`outputDirectory: dist`, and rewrites every path to `/index.html` so client-side
routing survives deep links and refreshes.

`dist/` is gitignored, so Vercel builds from source. It used to be committed,
which meant a stale bundle shipped with an old backend URL baked in and source
changes appeared to have no effect — do not re-add it.

The backend deploys separately via GitHub Actions; frontend-only pushes never
touch Cloud Run.

---

## Rough edges

- **Landing images are unoptimized**: `ai-agent.png` (931 KB) and
  `hero-dashboard.png` (618 KB), roughly 1.5 MB of PNGs on the public page.
  Worth converting to WebP.
- **`ChatPage.jsx` is 771 lines** and owns socket lifecycle, recording,
  playback, transcript, code challenges and reports. The natural split is a
  `useInterviewSocket` hook.
- **Split branding**: the document title and landing page say "Noventra
  Analytics" while the in-app header says "AudioBot".
- **No linter.** No ESLint config or `lint` script, so style drifts between
  files (`ChatPage` and `RecruiterPortal` differ noticeably). A linter would
  likely have caught the unused `Sidebar.jsx` that was removed.
- **Guest limit is client-side only** — see Guest flow.
- The backend exposes `GET /api/v1/auth/me`, which this app never calls; it
  trusts the stored user object instead.
