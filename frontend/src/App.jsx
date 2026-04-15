import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { isAllowedRole, readStoredSession } from "./lib/authStore";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import RecruiterPortal from "./pages/RecruiterPortal";
import UploadPage from "./pages/UploadPage";

const THEME_STORAGE_KEY = "audiobot-theme";

function getInitialTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

function ProtectedRoute({ allowedRoles }) {
  const location = useLocation();
  const { token, user } = readStoredSession();

  if (!token || !user) {
    return <Navigate replace state={{ from: location }} to="/" />;
  }

  if (!isAllowedRole(user, allowedRoles)) {
    const fallback = user.role === "recruiter" || user.role === "admin" ? "/recruiter" : "/candidate";
    return <Navigate replace to={fallback} />;
  }

  return <Outlet />;
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  return (
    <>
      <button
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        className="theme-toggle"
        onClick={toggleTheme}
        type="button"
      >
        <span className="theme-toggle-icon" aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
        <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
      </button>

      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route element={<ProtectedRoute allowedRoles={["candidate", "recruiter", "admin"]} />}>
          <Route path="/chat/:sessionId" element={<ChatPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={["candidate", "recruiter", "admin"]} />}>
          <Route path="/candidate" element={<UploadPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={["recruiter", "admin"]} />}>
          <Route path="/recruiter" element={<RecruiterPortal />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </>
  );
}
