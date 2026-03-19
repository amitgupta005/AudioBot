function formatTime(value) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function Sidebar({
  currentSessionId,
  sessions,
  systemMessage,
  systemExpanded,
  onToggleSystem,
  onSelectSession,
  onNewSession,
  socketState,
}) {
  return (
    <aside className="sidebar-shell">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">Interview Session</p>
          <h2>Context Console</h2>
        </div>
        <button className="ghost-button" onClick={onNewSession} type="button">
          New Session
        </button>
      </div>

      <div className="sidebar-panel">
        <p className="panel-label">Current thread</p>
        <code className="session-chip" data-testid="current-session-id">{currentSessionId}</code>
        <div className="status-grid">
          <div className="status-card">
            <span>Connection</span>
            <strong>{socketState}</strong>
          </div>
          <div className="status-card">
            <span>Prompt</span>
            <strong>{systemMessage ? "Ready" : "Pending"}</strong>
          </div>
        </div>
        <button className="secondary-button" onClick={onToggleSystem} type="button">
          {systemExpanded ? "Hide System Prompt" : "View System Prompt"}
        </button>
        {systemExpanded ? (
          <pre className="system-prompt">{systemMessage || "No prompt loaded for this session yet."}</pre>
        ) : null}
      </div>

      <div className="sidebar-panel sidebar-grow">
        <p className="panel-label">Recent sessions</p>
        <div className="session-list">
          {sessions.length ? (
            sessions.map((session) => (
              <button
                key={session.id}
                className={`session-list-item ${session.id === currentSessionId ? "is-active" : ""}`}
                data-testid={`session-link-${session.id}`}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span>{session.id}</span>
                <small>{formatTime(session.lastVisitedAt || session.createdAt)}</small>
              </button>
            ))
          ) : (
            <p className="empty-copy">No saved sessions yet.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
