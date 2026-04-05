import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthUser } from "../lib/authStore";
import { downloadConversationReport, fetchConversation, fetchConversationIds } from "../lib/api";

export default function RecruiterPortal() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [conversationIds, setConversationIds] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadConversations() {
      setLoading(true);
      setError("");

      try {
        const ids = await fetchConversationIds();
        if (!active) {
          return;
        }

        setConversationIds(ids);
        setSelectedConversationId(ids[0] || "");
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Unable to load recruiter conversations.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadConversations();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadConversation() {
      if (!selectedConversationId) {
        setSelectedConversation(null);
        return;
      }

      setLoadingConversation(true);

      try {
        const conversation = await fetchConversation(selectedConversationId);
        if (active) {
          setSelectedConversation(conversation);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Unable to load conversation.");
        }
      } finally {
        if (active) {
          setLoadingConversation(false);
        }
      }
    }

    loadConversation();
    return () => {
      active = false;
    };
  }, [selectedConversationId]);

  function handleSignOut() {
    clearAuthSession();
    navigate("/");
  }

  const summary = selectedConversation?.candidate_report?.summary || "No summary generated yet.";
  const resumeText = selectedConversation?.context?.resume_text || "";
  const jdText = selectedConversation?.context?.jd_text || "";
  const transcript = (selectedConversation?.messages || [])
    .map((message) => ({
      type: message.type,
      content: message.data?.content || "",
    }))
    .filter((message) => message.type !== "system");
  const reportReady = Boolean(selectedConversation?.candidate_report_pdf);
  const interviewComplete = Boolean(selectedConversation?.candidate_report);

  async function handleDownloadReport() {
    if (!selectedConversationId) {
      return;
    }

    try {
      const blob = await downloadConversationReport(selectedConversationId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selectedConversationId}-candidate-report.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || "Unable to download report.");
    }
  }

  return (
    <main className="recruiter-shell">
      <header className="recruiter-header">
        <div>
          <p className="brand-mark">AudioBot Recruiter</p>
          <p className="header-note">Signed in as {user?.full_name || user?.email || "Recruiter"}.</p>
        </div>
        <div className="recruiter-actions">
          <button className="ghost-button" onClick={handleSignOut} type="button">Sign out</button>
        </div>
      </header>

      <section className="recruiter-grid">
        <aside className="recruiter-sidebar">
          <div className="recruiter-panel">
            <p className="panel-label">Conversation Queue</p>
            {loading ? <p className="status-copy">Loading sessions...</p> : null}
            {!loading && !conversationIds.length ? <p className="empty-copy">No conversations found yet.</p> : null}
            <div className="recruiter-session-list">
              {conversationIds.map((conversationId) => (
                <button
                  key={conversationId}
                  className={`session-list-item ${conversationId === selectedConversationId ? "is-active" : ""}`}
                  onClick={() => setSelectedConversationId(conversationId)}
                  type="button"
                >
                  <span>{conversationId}</span>
                  <small>View transcript and report</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="recruiter-stage">
          <div className="recruiter-panel recruiter-detail-panel">
            <div className="recruiter-detail-header">
              <div>
                <p className="panel-label">Interview Review</p>
                <h2>{selectedConversationId || "Choose a conversation"}</h2>
              </div>
              {selectedConversationId ? (
                <span className={`report-status-badge ${reportReady ? "is-ready" : interviewComplete ? "is-complete" : "is-pending"}`}>
                  {reportReady ? "Report Ready" : interviewComplete ? "Interview Complete" : "Interview In Progress"}
                </span>
              ) : null}
            </div>

            {loadingConversation ? <p className="status-copy">Loading conversation details...</p> : null}
            {!loadingConversation && selectedConversation ? (
              <>
                <div className="recruiter-report-card recruiter-highlight-card">
                  <strong>Review Status</strong>
                  <p>
                    {reportReady
                      ? "The interview is complete and the candidate report PDF is ready for download."
                      : interviewComplete
                        ? "The interview is complete. Report generation finished partially, but the PDF is not available yet."
                        : "This interview is still active. The report download becomes available once the interview is completed."}
                  </p>
                </div>
                <div className="recruiter-report-card">
                  <strong>Report Summary</strong>
                  <p>{summary}</p>
                </div>
                <div className="recruiter-report-card">
                  <strong>Previous conversation</strong>
                  {transcript.length ? (
                    <div className="recruiter-transcript-list">
                      {transcript.map((message, index) => (
                        <article key={`${message.type}-${index}`} className={`recruiter-transcript-item ${message.type}`}>
                          <span>{message.type === "human" ? "Candidate" : "AudioBot"}</span>
                          <p>{message.content}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>No transcript is available yet for this session.</p>
                  )}
                </div>
                <div className="recruiter-report-card">
                  <strong>Resume Text</strong>
                  {resumeText ? (
                    <pre className="recruiter-context-text">{resumeText}</pre>
                  ) : (
                    <p>No resume text is stored for this session.</p>
                  )}
                </div>
                <div className="recruiter-report-card">
                  <strong>Job Description Text</strong>
                  {jdText ? (
                    <pre className="recruiter-context-text">{jdText}</pre>
                  ) : (
                    <p>No job description text is stored for this session.</p>
                  )}
                </div>
                {reportReady ? (
                  <button className="auth-submit recruiter-download" onClick={handleDownloadReport} type="button">
                    Download Candidate Report
                  </button>
                ) : null}
              </>
            ) : null}
            {!loadingConversation && !selectedConversationId ? (
              <p className="empty-copy">Select a conversation from the queue to review it.</p>
            ) : null}
            {error ? <p className="error-copy">{error}</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
