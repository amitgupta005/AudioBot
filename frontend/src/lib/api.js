const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (API_BASE_URL.startsWith("https://")) {
    return API_BASE_URL.replace("https://", "wss://") + "/ws";
  }

  return API_BASE_URL.replace("http://", "ws://") + "/ws";
}

async function ensureOk(response) {
  if (response.ok) {
    return response;
  }

  let detail = "Request failed";
  try {
    const data = await response.json();
    detail = data.detail || data.error || detail;
  } catch {
    detail = response.statusText || detail;
  }
  throw new Error(detail);
}

export async function uploadPdf(endpoint, file, sessionId) {
  const formData = new FormData();
  formData.append(endpoint === "resume" ? "resume" : "jd", file);
  formData.append("session_id", sessionId);

  const response = await fetch(`${API_BASE_URL}/api/upload-${endpoint}`, {
    method: "POST",
    body: formData,
  });

  await ensureOk(response);
  return response.json();
}

export async function fetchConversationIds() {
  const response = await fetch(`${API_BASE_URL}/admin/conversations`);
  await ensureOk(response);
  const data = await response.json();
  return data.conversations || [];
}

export async function fetchConversation(sessionId) {
  const response = await fetch(`${API_BASE_URL}/admin/conversations/${sessionId}`);
  await ensureOk(response);
  return response.json();
}

export function createChatSocket() {
  return new WebSocket(getWebSocketUrl());
}

export { API_BASE_URL };
