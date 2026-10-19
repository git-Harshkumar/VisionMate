/**
 * ControlPanel Component
 * File: frontend/src/components/ControlPanel.jsx
 *
 * Provides tactile, accessible controls for camera activation, real-time loop pausing,
 * immediate single-frame inspection, speech replay, and audio muting.
 */

import React from "react";

export function ControlPanel({
  isStreaming,
  isInspecting,
  isProcessing,
  audioMuted,
  showAnnotated,
  navigationMode = true,
  onToggleCamera,
  onToggleInspection,
  onInspectOnce,
  onRepeatSpeech,
  onToggleMute,
  onToggleAnnotated,
  onToggleNavigationMode,
}) {
  return (
    <div className="card control-panel" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>🎮 Vision & Audio Controls</h3>
        <span className="badge badge-purple" style={{ fontSize: "0.75rem" }}>
          Shortcuts Active
        </span>
      </div>

      <div className="control-row">
        {/* Camera Start / Stop */}
        <button
          type="button"
          className={`btn ${isStreaming ? "btn-danger" : "btn-primary"}`}
          onClick={onToggleCamera}
          aria-label={isStreaming ? "Stop camera stream" : "Start camera stream"}
        >
          <span>{isStreaming ? "⏹ Stop Camera" : "▶ Start Camera"}</span>
        </button>

        {/* Navigation Mode vs Object Inspection Mode */}
        <button
          type="button"
          className={`btn ${navigationMode ? "btn-success" : "btn-ghost"}`}
          onClick={onToggleNavigationMode}
          aria-label={
            navigationMode
              ? "Active: Safe Walking Path Guidance. Click to switch to Object Catalog."
              : "Active: Object Catalog. Click to switch to Safe Walking Path Guidance."
          }
          title="Shortcut: N (Switch between Safe Path Guide and Object Catalog)"
        >
          <span>{navigationMode ? "🧭 Safe Path Guide: ON" : "👁️ Catalog Mode: ON"}</span>
        </button>

        {/* Continuous Inspection Loop Pause / Resume */}
        <button
          type="button"
          className={`btn ${isInspecting ? "btn-warning" : "btn-ghost"}`}
          onClick={onToggleInspection}
          disabled={!isStreaming}
          aria-label={
            isInspecting
              ? "Pause automated perception loop"
              : "Resume automated perception loop"
          }
          title="Shortcut: Spacebar"
        >
          <span>{isInspecting ? "⏸ Pause Loop" : "▶ Resume Loop"}</span>
        </button>
      </div>

      <div className="control-row">
        {/* Single Manual Inspection */}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onInspectOnce}
          disabled={!isStreaming || isProcessing}
          aria-label="Inspect current camera frame immediately"
          title="Shortcut: I"
        >
          {isProcessing ? (
            <>
              <div className="spinner" style={{ width: "14px", height: "14px" }} />
              <span>Analyzing...</span>
            </>
          ) : (
            <span>⚡ Inspect Now</span>
          )}
        </button>

        {/* Repeat Last Announcement */}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onRepeatSpeech}
          aria-label="Repeat the most recent voice announcement"
          title="Shortcut: R"
        >
          <span>🔁 Repeat Speech</span>
        </button>

        {/* Audio Mute / Unmute */}
        <button
          type="button"
          className={`btn ${audioMuted ? "btn-warning" : "btn-ghost"}`}
          onClick={onToggleMute}
          aria-label={audioMuted ? "Unmute spoken descriptions" : "Mute spoken descriptions"}
        >
          <span>{audioMuted ? "🔇 Audio Muted" : "🔊 Audio On"}</span>
        </button>

        {/* Debug Bounding Box Overlay Toggle */}
        <button
          type="button"
          className={`btn ${showAnnotated ? "btn-primary" : "btn-ghost"}`}
          onClick={onToggleAnnotated}
          aria-label="Toggle visual bounding boxes debug overlay"
        >
          <span>{showAnnotated ? "🎯 Boxes: ON" : "🎯 Boxes: OFF"}</span>
        </button>
      </div>

      {/* Keyboard Shortcuts Helper Bar */}
      <div
        style={{
          marginTop: "6px",
          padding: "10px 14px",
          background: "rgba(255, 255, 255, 0.02)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          fontSize: "0.78rem",
          color: "var(--text-muted)",
        }}
      >
        <span>
          <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>N</kbd> Toggle Safe Guide
        </span>
        <span>
          <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>Space</kbd> Pause/Resume
        </span>
        <span>
          <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>R</kbd> Repeat Speech
        </span>
        <span>
          <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>T</kbd> Read Text (OCR)
        </span>
        <span>
          <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>I</kbd> Inspect Now
        </span>
      </div>
    </div>
  );
}
