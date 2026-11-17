/**
 * VoiceStatusPill - Accessible Voice & Framing Status UI
 * File: frontend/src/components/VoiceStatusPill.jsx
 */

import React from "react";
import { Icon } from "./Icon";

export function VoiceStatusPill({
  isListening,
  lastVoiceFeedback,
  transcript,
  permissionError,
  onRestartVoice,
  guidanceMessage,
  targetObject,
  onClearTarget,
  vlmLoading
}) {
  return (
    <div
      className="voice-status-bar"
      role="region"
      aria-label="Voice and Framing Assistant"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.6rem 1rem",
        backgroundColor: "#161828",
        border: "1px solid #2a2d4a",
        borderRadius: "8px",
        marginBottom: "1rem",
        fontSize: "0.9rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <button
          onClick={onRestartVoice}
          style={{
            background: "none",
            border: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            padding: 0,
            color: "inherit",
          }}
          title={isListening ? "Voice recognition active. Click to restart microphone." : "Voice offline. Click to start."}
          aria-label={isListening ? "Microphone listening" : "Start microphone"}
        >
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: isListening ? "#00d4aa" : "#f43f5e",
              boxShadow: isListening ? "0 0 8px #00d4aa" : "none",
            }}
            aria-hidden="true"
          />
          <span style={{ fontWeight: 600, color: isListening ? "#e2e8f0" : "#f43f5e" }}>
            {isListening ? "Voice Command Active" : "Voice Offline (Tap to Start)"}
          </span>
        </button>

        {vlmLoading && (
          <span style={{ color: "#4cc9f0", fontStyle: "italic", marginLeft: "0.5rem" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="sparkles" size={13} /> Consulting Multimodal AI...</span>
          </span>
        )}

        {lastVoiceFeedback && !vlmLoading && (
          <span style={{ color: "#a5b4fc", marginLeft: "0.5rem" }}>
            "{lastVoiceFeedback}"
          </span>
        )}

        {transcript && isListening && !vlmLoading && (
          <span
            style={{
              color: "#94a3b8",
              fontSize: "0.82rem",
              fontStyle: "italic",
              maxWidth: "250px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={transcript}
          >
            Heard: "{transcript}"
          </span>
        )}

        {permissionError && (
          <span style={{ color: "#f87171", fontSize: "0.85rem", fontWeight: 500 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="alert-triangle" size={13} /> {permissionError}</span>
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {targetObject && (
          <span
            style={{
              backgroundColor: "rgba(255, 169, 64, 0.2)",
              color: "#ffa940",
              border: "1px solid #ffa940",
              padding: "0.2rem 0.6rem",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            Target: <strong>{targetObject}</strong>
            <button
              onClick={onClearTarget}
              style={{
                background: "none",
                border: "none",
                color: "#ffa940",
                cursor: "pointer",
                fontWeight: "bold",
                padding: "0 2px",
              }}
              aria-label={`Stop searching for ${targetObject}`}
            >
              <Icon name="x" size={13} />
            </button>
          </span>
        )}

        {guidanceMessage && (
          <span
            style={{
              backgroundColor: "rgba(244, 63, 94, 0.2)",
              color: "#f43f5e",
              border: "1px solid #f43f5e",
              padding: "0.2rem 0.6rem",
              borderRadius: "4px",
              fontWeight: 500,
            }}
            role="alert"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="scan" size={13} /> {guidanceMessage}</span>
          </span>
        )}
      </div>
    </div>
  );
}
