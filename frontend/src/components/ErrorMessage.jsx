/**
 * ErrorMessage Component
 * File: frontend/src/components/ErrorMessage.jsx
 *
 * Screen-reader assertive alert component for camera permission denials,
 * backend connection drops, or model errors.
 */

import React from "react";

export function ErrorMessage({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div
      className="error-message"
      role="alert"
      aria-live="assertive"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="error-icon" aria-hidden="true">
          ⚠️
        </span>
        <span>{message}</span>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#ff7a94",
            cursor: "pointer",
            fontWeight: 700,
            padding: "4px 8px",
          }}
          aria-label="Dismiss error message"
        >
          ✕
        </button>
      )}
    </div>
  );
}
