const AUTH_TOKEN_KEY = "audiobot.auth.token";
const AUTH_USER_KEY = "audiobot.auth.user";

function safeJsonParse(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function saveAuthSession({ access_token: accessToken, user }, remember = true) {
  const primary = remember ? localStorage : sessionStorage;
  const secondary = remember ? sessionStorage : localStorage;

  secondary.removeItem(AUTH_TOKEN_KEY);
  secondary.removeItem(AUTH_USER_KEY);
  primary.setItem(AUTH_TOKEN_KEY, accessToken);
  primary.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function readStoredSession() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
  const user = safeJsonParse(localStorage.getItem(AUTH_USER_KEY))
    || safeJsonParse(sessionStorage.getItem(AUTH_USER_KEY));

  return { token, user };
}

export function getAuthToken() {
  return readStoredSession().token;
}

export function getAuthUser() {
  return readStoredSession().user;
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
}

export function isAllowedRole(user, allowedRoles = []) {
  if (!user?.role) {
    return false;
  }

  return allowedRoles.length === 0 || allowedRoles.includes(user.role);
}
