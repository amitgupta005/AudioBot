import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "./testUtils";

const conversations = new Map();
const sockets = [];
const state = {
  jobs: [],
  candidates: [],
  interviews: [],
  candidateCounter: 1,
  autoScheduleOnApply: true,
};

function makeConversation(id, overrides = {}) {
  return {
    interview_id: id,
    messages: [],
    context: {
      jd_text: "JD context",
      resume_text: "Resume context",
    },
    candidate_report: null,
    candidate_report_pdf: null,
    ...overrides,
  };
}

function makeAuthResponse(role = "candidate") {
  const displayName = role === "recruiter" ? "Recruiter User" : role === "admin" ? "Admin User" : "Candidate User";
  return {
    access_token: `token-${role}`,
    token_type: "bearer",
    user: {
      id: `${role}-1`,
      email: `${role}@example.com`,
      full_name: displayName,
      company_name: role === "candidate" ? null : "Example Inc",
      role,
      created_at: "2026-03-19T10:00:00.000Z",
      updated_at: "2026-03-19T10:00:00.000Z",
    },
  };
}

class FakeWebSocket {
  static OPEN = 1;

  constructor() {
    this.readyState = FakeWebSocket.OPEN;
    this.listeners = {};
    this.sent = [];
    sockets.push(this);
    queueMicrotask(() => this.emit("open"));
  }

  addEventListener(type, handler) {
    this.listeners[type] ??= [];
    this.listeners[type].push(handler);
  }

  emit(type, event = {}) {
    (this.listeners[type] || []).forEach((handler) => handler(event));
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.emit("close");
  }
}

class FakeMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.listeners = {};
    this.state = "inactive";
    this.mimeType = "audio/webm";
  }

  addEventListener(type, handler) {
    this.listeners[type] ??= [];
    this.listeners[type].push(handler);
  }

  emit(type, event) {
    (this.listeners[type] || []).forEach((handler) => handler(event));
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.emit("dataavailable", new BlobEvent("dataavailable", { data: new Blob(["voice-bytes"]) }));
    this.emit("stop");
  }
}

function buildFetchResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    async json() {
      return data;
    },
    async blob() {
      return new Blob(["pdf"]);
    },
  };
}

