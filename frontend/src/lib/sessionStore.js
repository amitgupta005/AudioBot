const ACTIVE_SESSION_KEY = "audiobot.activeSessionId";
const SESSION_INDEX_KEY = "audiobot.sessions";

function readIndex() {
  try {
    const raw = localStorage.getItem(SESSION_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeIndex(items) {
  localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(items));
}

function makeSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function startNewSession() {
  const sessionId = makeSessionId();
  const sessions = readIndex();
  const now = new Date().toISOString();

  const nextSessions = [
    { id: sessionId, createdAt: now, lastVisitedAt: now },
    ...sessions.filter((session) => session.id !== sessionId),
  ];

  localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  writeIndex(nextSessions.slice(0, 20));
  return sessionId;
}

export function getActiveSessionId() {
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function ensureActiveSession() {
  return getActiveSessionId() || startNewSession();
}

export function touchSession(sessionId) {
  const sessions = readIndex();
  const now = new Date().toISOString();
  const existing = sessions.find((session) => session.id === sessionId);

  const next = [
    existing
      ? { ...existing, lastVisitedAt: now }
      : { id: sessionId, createdAt: now, lastVisitedAt: now },
    ...sessions.filter((session) => session.id !== sessionId),
  ];

  localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  writeIndex(next.slice(0, 20));
}

export function listKnownSessions() {
  return readIndex();
}
