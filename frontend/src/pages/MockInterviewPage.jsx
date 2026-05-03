import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthUser, clearAuthSession } from "../lib/authStore";
import { startMockInterview } from "../lib/api";
import "./MockInterviewPage.css";

function formatFileSize(size = 0) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MockInterviewPage() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form State
  const [resumeFile, setResumeFile] = useState(null);
  const [jdMode, setJdMode] = useState("paste"); // "paste" or "upload"
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState(null);
  const [interviewType, setInterviewType] = useState("hr");
  const [difficulty, setDifficulty] = useState("medium");

  function handleSignOut() {
    clearAuthSession();
    navigate("/");
  }



  async function handleLaunch() {
    setError("");
    if (!resumeFile) {
      setError("Please upload your resume PDF in Step 1.");
      return;
    }
    if (jdMode === "paste" && !jdText.trim()) {
      setError("Please paste the job description in Step 1.");
      return;
    }
    if (jdMode === "upload" && !jdFile) {
      setError("Please upload the job description PDF in Step 1.");
      return;
    }

    setSubmitting(true);
    try {
      const interview = await startMockInterview({
        resumeFile,
        jdText: jdMode === "paste" ? jdText : "",
        jdFile: jdMode === "upload" ? jdFile : null,
        interviewType,
        difficulty,
      });
      navigate(`/chat/${interview.id}`);
    } catch (err) {
      setError(err.message || "Failed to start mock interview.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mock-page-container">
      <header className="mock-page-header">
        <div className="mock-brand">
          <h1>AudioBot <span>Candidate</span></h1>
          <p>Signed in as {user?.full_name || user?.email || "Candidate"}</p>
        </div>
        <div className="mock-header-actions">
          <button className="mock-header-link" onClick={() => navigate("/candidate")} type="button">
            Back to Portal
          </button>
          <button className="mock-header-link" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
      </header>

      <main className="mock-main-content">
        <div className="mock-sidebar">
          <div className="mock-stepper-card">
            <h3>All-in-One Mock Interview Setup</h3>
            <div className="mock-step-item active">
              <div className="mock-step-number">1</div>
              <div className="mock-step-text">Upload Documents</div>
              <div className="mock-step-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              </div>
            </div>
            
            <div style={{ width: "2px", height: "24px", background: "#2563eb", margin: "0 0 0 30px" }}></div>
            
            <div className="mock-step-item active">
              <div className="mock-step-number">2</div>
              <div className="mock-step-text">Interview Settings</div>
              <div className="mock-step-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </div>
            </div>

            <div style={{ width: "2px", height: "24px", background: "#2563eb", margin: "0 0 0 30px" }}></div>

            <div className="mock-step-item active">
              <div className="mock-step-number">3</div>
              <div className="mock-step-text">Review & Launch</div>
              <div className="mock-step-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 2.5a4.7 4.7 0 1 1 6.6 6.6L7 22l-5-1 1-5 13.1-13.5z"></path></svg>
              </div>
            </div>
          </div>

          <div className="mock-info-text">
            <span className="eyebrow">PRACTICE LAB</span>
            <h2>Self-Service Mock Interview</h2>
            <p>Upload a job description and your resume. Choose your interview style and difficulty, and practice in a realistic environment with AI feedback.</p>
          </div>
        </div>

        <div className="mock-form-card">
          {/* Step 1 */}
          <h2 className="mock-section-title">Step 1: Your Documents</h2>
          
          <label className="mock-dropzone">
            <input
              accept="application/pdf"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              type="file"
            />
            <div className="mock-dropzone-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="12" y2="12"></line><line x1="15" y1="15" x2="12" y2="12"></line></svg>
            </div>
            <p className="mock-dropzone-text">Drag & drop your resume PDF here or [Choose file]</p>
            <p className="mock-dropzone-subtext">PDF ONLY</p>
          </label>
          
          {resumeFile && (
            <div className="mock-file-selected">
              Selected: <strong>{resumeFile.name}</strong> ({formatFileSize(resumeFile.size)})
            </div>
          )}

          <div className="mock-jd-header">
            <span className="mock-jd-label">JOB DESCRIPTION</span>
            <div className="mock-jd-toggle">
              <button type="button" className={jdMode === "paste" ? "active" : ""} onClick={() => setJdMode("paste")}>Paste Text</button>
              <button type="button" className={jdMode === "upload" ? "active" : ""} onClick={() => setJdMode("upload")}>Upload PDF</button>
            </div>
          </div>

          {jdMode === "paste" ? (
            <textarea 
              className="mock-textarea" 
              rows={5} 
              placeholder="Paste the full job description here..."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
            />
          ) : (
            <>
              <label className="mock-dropzone">
                <input
                  accept="application/pdf"
                  onChange={(e) => setJdFile(e.target.files?.[0] || null)}
                  type="file"
                />
                <div className="mock-dropzone-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="12" y2="12"></line><line x1="15" y1="15" x2="12" y2="12"></line></svg>
                </div>
                <p className="mock-dropzone-text">Drag & drop your JD PDF here or [Choose file]</p>
              </label>
              {jdFile && (
                <div className="mock-file-selected">
                  Selected: <strong>{jdFile.name}</strong> ({formatFileSize(jdFile.size)})
                </div>
              )}
            </>
          )}

          <div className="mock-divider"></div>

          {/* Step 2 */}
          <h2 className="mock-section-title">Step 2: Configuration</h2>
          <div className="mock-config-grid">
            <div>
              <span className="mock-config-label">INTERVIEW TYPE</span>
              <div className="mock-pill-group">
                <button type="button" className={interviewType === "hr" ? "active" : ""} onClick={() => setInterviewType("hr")}>HR</button>
                <button type="button" className={interviewType === "behavioral" ? "active" : ""} onClick={() => setInterviewType("behavioral")}>Behavioral</button>
                <button type="button" className={interviewType === "technical" ? "active" : ""} onClick={() => setInterviewType("technical")}>Technical</button>
              </div>
            </div>
            <div>
              <span className="mock-config-label">DIFFICULTY</span>
              <div className="mock-pill-group">
                <button type="button" className={difficulty === "easy" ? "active" : ""} onClick={() => setDifficulty("easy")}>Easy</button>
                <button type="button" className={difficulty === "medium" ? "active" : ""} onClick={() => setDifficulty("medium")}>Medium</button>
                <button type="button" className={difficulty === "hard" ? "active" : ""} onClick={() => setDifficulty("hard")}>Hard</button>
              </div>
            </div>
          </div>

          <div className="mock-divider"></div>

          {/* Step 3 */}
          <h2 className="mock-section-title">Review</h2>
          <div className="mock-review-list">
            <div className="mock-review-item">
              <span className="mock-review-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>
              <span><strong>Resume:</strong> {resumeFile ? resumeFile.name : "Not selected"}</span>
            </div>
            <div className="mock-review-item">
              <span className="mock-review-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>
              <span><strong>Job Description:</strong> {jdMode === "paste" ? (jdText.trim() ? "Pasted Text" : "Not provided") : (jdFile ? jdFile.name : "Not selected")}</span>
            </div>
            <div className="mock-review-item">
              <span className="mock-review-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>
              <span style={{textTransform: "capitalize"}}><strong>Type:</strong> {interviewType}, <strong>Difficulty:</strong> {difficulty}</span>
            </div>
          </div>

          {error && <p style={{ color: "#ef4444", marginBottom: "16px", fontWeight: "500", textAlign: "right" }}>{error}</p>}
          
          <button 
            type="button" 
            className="mock-launch-btn" 
            onClick={handleLaunch} 
            disabled={submitting}
          >
            {submitting ? "Launching..." : "Launch Interview"}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 2.5a4.7 4.7 0 1 1 6.6 6.6L7 22l-5-1 1-5 13.1-13.5z"></path></svg>
          </button>
          <div className="clear-fix"></div>
        </div>
      </main>
    </div>
  );
}
