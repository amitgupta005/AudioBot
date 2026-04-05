import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "./testUtils";

const conversations = new Map();
const sockets = [];

function makeConversation(id, overrides = {}) {
  return {
    conversation_id: id,
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
  return {
    access_token: `token-${role}`,
    token_type: "bearer",
    user: {
      id: `${role}-1`,
      email: `${role}@example.com`,
      full_name: role === "recruiter" ? "Recruiter User" : "Candidate User",
      company_name: role === "recruiter" ? "Example Inc" : null,
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

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter((listener) => listener !== handler);
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
    FakeMediaRecorder.instances.push(this);
  }

  static instances = [];

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
  await screen.findByText(/load the interview context/i);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  conversations.clear();
  sockets.length = 0;
  FakeMediaRecorder.instances = [];

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
      const role = payload.email.includes("recruiter") ? "recruiter" : "candidate";
      return buildFetchResponse(makeAuthResponse(role));
    }

    if (url.endsWith("/api/v1/auth/register")) {
      const payload = JSON.parse(options.body);
      return buildFetchResponse(makeAuthResponse(payload.role));
    }

    if (url.endsWith("/api/upload-resume")) {
      const sessionId = options.body?.get("session_id");
      if (sessionId && !conversations.has(sessionId)) {
        conversations.set(sessionId, makeConversation(sessionId));
      }
      return buildFetchResponse({ status: "success" });
    }

    if (url.endsWith("/api/upload-jd")) {
      const sessionId = options.body?.get("session_id");
      if (sessionId && !conversations.has(sessionId)) {
        conversations.set(sessionId, makeConversation(sessionId));
      }
      return buildFetchResponse({ status: "success" });
    }

    if (url.endsWith("/api/v1/admin/conversations")) {
      return buildFetchResponse({ conversations: [...conversations.keys()] });
    }

    const conversationMatch = url.match(/\/api\/v1\/admin\/conversations\/([^/]+)$/);
    if (conversationMatch) {
      const id = decodeURIComponent(conversationMatch[1]);
      if (!conversations.has(id)) {
        return buildFetchResponse({ detail: "Conversation not found" }, false, 404);
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
  it("Upload Flow: logs in as candidate, uploads both files, and lands on the chat page", async () => {
    const user = userEvent.setup();
    await signInAsCandidate(user);

    const threadId = screen.getByTestId("active-session-id").textContent;

    await user.upload(screen.getByLabelText(/candidate resume/i), new File(["resume"], "resume.pdf", { type: "application/pdf" }));
    await user.upload(screen.getByLabelText(/job description/i), new File(["jd"], "jd.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /save context and open interview/i }));

    await screen.findByText(/context-aware hr interview chat/i);
    expect(screen.getByTestId("current-session-id")).toHaveTextContent(threadId);
  });

  it("Chat Flow: sends a text message and renders the AI response", async () => {
    const user = userEvent.setup();
    const sessionId = "session-text";
    localStorage.setItem("audiobot.auth.token", "token-candidate");
    localStorage.setItem("audiobot.auth.user", JSON.stringify(makeAuthResponse("candidate").user));
    conversations.set(sessionId, makeConversation(sessionId));

    renderApp([`/chat/${sessionId}`]);

    await screen.findByText(/context-aware hr interview chat/i);
    await user.type(screen.getByPlaceholderText(/type your answer/i), "Hello there");
    await user.click(screen.getByRole("button", { name: /send message/i }));

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

    await screen.findByText(/context-aware hr interview chat/i);
    await user.click(screen.getByRole("button", { name: /record voice/i }));
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(sockets[0].sent[0]).toContain('"type":"audio"');
    expect(sockets[0].sent[1]).toBeInstanceOf(Blob);

    sockets[0].emit("message", {
      data: JSON.stringify({ type: "transcription", text: "Spoken answer" }),
    });
    sockets[0].emit("message", {
      data: JSON.stringify({ type: "response", text: "Voice AI reply" }),
    });

    expect(await within(screen.getByTestId("chat-stream")).findByText("Spoken answer")).toBeInTheDocument();
    expect(await within(screen.getByTestId("chat-stream")).findByText("Voice AI reply")).toBeInTheDocument();
  });

  it("History Loop: starts a new session from chat and keeps sessions separate", async () => {
    const user = userEvent.setup();
    const firstSessionId = "session-one";
    localStorage.setItem("audiobot.auth.token", "token-recruiter");
    localStorage.setItem("audiobot.auth.user", JSON.stringify(makeAuthResponse("recruiter").user));
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
    await screen.findByText(/load the interview context/i);

    const nextThreadId = screen.getByTestId("active-session-id").textContent;
    expect(nextThreadId).not.toBe(firstSessionId);

    await user.upload(screen.getByLabelText(/candidate resume/i), new File(["resume"], "resume2.pdf", { type: "application/pdf" }));
    await user.upload(screen.getByLabelText(/job description/i), new File(["jd"], "jd2.pdf", { type: "application/pdf" }));
    conversations.set(
      nextThreadId,
      makeConversation(nextThreadId, {
        messages: [{ type: "human", data: { content: "Second session intro" } }],
      }),
    );
    await user.click(screen.getByRole("button", { name: /save context and open interview/i }));

    expect(await within(screen.getByTestId("chat-stream")).findByText("Second session intro")).toBeInTheDocument();
    expect(screen.getByTestId(`session-link-${firstSessionId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`session-link-${nextThreadId}`)).toBeInTheDocument();
  });

  it("Completed Interview: disables input and shows the generated report summary", async () => {
    const sessionId = "session-complete";
    localStorage.setItem("audiobot.auth.token", "token-recruiter");
    localStorage.setItem("audiobot.auth.user", JSON.stringify(makeAuthResponse("recruiter").user));
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
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByTestId("download-report-link")).toBeInTheDocument();
  });
});
