import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../landing.css";

const NAV_LINKS = [
  { label: "Recruiters", href: "#features" },
  { label: "Candidates", href: "#features" },
  { label: "Company", href: "#ai-agent" },
  { label: "Pricing", href: "#cta" },
];

const PARTNERS = [
  "DELOITTE", "MCKINSEY", "BCG", "KORN FERRY", "MERCER",
];

const FEATURES = [
  {
    tag: "For Recruiters",
    icon: "📊",
    title: "Unbiased Assessment",
    desc: "Our platform strips away subconscious bias by focusing on natural speech, cognitive reasoning, and design methodology through AI-driven structured analysis.",
  },
  {
    tag: "For Candidates",
    icon: "🎙️",
    title: "The Voice-First Advantage",
    desc: "Your portfolio is more than just images. Articulate your design philosophy in natural conversation. Capture your unique creative perspective and professional voice.",
  },
  {
    tag: "For Recruiters",
    icon: "⚡",
    title: "Pipeline Velocity",
    desc: "Reduce time-to-hire by 65%. Let Noventra handle the first three rounds of interviews, delivering a curated shortlist of only the most exceptional candidates.",
  },
  {
    tag: "For Candidates",
    icon: "🌐",
    title: "Global Opportunities",
    desc: "Access the most prestigious firms worldwide. From startups in Copenhagen to leaders in Tokyo. Your voice, heard by the best — anywhere, anytime.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function scrollTo(hash) {
    setMenuOpen(false);
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="landing-page">
      {/* ── Navbar ── */}
      <nav className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <a href="/" className="lp-logo" aria-label="Noventra Analytics Home">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <line x1="12" y1="22" x2="12" y2="15.5" />
              <line x1="22" y1="8.5" x2="12" y2="15.5" />
              <line x1="2" y1="8.5" x2="12" y2="15.5" />
            </svg>
            NOVENTRA ANALYTICS
          </a>

          <ul className="lp-nav-links">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  onClick={(e) => { e.preventDefault(); scrollTo(link.href); }}
                  className={link.label === "Recruiters" ? "is-active" : ""}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="lp-nav-actions">
            <button className="lp-btn-ghost" onClick={() => navigate("/auth")} type="button">
              Log in
            </button>
            <button className="lp-btn-primary" onClick={() => navigate("/auth")} type="button">
              Get Started
            </button>
          </div>

          <button
            className="lp-hamburger"
            onClick={() => setMenuOpen(true)}
            type="button"
            aria-label="Open menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Mobile Menu ── */}
      <div className={`lp-mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <button className="lp-mobile-close" onClick={() => setMenuOpen(false)} type="button" aria-label="Close menu">✕</button>
        {NAV_LINKS.map((link) => (
          <a key={link.label} href={link.href} onClick={(e) => { e.preventDefault(); scrollTo(link.href); }}>
            {link.label}
          </a>
        ))}
        <a href="/auth" onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/auth"); }}>
          Log in
        </a>
      </div>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div className="lp-fade-in">
            <span className="lp-eyebrow">AI-Powered Recruitment</span>
            <h1 className="lp-hero-title">
              Hire the <em>Visionaries,</em> Not Just the Resumes.
            </h1>
            <p className="lp-hero-subtitle">
              The first AI-powered hiring platform designed specifically for the
              world's most sophisticated talent. We connect high-stakes firms with
              exceptional minds.
            </p>
            <div className="lp-hero-actions">
              <button className="lp-btn-lg primary" onClick={() => navigate("/auth")} type="button">
                Join as a Recruiter
              </button>
              <button className="lp-btn-lg secondary" onClick={() => navigate("/auth")} type="button">
                Start for Candidates
              </button>
            </div>
          </div>

          <div className="lp-hero-image lp-fade-in delay-2">
            <img src="/images/hero-dashboard.png" alt="Noventra Analytics AI-powered interview dashboard" loading="eager" />
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="lp-social-proof">
        <div className="lp-container">
          <p className="lp-social-label">Trusted by Industry Leaders</p>
          <div className="lp-social-logos">
            {PARTNERS.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Agent ── */}
      <section className="lp-ai-section" id="ai-agent">
        <div className="lp-container lp-ai-grid">
          <div className="lp-ai-image lp-fade-in">
            <img src="/images/ai-agent.png" alt="Noventra AI Agent visualization" loading="lazy" />
          </div>
          <div className="lp-fade-in delay-1">
            <h2 className="lp-ai-title">The Noventra AI Agent</h2>
            <p className="lp-ai-desc">
              Beyond keyword matching. Our AI engages in deep-level professional
              discourse to uncover the thinking behind the decisions.
              Human-centered interviews, powered by precision intelligence.
            </p>
            <div className="lp-ai-pill">
              <span className="lp-ai-pill-icon">🎯</span>
              Human-centered interviews, powered by precision intelligence.
            </div>
            <div className="lp-ai-stats">
              <div>
                <div className="lp-stat-value">98%</div>
                <div className="lp-stat-label">Match Accuracy</div>
              </div>
              <div>
                <div className="lp-stat-value">15min</div>
                <div className="lp-stat-label">Screening Time</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-features" id="features">
        <div className="lp-container">
          <div className="lp-features-grid">
            {FEATURES.map((f, i) => (
              <article key={f.title} className={`lp-feature-card lp-fade-in delay-${i + 1}`}>
                <p className="lp-feature-tag">{f.tag}</p>
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <span className="lp-feature-link">Learn more →</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta" id="cta">
        <div className="lp-container lp-cta-inner">
          <h2 className="lp-cta-title">Ready to build the future?</h2>
          <p className="lp-cta-subtitle">
            Whether you're looking for your next career-defining project or
            seeking the candidate that will define your firm's legacy, the journey
            starts here.
          </p>
          <div className="lp-cta-actions">
            <button className="lp-btn-lg primary" onClick={() => navigate("/auth")} type="button">
              Join the Noventra Platform
            </button>
            <button className="lp-btn-lg secondary" onClick={() => navigate("/auth")} type="button">
              View Pricing
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div>
            <div className="lp-footer-brand">Noventra Analytics</div>
            <p className="lp-footer-note">
              © 2024 Noventra Analytics. Rewriting the<br />
              high-end screening office for the modern era.
            </p>
          </div>
          <ul className="lp-footer-links">
            <li><a href="#features">Privacy</a></li>
            <li><a href="#features">Terms</a></li>
            <li><a href="#features">LinkedIn</a></li>
            <li><a href="#features">Twitter</a></li>
          </ul>
          <div className="lp-footer-right">
            🌐 English (US)
          </div>
        </div>
      </footer>
    </div>
  );
}
