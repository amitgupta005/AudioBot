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

function getWebSocketBaseUrl() {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (API_BASE_URL.startsWith("https://")) {
    return API_BASE_URL.replace("https://", "wss://");
  }

  if (API_BASE_URL.startsWith("http://")) {
    return API_BASE_URL.replace("http://", "ws://");
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

  return "ws://localhost:8000";
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

export async function fetchJobs() {
  const response = await request(`${API_BASE_URL}/api/v1/jobs`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  const data = await response.json();
  return Array.isArray(data) ? data : data.items || [];
}

export async function createJob(payload) {
  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("description", payload.description);
  if (payload.companyName) {
    formData.append("company_name", payload.companyName);
  }
  if (payload.structuredJobDescription) {
    formData.append("structured_job_description", JSON.stringify(payload.structuredJobDescription));
  }
  formData.append("jd_file", payload.jdFile);

  const response = await request(`${API_BASE_URL}/api/v1/jobs`, {
    method: "POST",
    headers: createHeaders(),
    body: formData,
  });
  await ensureOk(response);
  return response.json();
}

export async function applyToJob(jobId, resumeFile) {
  const formData = new FormData();
  formData.append("resume", resumeFile);

  const response = await request(`${API_BASE_URL}/api/v1/jobs/${jobId}/apply`, {
    method: "POST",
    headers: createHeaders(),
    body: formData,
  });

  await ensureOk(response);
  return response.json();
}

export async function startMockInterview({ resumeFile, jdText, jdFile, interviewType, difficulty }) {
  const formData = new FormData();
  formData.append("resume", resumeFile);
  formData.append("interview_type", interviewType);
  formData.append("difficulty", difficulty);
  
  if (jdText) {
    formData.append("jd_text", jdText);
  } else if (jdFile) {
    formData.append("jd_file", jdFile);
  }

  const response = await request(`${API_BASE_URL}/api/v1/mock-interviews/start`, {
    method: "POST",
    headers: createHeaders(),
    body: formData,
  });

  await ensureOk(response);
  return response.json();
}

export async function fetchCandidates() {
  const response = await request(`${API_BASE_URL}/api/v1/candidates`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  const data = await response.json();
  return Array.isArray(data) ? data : data.items || [];
}

export async function fetchInterviews() {
  const response = await request(`${API_BASE_URL}/api/v1/interviews`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  const data = await response.json();
  return Array.isArray(data) ? data : data.items || [];
}

export async function createInterview(payload) {
  const response = await request(`${API_BASE_URL}/api/v1/interviews`, {
    method: "POST",
    headers: {
      ...createHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  await ensureOk(response);
  return response.json();
}

export async function fetchInterview(interviewId) {
  const response = await request(`${API_BASE_URL}/api/v1/interviews/${interviewId}`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  return response.json();
}

export async function updateCandidate(candidateId, payload) {
  const response = await request(`${API_BASE_URL}/api/v1/candidates/${candidateId}`, {
    method: "PATCH",
    headers: {
      ...createHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

export async function fetchAuthenticatedConversation(interviewId) {
  const response = await request(`${API_BASE_URL}/api/v1/conversations/${interviewId}`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  return response.json();
}

export async function fetchRecruiterJobs(companyId = "") {
  const query = companyId ? `?company_id=${encodeURIComponent(companyId)}` : "";
  const response = await request(`${API_BASE_URL}/api/v1/recruiter/jobs${query}`, {
    headers: createHeaders(),
  });
  await ensureOk(response);
  const data = await response.json();
  return Array.isArray(data) ? data : data.items || [];
}

export async function fetchRecruiterJobCandidates(jobId, stage = "all") {
  const response = await request(
    `${API_BASE_URL}/api/v1/recruiter/jobs/${jobId}/candidates?stage=${encodeURIComponent(stage)}`,
    {
      headers: createHeaders(),
    },
  );
  await ensureOk(response);
  const data = await response.json();
  return Array.isArray(data) ? data : data.items || [];
}

export async function fetchRecruiterInterviewConversation(interviewId) {
  const response = await request(`${API_BASE_URL}/api/v1/recruiter/interviews/${interviewId}/conversation`, {
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
  return `${API_BASE_URL}/api/v1/interviews/${sessionId}/report.pdf`;
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

export function createChatSocket(interviewId) {
  const base = getWebSocketBaseUrl();
  const token = getAuthToken();
  const url = `${base}/api/v1/interviews/${encodeURIComponent(interviewId)}/stream`;
  return new WebSocket(token ? `${url}?token=${encodeURIComponent(token)}` : url);
}

export { API_BASE_URL };
