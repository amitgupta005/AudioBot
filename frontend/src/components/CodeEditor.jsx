import { useState } from "react";
import Editor from "@monaco-editor/react";

const SUPPORTED_LANGUAGES = [
  { id: "javascript", name: "JavaScript" },
  { id: "python", name: "Python" },
  { id: "java", name: "Java" },
  { id: "cpp", name: "C++" },
  { id: "sql", name: "SQL" }
];

export default function CodeEditor({ onSubmit, disabled }) {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");

  function handleSubmit() {
    if (!code.trim() || disabled) return;
    onSubmit(code, language);
    setCode(""); // Clear after submit
  }

  return (
    <div className="code-editor-container" style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1e1e1e", borderRadius: "8px", overflow: "hidden" }}>
      <div className="code-editor-header" style={{ padding: "8px 16px", background: "#2d2d2d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <select 
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={disabled}
          style={{ background: "#3d3d3d", color: "#fff", border: "none", padding: "4px 8px", borderRadius: "4px", fontSize: "0.875rem" }}
        >
          {SUPPORTED_LANGUAGES.map(lang => (
            <option key={lang.id} value={lang.id}>{lang.name}</option>
          ))}
        </select>
        
        <button 
          onClick={handleSubmit}
          disabled={disabled || !code.trim()}
          style={{ 
            background: disabled || !code.trim() ? "#444" : "var(--primary)", 
            color: disabled || !code.trim() ? "#888" : "#fff", 
            border: "none", 
            padding: "6px 12px", 
            borderRadius: "4px", 
            fontSize: "0.875rem", 
            cursor: disabled || !code.trim() ? "not-allowed" : "pointer" 
          }}
        >
          Submit Code
        </button>
      </div>
      
      <div style={{ flexGrow: 1, position: "relative" }}>
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          value={code}
          onChange={(val) => setCode(val || "")}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            readOnly: disabled,
            scrollBeyondLastLine: false,
            wordWrap: "on"
          }}
        />
      </div>
    </div>
  );
}
