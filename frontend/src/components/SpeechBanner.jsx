/**
 * SpeechBanner Component
 * File: frontend/src/components/SpeechBanner.jsx
 *
 * Real-time accessibility speech monitor. Displays the live or most recently
 * spoken announcement text, speech activity indicator, and audio controls.
 */

import React from "react";
import { Icon } from "./Icon";

export function SpeechBanner({
  lastAnnouncement,
  isSpeaking,
  audioMuted,
  onRepeat,
  onCancel,
}) {
  return (
    <div
      className={`speech-banner ${isSpeaking ? "active" : ""}`}
      role="region"
      aria-live="polite"
      aria-label="Spoken assistant audio output"
    >
      <div className="speech-icon" aria-hidden="true">
        <Icon name={isSpeaking ? "volume" : "message"} size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: isSpeaking ? "var(--accent-secondary)" : "var(--text-muted)", marginBottom: "2px" }}>
          {isSpeaking ? "Speaking Aloud..." : audioMuted ? "Audio Muted" : "Spoken Announcement"}
        </div>
        <div
          style={{
            fontWeight: 500,
            fontSize: "0.88rem",
            color: "var(--text-primary)",
            lineHeight: "1.5",
            maxHeight: "80px",
            overflowY: "auto",
          }}
          aria-live="polite"
        >
          {lastAnnouncement || "Perception ready. Waiting for frame inspection..."}
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
        {isSpeaking && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            aria-label="Stop current speech playback"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="square" size={12} /> Stop</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRepeat}
          disabled={!lastAnnouncement}
          aria-label="Replay last speech announcement"
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="repeat" size={14} /> Replay</span>
        </button>
      </div>
    </div>
  );
}
