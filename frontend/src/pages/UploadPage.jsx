import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadPdf } from "../lib/api";
import { ensureActiveSession, touchSession } from "../lib/sessionStore";

export default function UploadPage() {
  const navigate = useNavigate();
  const sessionId = useMemo(() => ensureActiveSession(), []);
  const [resumeFile, setResumeFile] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

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

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">AudioBot Frontend</p>
          <h1>Load the interview context before the first question lands.</h1>
          <p className="hero-text">
            Each session gets its own thread id. Upload a JD and resume here, then move into the
            interview console where the backend keeps the conversation in Redis-backed LangGraph state.
          </p>
          <div className="hero-metadata">
            <span>Session thread</span>
            <code data-testid="active-session-id">{sessionId}</code>
          </div>
        </div>

        <form className="upload-card" onSubmit={handleSubmit}>
          <label className="upload-field">
            <span>Candidate Resume (PDF)</span>
            <input accept="application/pdf" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} type="file" />
          </label>

          <label className="upload-field">
            <span>Job Description (PDF)</span>
            <input accept="application/pdf" onChange={(event) => setJdFile(event.target.files?.[0] || null)} type="file" />
          </label>

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? status || "Uploading..." : "Save Context And Open Interview"}
          </button>

          {error ? <p className="error-copy">{error}</p> : null}
          {!error && status && submitting ? <p className="status-copy">{status}</p> : null}
        </form>
      </section>
    </main>
  );
}
