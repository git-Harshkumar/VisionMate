/**
 * CameraStatus Component
 * File: frontend/src/components/CameraStatus.jsx
 *
 * Displays system health indicators, backend API connectivity,
 * camera resolution, and inference loop telemetry.
 */

import React from "react";

export function CameraStatus({
  apiHealth,
  isStreaming,
  resolution,
  frameCount = 0,
  isInspecting,
  navigationMode = true,
}) {
  const isApiOnline = apiHealth?.status === "ok";

  return (
    <div
      className="card"
      style={{
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
      }}
      role="status"
      aria-label="System status bar"
    >
      {/* Backend API Connection Status */}
      <div className="camera-status">
        <span
          className={`status-dot ${isApiOnline ? "active" : ""}`}
          style={{ background: isApiOnline ? "var(--accent-secondary)" : "var(--accent-danger)" }}
        />
        <span>
          Backend:{" "}
          <strong style={{ color: isApiOnline ? "var(--accent-secondary)" : "var(--accent-danger)" }}>
            {isApiOnline ? "Online (FastAPI)" : "Connecting..."}
          </strong>
        </span>
      </div>

      {/* Assistive Navigation Mode */}
      <div className="camera-status">
        <span
          className="status-dot active"
          style={{ background: navigationMode ? "var(--accent-secondary)" : "var(--accent-primary)" }}
        />
        <span>
          Guide:{" "}
          <strong style={{ color: navigationMode ? "var(--accent-secondary)" : "var(--accent-primary)" }}>
            {navigationMode ? "Safe Walking Corridor" : "Object Catalog"}
          </strong>
        </span>
      </div>

      {/* Camera Stream Resolution */}
      <div className="camera-status">
        <span className={`status-dot ${isStreaming ? "active" : ""}`} />
        <span>
          Camera:{" "}
          <strong>
            {isStreaming
              ? `${resolution.width}x${resolution.height} px`
              : "Inactive"}
          </strong>
        </span>
      </div>

      {/* Frames Analyzed & Perception Status */}
      <div className="camera-status">
        <span
          className={`status-dot ${isInspecting ? "active" : ""}`}
          style={{ background: isInspecting ? "var(--accent-warning)" : "var(--text-muted)" }}
        />
        <span>
          Frames: <strong>{frameCount}</strong> ({isInspecting ? "Running" : "Paused"})
        </span>
      </div>
    </div>
  );
}