async function signInAsCandidate(user) {
  renderApp(["/"]);
  await user.click(screen.getByRole("button", { name: /candidate portal/i }));
  await user.type(screen.getByLabelText(/email address/i), "candidate@example.com");
  await user.type(screen.getByLabelText(/password/i), "password123");
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  await screen.findByText(/Apply to a job and join your scheduled interview/i);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  conversations.clear();
  sockets.length = 0;

  state.jobs = [
    {
      id: "job-1",
      title: "Frontend Engineer",
      description: "Build polished interfaces.",
      company_name: "Example Inc",
      created_at: "2026-03-19T10:00:00.000Z",
      updated_at: "2026-03-19T10:00:00.000Z",
    },
  ];
  state.candidates = [];
  state.interviews = [];
  state.candidateCounter = 1;
  state.autoScheduleOnApply = true;

  global.WebSocket = FakeWebSocket;
  global.MediaRecorder = FakeMediaRecorder;
  global.Audio = class {
    addEventListener() {}
    play() {
      return Promise.resolve();
    }
  };
  global.URL.createObjectURL = vi.fn(() => "blob:audio");
  global.URL.revokeObjectURL = vi.fn();

  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks() {
          return [{ stop: vi.fn() }];
        },
      })),
    },
  });

  global.fetch = vi.fn(async (input, options = {}) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.endsWith("/api/v1/auth/login")) {
      const payload = JSON.parse(options.body);
      const role = payload.email.includes("recruiter")
        ? "recruiter"
        : payload.email.includes("admin")
          ? "admin"
          : "candidate";
      return buildFetchResponse(makeAuthResponse(role));
    }

    if (url.endsWith("/api/v1/auth/register")) {
      const payload = JSON.parse(options.body);
      return buildFetchResponse(makeAuthResponse(payload.role));
    }

    if (url.endsWith("/api/v1/jobs")) {
      return buildFetchResponse(state.jobs);
    }

    const applyMatch = url.match(/\/api\/v1\/jobs\/([^/]+)\/apply$/);
    if (applyMatch) {
      const jobId = decodeURIComponent(applyMatch[1]);
      const candidateId = `cand-${state.candidateCounter++}`;
      const candidate = {
        id: candidateId,
        user_id: "candidate-1",
        job_id: jobId,
        status: "applied",
        created_at: "2026-03-19T10:00:00.000Z",
        updated_at: "2026-03-19T10:00:00.000Z",
      };
      state.candidates.unshift(candidate);

      if (state.autoScheduleOnApply) {
        const interview = {
          id: `interview-${candidateId}`,
          candidate_id: candidateId,
          job_id: jobId,
          status: "scheduled",
          created_at: "2026-03-19T10:00:00.000Z",
          updated_at: "2026-03-19T10:00:00.000Z",
        };
        state.interviews.unshift(interview);
        if (!conversations.has(interview.id)) {
          conversations.set(interview.id, makeConversation(interview.id));
        }
      }
      return buildFetchResponse(candidate);
    }

    if (url.endsWith("/api/v1/candidates")) {
      return buildFetchResponse(state.candidates);
    }

    if (url.endsWith("/api/v1/interviews")) {
      return buildFetchResponse(state.interviews);
    }

    const conversationMatch = url.match(/\/api\/v1\/conversations\/([^/]+)$/);
    if (conversationMatch) {
      const id = decodeURIComponent(conversationMatch[1]);
      if (!conversations.has(id)) {
        conversations.set(id, makeConversation(id));
      }
      return buildFetchResponse(conversations.get(id));
    }

    const reportMatch = url.match(/\/api\/v1\/admin\/conversations\/([^/]+)\/report\.pdf$/);
    if (reportMatch) {
      return buildFetchResponse({ ok: true });
    }

    throw new Error(`Unhandled fetch for ${url}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("frontend flows", () => {
  it("Upload Flow: logs in as candidate, applies to a job, and lands on chat", async () => {
    const user = userEvent.setup();
    await signInAsCandidate(user);

    await user.upload(screen.getByLabelText(/resume \(pdf\)/i), new File(["resume"], "resume.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /apply for job/i }));

    expect(await screen.findByText(/AudioBot Interview Agent/i)).toBeInTheDocument();
    expect(screen.getByText("interview-cand-1")).toBeInTheDocument();
  });

  it("Chat Flow: sends a text message and renders the AI response", async () => {
    const user = userEvent.setup();
    const sessionId = "session-text";
    localStorage.setItem("audiobot.auth.token", "token-candidate");
    localStorage.setItem("audiobot.auth.user", JSON.stringify(makeAuthResponse("candidate").user));
    conversations.set(sessionId, makeConversation(sessionId));

    renderApp([`/chat/${sessionId}`]);
    await screen.findByText(/AudioBot Interview Agent/i);

    await user.type(screen.getByPlaceholderText(/type your response/i), "Hello there");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(sockets[0].sent[0]).toContain('"type":"text"');
    expect(within(screen.getByTestId("chat-stream")).getByText("Hello there")).toBeInTheDocument();

    conversations.set(
      sessionId,
      makeConversation(sessionId, {
        messages: [
          { type: "human", data: { content: "Hello there" } },
          { type: "ai", data: { content: "AI reply" } },
        ],
      }),
    );
    sockets[0].emit("message", {
      data: JSON.stringify({ type: "response", text: "AI reply" }),
    });

    expect(await within(screen.getByTestId("chat-stream")).findByText("AI reply")).toBeInTheDocument();
  });

  it("Voice Flow: records audio, sends it, and renders transcription plus AI response", async () => {
    const user = userEvent.setup();
    const sessionId = "session-voice";
    localStorage.setItem("audiobot.auth.token", "token-candidate");
    localStorage.setItem("audiobot.auth.user", JSON.stringify(makeAuthResponse("candidate").user));
    conversations.set(sessionId, makeConversation(sessionId));

    renderApp([`/chat/${sessionId}`]);
    await screen.findByText(/AudioBot Interview Agent/i);

    await user.click(screen.getByRole("button", { name: /record voice/i }));
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(sockets[0].sent[0]).toContain('"type":"audio"');
    expect(sockets[0].sent[1]).toBeInstanceOf(Blob);

    sockets[0].emit("message", {
      data: JSON.stringify({ type: "transcription", text: "Spoken answer" }),
    });
    conversations.set(
      sessionId,
      makeConversation(sessionId, {
        messages: [
          { type: "human", data: { content: "Spoken answer" } },
          { type: "ai", data: { content: "Voice AI reply" } },
        ],
      }),
    );
    sockets[0].emit("message", {
      data: JSON.stringify({ type: "response", text: "Voice AI reply" }),
    });

    expect(await within(screen.getByTestId("chat-stream")).findByText("Spoken answer")).toBeInTheDocument();
    expect(await within(screen.getByTestId("chat-stream")).findByText("Voice AI reply")).toBeInTheDocument();
  });

  it("History Loop: starts a new session from chat and returns to candidate portal", async () => {
    const user = userEvent.setup();
    const firstSessionId = "session-one";
    localStorage.setItem("audiobot.auth.token", "token-candidate");
    localStorage.setItem("audiobot.auth.user", JSON.stringify(makeAuthResponse("candidate").user));
    localStorage.setItem("audiobot.activeSessionId", firstSessionId);
    localStorage.setItem(
      "audiobot.sessions",
      JSON.stringify([{ id: firstSessionId, createdAt: "2026-03-19T10:00:00.000Z", lastVisitedAt: "2026-03-19T10:00:00.000Z" }]),
    );
    conversations.set(
      firstSessionId,
      makeConversation(firstSessionId, {
        messages: [{ type: "human", data: { content: "First session intro" } }],
      }),
    );

    renderApp([`/chat/${firstSessionId}`]);
    expect(await within(screen.getByTestId("chat-stream")).findByText("First session intro")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new session/i }));
    expect(await screen.findByText(/Apply to a job and join your scheduled interview/i)).toBeInTheDocument();
  });

  it("Completed Interview: disables input and shows generated summary", async () => {
    const sessionId = "session-complete";
    localStorage.setItem("audiobot.auth.token", "token-admin");
    localStorage.setItem("audiobot.auth.user", JSON.stringify(makeAuthResponse("admin").user));
    conversations.set(
      sessionId,
      makeConversation(sessionId, {
        candidate_report: {
          summary: "Strong communicator with relevant examples.",
          scores: {
            communication: 9,
            clarity: 8,
          },
        },
        candidate_report_pdf: "/reports/session-complete.pdf",
      }),
    );

    renderApp([`/chat/${sessionId}`]);

    expect(await screen.findByTestId("interview-complete-state")).toHaveTextContent("Interview complete");
    expect(screen.getByPlaceholderText(/interview complete/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    expect(screen.getByTestId("download-report-link")).toBeInTheDocument();
  });
});
