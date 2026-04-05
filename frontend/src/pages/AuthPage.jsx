import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { saveAuthSession, readStoredSession } from "../lib/authStore";
import { loginUser, registerUser } from "../lib/api";

const PORTALS = {
  recruiter: {
    eyebrow: "Talent Command Center",
    title: "Recruiter Access",
    subtitle: "Welcome back. Review interview sessions, candidate reports, and pipeline activity.",
    submitLabel: "Sign in",
    registerLabel: "Request Access",
    storyLabel: "Enterprise recruiter workspace",
  },
  candidate: {
    eyebrow: "Interview Experience",
    title: "Candidate Portal",
    subtitle: "Continue your guided interview flow, upload context, and resume your live session.",
    submitLabel: "Continue",
    registerLabel: "Create Account",
    storyLabel: "Private candidate workspace",
  },
};

function initialForm(portal) {
  return {
    email: "",
    password: "",
    fullName: "",
    companyName: "",
    remember: portal === "recruiter",
  };
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const existingSession = readStoredSession();
  const [portal, setPortal] = useState("recruiter");
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(() => initialForm("recruiter"));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (existingSession.token && existingSession.user) {
    const destination = location.state?.from?.pathname || (
      existingSession.user.role === "recruiter" || existingSession.user.role === "admin"
      ? "/recruiter"
      : "/candidate"
    );
    return <Navigate replace to={destination} />;
  }

  const portalContent = PORTALS[portal];

  function switchPortal(nextPortal) {
    setPortal(nextPortal);
    setMode("login");
    setForm(initialForm(nextPortal));
    setError("");
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = mode === "register"
        ? await registerUser({
            email: form.email,
            password: form.password,
            full_name: form.fullName.trim(),
            company_name: form.companyName.trim() || null,
            role: portal,
          })
        : await loginUser({
            email: form.email,
            password: form.password,
          });

      const isRecruiterRole = response.user.role === "recruiter" || response.user.role === "admin";
      if (portal === "candidate" && isRecruiterRole) {
        throw new Error("This account belongs to the recruiter portal. Please switch portals.");
      }
      if (portal === "recruiter" && !isRecruiterRole) {
        throw new Error("This account belongs to the candidate portal. Please switch portals.");
      }

      saveAuthSession(response, form.remember);
      navigate(isRecruiterRole ? "/recruiter" : "/candidate");
    } catch (submitError) {
      setError(submitError.message || "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <div>
          <p className="brand-mark">AudioBot</p>
          <span className="brand-subtitle">Structured interview intelligence</span>
        </div>
        <nav aria-label="Portal selector" className="portal-switch">
          <button
            className={`portal-tab ${portal === "recruiter" ? "is-active" : ""}`}
            onClick={() => switchPortal("recruiter")}
            type="button"
          >
            Recruiter Access
          </button>
          <button
            className={`portal-tab ${portal === "candidate" ? "is-active" : ""}`}
            onClick={() => switchPortal("candidate")}
            type="button"
          >
            Candidate Portal
          </button>
        </nav>
      </header>

      <section className="auth-panel">
        <section className="auth-visual" aria-hidden="true">
          <div className="auth-visual-overlay" />
          <article className="auth-story-card">
            <p className="eyebrow">{portalContent.storyLabel}</p>
            <h1>Sharper access for hiring teams and candidates in one focused experience.</h1>
            <div className="security-row">
              <span className="security-icon">S</span>
              <p>
                {portal === "recruiter"
                  ? "Role-aware reporting and transcript review"
                  : "Session-based interview flow with resumable context"}
              </p>
            </div>
          </article>
        </section>

        <section className="auth-card">
          <div className="auth-card-header">
            <p className="eyebrow">{portalContent.eyebrow}</p>
            <h2>{portalContent.title}</h2>
            <p>{portalContent.subtitle}</p>
          </div>

          <div className="auth-mode-toggle">
            <button
              className={`mode-pill ${mode === "login" ? "is-active" : ""}`}
              onClick={() => setMode("login")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`mode-pill ${mode === "register" ? "is-active" : ""}`}
              onClick={() => setMode("register")}
              type="button"
            >
              {portalContent.registerLabel}
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <label className="auth-field">
                <span>Full Name</span>
                <input
                  autoComplete="name"
                  onChange={(event) => setField("fullName", event.target.value)}
                  placeholder={portal === "recruiter" ? "Recruiter name" : "Candidate name"}
                  required
                  type="text"
                  value={form.fullName}
                />
              </label>
            ) : null}

            {mode === "register" && portal === "recruiter" ? (
              <label className="auth-field">
                <span>Company Name</span>
                <input
                  autoComplete="organization"
                  onChange={(event) => setField("companyName", event.target.value)}
                  placeholder="Company name"
                  type="text"
                  value={form.companyName}
                />
              </label>
            ) : null}

            <label className="auth-field">
              <span>Email Address</span>
              <input
                autoComplete="email"
                onChange={(event) => setField("email", event.target.value)}
                placeholder={portal === "recruiter" ? "name@firm.com" : "candidate@email.com"}
                required
                type="email"
                value={form.email}
              />
            </label>

            <label className="auth-field">
              <div className="field-row">
                <span>Password</span>
                <small>{mode === "register" ? "8+ characters required" : "Secure access"}</small>
              </div>
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onChange={(event) => setField("password", event.target.value)}
                placeholder={mode === "login" ? "Enter your password" : "Create a secure password"}
                required
                type="password"
                value={form.password}
              />
            </label>

            <label className="remember-row">
              <input
                checked={form.remember}
                onChange={(event) => setField("remember", event.target.checked)}
                type="checkbox"
              />
              <span>Remember this device</span>
            </label>

            <button className="auth-submit" disabled={submitting} type="submit">
              {submitting ? "Processing..." : mode === "login" ? portalContent.submitLabel : portalContent.registerLabel}
            </button>

            {error ? <p className="error-copy">{error}</p> : null}
          </form>
        </section>
      </section>
    </main>
  );
}
