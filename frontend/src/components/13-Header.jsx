/**
 * Header Component
 * File: frontend/src/components/Header.jsx
 *
 * Application top navigation bar and accessibility banner.
 */

import React from "react";
import { Icon } from "./Icon";

export function Header({
  apiHealth,
  speechLanguage = "en-US",
  speechLanguages = [{ code: "en-US", label: "English" }],
  onSpeechLanguageChange,
  speechVoiceMissing = false,
}) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "16px",
        paddingBottom: "24px",
        borderBottom: "1px solid var(--border-subtle)",
        marginBottom: "24px",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h1 style={{ fontSize: "2rem", margin: 0 }}>
            <span className="gradient-text">VisionMate</span>
          </h1>
          <span className="badge badge-purple">v1.0 Assistive AI</span>
        </div>
        <p style={{ marginTop: "4px", fontSize: "0.9rem" }}>
          AI Visual Assistant for Spatial Awareness, Obstacle Prioritization & Accessible OCR
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        {/* Speech output language selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            htmlFor="speech-language-select"
            style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "5px" }}
          >
            <Icon name="volume" size={12} /> Speech Language
          </label>
          <select
            id="speech-language-select"
            className="btn btn-ghost btn-sm"
            style={{
              padding: "6px 10px",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "0.8rem",
            }}
            value={speechLanguage}
            onChange={(e) => onSpeechLanguageChange && onSpeechLanguageChange(e.target.value)}
            aria-label="Choose the language spoken announcements and readings use"
          >
            {speechLanguages.map((lang) => (
              <option key={lang.code} value={lang.code} style={{ background: "#1a1d2e", color: "#fff" }}>
                {lang.label}
              </option>
            ))}
          </select>
          {speechVoiceMissing && (
            <span
              role="alert"
              style={{ fontSize: "0.7rem", color: "var(--accent-warning)", maxWidth: "220px" }}
            >
              No voice for this language is installed on this device. Add one in Windows Settings &gt; Time &amp; Language &gt; Speech, or speech may not sound right.
            </span>
          )}
        </div>

        {/* Safety Disclaimer Badge */}
        <div
          style={{
            padding: "6px 12px",
            background: "rgba(255, 169, 64, 0.1)",
            border: "1px solid rgba(255, 169, 64, 0.3)",
            borderRadius: "var(--radius-full)",
            fontSize: "0.75rem",
            color: "var(--accent-warning)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          title="VisionMate is an assistive perception prototype, not a certified navigation device."
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="alert-triangle" size={13} /> Perception Prototype</span>
        </div>

        {/* Link to Swagger Docs */}
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          aria-label="Open backend FastAPI Swagger API documentation in new tab"
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>API Docs <Icon name="external" size={13} /></span>
        </a>
      </div>
    </header>
  );
}
