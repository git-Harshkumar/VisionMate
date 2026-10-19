/**
 * Header Component
 * File: frontend/src/components/Header.jsx
 *
 * Application top navigation bar and accessibility banner.
 */

import React from "react";

export function Header({ apiHealth }) {
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
          <span>⚠️ Perception Prototype</span>
        </div>

        {/* Link to Swagger Docs */}
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          aria-label="Open backend FastAPI Swagger API documentation in new tab"
        >
          <span>API Docs ↗</span>
        </a>
      </div>
    </header>
  );
}
