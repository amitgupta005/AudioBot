import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthUser } from "../lib/authStore";
import { uploadPdf } from "../lib/api";
import { startNewSession, touchSession } from "../lib/sessionStore";

function formatFileSize(size = 0) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [sessionId] = useState(() => startNewSession());
  const [resumeFile, setResumeFile] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const readyCount = Number(Boolean(resumeFile)) + Number(Boolean(jdFile));
  const progressLabel = readyCount === 2 ? "Interview context ready" : `${readyCount}/2 documents loaded`;
  const sessionStateLabel = readyCount === 2 ? "Ready to launch" : "Preparing session";
  const statusItems = [
    {
      label: "Session",
      value: "Fresh thread created",
      ready: true,
    },
    {
      label: "Resume",
      value: resumeFile ? "Attached" : "Waiting",
      ready: Boolean(resumeFile),
    },
    {
      label: "Job description",
      value: jdFile ? "Attached" : "Waiting",
      ready: Boolean(jdFile),
    },
  ];

  async function handleSubmit(event) {
    event.preventDefault();
    if (!resumeFile || !jdFile) {
      setError("Upload both the resume and the job description before continuing.");
      return;
    }

    setSubmitting(true);
    setError("");
    setStatus("Uploading resume...");

    try {
      await uploadPdf("resume", resumeFile, sessionId);
      setStatus("Uploading job description...");
      await uploadPdf("jd", jdFile, sessionId);
      touchSession(sessionId);
      navigate(`/chat/${sessionId}`);
    } catch (uploadError) {
      setError(uploadError.message || "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSignOut() {
    clearAuthSession();
    navigate("/");
  }

  return (
    <main className="page-shell">
      <header className="candidate-header">
        <div>
          <p className="brand-mark">AudioBot Candidate</p>
          <span className="brand-subtitle">
            Signed in as {user?.full_name || user?.email || "candidate"}
          </span>
        </div>
        <div className="candidate-header-actions">
          {user?.role === "recruiter" || user?.role === "admin" ? (
            <button className="secondary-button" onClick={() => navigate("/recruiter")} type="button">
              Recruiter View
            </button>
          ) : null}
          <button className="ghost-button" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy candidate-workspace-copy">
          <div className="candidate-workspace-intro">
            <p className="eyebrow">Candidate Workspace</p>
            <div className="candidate-session-pill">
              <span className="candidate-session-dot" aria-hidden="true" />
              <strong>{sessionStateLabel}</strong>
            </div>
          </div>
          <h1>Build a clean interview packet before the session opens.</h1>
          <p className="hero-text">
            This page now starts a brand new thread every time you enter it. Add the resume and JD,
            confirm both files look right, then move into the live interview with a fresh session id.
          </p>

          <div className="candidate-workspace-grid">
            <div className="context-meter candidate-context-meter">
              <div className="context-meter-header">
                <span>Launch Readiness</span>
                <strong>{progressLabel}</strong>
              </div>
              <div aria-hidden="true" className="context-meter-track">
                <span style={{ width: `${(readyCount / 2) * 100}%` }} />
              </div>
              <div className="context-checklist candidate-context-checklist">
                {statusItems.map((item) => (
                  <div key={item.label} className={`context-check candidate-context-check ${item.ready ? "is-ready" : ""}`}>
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-metadata candidate-session-card">
              <span>Session thread</span>
              <code data-testid="active-session-id">{sessionId}</code>
              <small>A fresh thread is created whenever you land on this page.</small>
            </div>
          </div>

          <div className="candidate-flow-card">
            <div className="candidate-flow-step">
              <span>1</span>
              <div>
                <strong>Attach your context</strong>
                <p>Upload a PDF resume and the job description you want the interview aligned to.</p>
              </div>
            </div>
            <div className="candidate-flow-step">
              <span>2</span>
              <div>
                <strong>Open the interview</strong>
                <p>The interview console will reuse this new thread and keep the session state together.</p>
              </div>
            </div>
          </div>
        </div>

        <form className="upload-card candidate-upload-card" onSubmit={handleSubmit}>
          <div className="candidate-upload-header">
            <div>
              <p className="eyebrow">Session Assets</p>
              <h2>Drop in the documents for this interview run.</h2>
            </div>
            <div className="candidate-upload-badge">
              <strong>{readyCount}/2</strong>
              <span>files ready</span>
            </div>
          </div>

          <label className="upload-field candidate-upload-field">
            <span>Candidate Resume (PDF)</span>
            <input accept="application/pdf" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} type="file" />
            <div className={`file-card candidate-file-card ${resumeFile ? "is-selected" : ""}`}>
              <strong>{resumeFile?.name || "No resume selected yet"}</strong>
              <span>{resumeFile ? formatFileSize(resumeFile.size) : "PDF only"}</span>
            </div>
          </label>

          <label className="upload-field candidate-upload-field">
            <span>Job Description (PDF)</span>
            <input accept="application/pdf" onChange={(event) => setJdFile(event.target.files?.[0] || null)} type="file" />
            <div className={`file-card candidate-file-card ${jdFile ? "is-selected" : ""}`}>
              <strong>{jdFile?.name || "No job description selected yet"}</strong>
              <span>{jdFile ? formatFileSize(jdFile.size) : "PDF only"}</span>
            </div>
          </label>

          <div className="candidate-upload-summary">
            <div className="candidate-upload-summary-copy">
              <strong>Ready for the interview console?</strong>
              <p>The launch button activates once both PDFs are attached to this fresh session.</p>
            </div>
            <button className="primary-button candidate-launch-button" disabled={submitting} type="submit">
              {submitting ? status || "Uploading..." : "Save Context And Open Interview"}
            </button>
          </div>

          {error ? <p className="error-copy">{error}</p> : null}
          {!error && status && submitting ? <p className="status-copy">{status}</p> : null}
        </form>
      </section>
    </main>
  );
}
