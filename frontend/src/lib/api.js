import { getAuthToken } from "./authStore";

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }

  return "http://localhost:8000";
}

const API_BASE_URL = resolveApiBaseUrl();

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (typeof window !== "undefined" && !import.meta.env.VITE_API_BASE_URL) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/v1/ws`;
  }

  if (API_BASE_URL.startsWith("https://")) {
    return API_BASE_URL.replace("https://", "wss://") + "/api/v1/ws";
  }

  return API_BASE_URL.replace("http://", "ws://") + "/api/v1/ws";
}

function createHeaders(extraHeaders = {}) {
  const token = getAuthToken();

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeDetail(detail) {
  if (!detail) {
    return "Request failed";
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        const location = Array.isArray(item?.loc) ? item.loc.join(" > ") : "";
        const message = item?.msg || item?.message || JSON.stringify(item);
        return location ? `${location}: ${message}` : message;
      })
      .join(". ");
  }

  if (typeof detail === "object") {
    return detail.detail || detail.error || detail.message || JSON.stringify(detail);
  }

  return String(detail);
}

async function ensureOk(response) {
  if (response.ok) {
    return response;
  }

  let detail = "Request failed";
  try {
    const data = await response.json();
    detail = normalizeDetail(data.detail || data.error || data);
  } catch {
    detail = response.statusText || detail;
  }
  throw new Error(detail);
}

async function request(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `${error.message}. Check that the backend is running and reachable from the frontend.`
        : "Network request failed. Check that the backend is running and reachable from the frontend.",
    );
  }
}

export async function uploadPdf(endpoint, file, sessionId) {
  const formData = new FormData();
  formData.append(endpoint === "resume" ? "resume" : "jd", file);
  formData.append("session_id", sessionId);

  const response = await request(`${API_BASE_URL}/api/upload-${endpoint}`, {
    method: "POST",
    body: formData,
  });

  await ensureOk(response);
  return response.json();
}

export async function loginUser(payload) {
  const response = await request(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  await ensureOk(response);
  return response.json();
}

export async function registerUser(payload) {
  const response = await request(`${API_BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  await ensureOk(response);
  return response.json();
}

export async function fetchConversationIds() {
  const response = await request(`${API_BASE_URL}/api/v1/admin/conversations`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  const data = await response.json();
  return data.conversations || [];
}

export async function fetchConversation(sessionId) {
  const response = await request(`${API_BASE_URL}/api/v1/admin/conversations/${sessionId}`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  return response.json();
}

export async function downloadConversationReport(sessionId) {
  const response = await request(buildConversationReportUrl(sessionId), {
    headers: createHeaders(),
  });
  await ensureOk(response);
  return response.blob();
}

export function buildConversationReportUrl(sessionId) {
  return `${API_BASE_URL}/api/v1/admin/conversations/${sessionId}/report.pdf`;
}

export function resolveApiUrl(url) {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }

  return `${API_BASE_URL}/${url.replace(/^\/+/, "")}`;
}

export function createChatSocket() {
  return new WebSocket(getWebSocketUrl());
}

export { API_BASE_URL };
