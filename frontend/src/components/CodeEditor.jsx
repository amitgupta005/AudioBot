import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";

const SUPPORTED_LANGUAGES = [
  { id: "python", name: "Python" },
  { id: "javascript", name: "JavaScript" },
  { id: "java", name: "Java" },
  { id: "cpp", name: "C++" },
  { id: "sql", name: "SQL" },
  { id: "go", name: "Go" },
  { id: "typescript", name: "TypeScript" },
];

const BOILERPLATE = {
  python: '# Write your solution here\ndef solution():\n    pass\n',
  javascript: '// Write your solution here\nfunction solution() {\n  \n}\n',
  java: '// Write your solution here\nclass Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n',
  cpp: '// Write your solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  sql: '-- Write your query here\nSELECT \n',
  go: '// Write your solution here\npackage main\n\nfunc main() {\n\t\n}\n',
  typescript: '// Write your solution here\nfunction solution(): void {\n  \n}\n',
};

const MAX_CODE_SIZE = 10_000;

export default function CodeEditor({ onSubmit, disabled, submissions = [], challengeDeadline }) {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState(BOILERPLATE.python);
  const [showHistory, setShowHistory] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!challengeDeadline) {
      setTimeLeft(null);
      return;
    }

    function updateTimer() {
      const now = Date.now();
      const remaining = Math.max(0, challengeDeadline - now);
      setTimeLeft(remaining);
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [challengeDeadline]);

  const isTimeUp = timeLeft !== null && timeLeft <= 0;
  const isEditorDisabled = disabled || isTimeUp;

  // Format mm:ss
  const formatTime = (ms) => {
    if (ms === null) return "";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const charCount = (code || "").length;
  const isEmpty = !(code || "").trim() || (code || "").trim() === (BOILERPLATE[language] || "").trim();
  const isOverLimit = charCount > MAX_CODE_SIZE;

  function handleLanguageChange(e) {
    const newLang = e.target.value;
    setLanguage(newLang);
    // Only replace code with boilerplate if the editor is currently empty or has default boilerplate
    if (isEmpty) {
      setCode(BOILERPLATE[newLang] || "");
    }
  }

  function handleSubmit() {
    if (isEmpty || isOverLimit || isEditorDisabled) return;
    onSubmit(code, language);
    // Don't clear — let the candidate iterate on their code
  }

  function handleReset() {
    setCode(BOILERPLATE[language] || "");
  }

  return (
    <div className="code-editor-wrapper">
      {/* Header bar */}
      <div className="code-editor-toolbar">
        <div className="code-editor-toolbar-left">
          <select
            value={language}
            onChange={handleLanguageChange}
            disabled={isEditorDisabled}
            className="code-editor-lang-select"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>

          <span className={`code-editor-char-count ${isOverLimit ? "is-over" : ""}`}>
            {charCount.toLocaleString()} / {MAX_CODE_SIZE.toLocaleString()}
          </span>

          {timeLeft !== null && (
            <span className={`code-editor-timer ${isTimeUp ? "is-up" : ""}`} style={{ color: isTimeUp ? "#f44747" : "#d4d4d4", fontSize: "0.82rem", fontWeight: "600", marginLeft: "12px", fontFamily: "monospace", padding: "4px 8px", background: "#333", borderRadius: "6px" }}>
              ⏳ {formatTime(timeLeft)}
            </span>
          )}
        </div>

        <div className="code-editor-toolbar-right">
          {submissions.length > 0 && (
            <button
              className="code-editor-history-btn"
              onClick={() => setShowHistory((v) => !v)}
              type="button"
            >
              {showHistory ? "Editor" : `History (${submissions.length})`}
            </button>
          )}
          <button
            className="code-editor-reset-btn"
            onClick={handleReset}
            disabled={isEditorDisabled || isEmpty}
            type="button"
          >
            Reset
          </button>
          <button
            className="code-editor-submit-btn"
            onClick={handleSubmit}
            disabled={isEditorDisabled || isEmpty || isOverLimit}
            type="button"
          >
            {isTimeUp ? "Time's Up" : disabled ? "Reviewing…" : "Submit Code"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="code-editor-body">
        {showHistory ? (
          <div className="code-editor-history">
            <p className="code-editor-history-title">Submission History</p>
            {submissions.length === 0 ? (
              <p className="code-editor-history-empty">No submissions yet.</p>
            ) : (
              submissions.map((sub, idx) => (
                <article key={idx} className="code-editor-history-item">
                  <div className="code-editor-history-meta">
                    <span className="code-editor-history-badge">{sub.language}</span>
                    <span className="code-editor-history-time">
                      Submission {idx + 1}
                      {sub.timestamp
                        ? ` · ${new Intl.DateTimeFormat(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(sub.timestamp))}`
                        : ""}
                    </span>
                  </div>
                  <pre className="code-editor-history-code">{sub.code}</pre>
                </article>
              ))
            )}
          </div>
        ) : (
          <>
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                readOnly: isEditorDisabled,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                lineNumbers: "on",
                renderLineHighlight: "all",
                automaticLayout: true,
                tabSize: language === "python" ? 4 : 2,
                padding: { top: 12 },
              }}
            />
            {disabled && (
              <div className="code-editor-loading-overlay">
                <div className="code-editor-loading-spinner" />
                <span>AI is reviewing your code…</span>
              </div>
            )}
            {isTimeUp && !disabled && (
              <div className="code-editor-loading-overlay" style={{ background: "rgba(30, 30, 30, 0.9)" }}>
                <span style={{ fontSize: "1.2rem", fontWeight: "700", color: "#f44747" }}>Time's up!</span>
                <span>You can no longer edit this solution.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
