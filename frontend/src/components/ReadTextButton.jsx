/**
 * ReadTextButton Component
 * File: frontend/src/components/ReadTextButton.jsx
 *
 * Dedicated accessible control for on-demand OCR text extraction.
 * Avoids cognitive overload by executing optical character recognition
 * ONLY when explicitly triggered by the user.
 */

import React, { useState } from "react";

export function ReadTextButton({
  isStreaming,
  isLoading,
  ocrResult,
  onTriggerOcr,
  onSpeakText,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (ocrResult?.full_text) {
      navigator.clipboard.writeText(ocrResult.full_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3>📖 On-Demand Text Reader</h3>
        <span className="badge badge-info">OCR Engine: EasyOCR</span>
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
        Hold documents, signs, labels, or medication packaging in front of the camera and trigger reading.
      </p>

      {/* Main Accessible Button */}
      <button
        type="button"
        className="read-text-btn"
        onClick={onTriggerOcr}
        disabled={!isStreaming || isLoading}
        aria-busy={isLoading}
        aria-label="Read text visible in the current camera frame"
        title="Shortcut: T"
      >
        {isLoading ? (
          <>
            <div className="spinner" style={{ borderTopColor: "var(--accent-info)" }} />
            <span>Scanning & Reading Text...</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: "1.3rem" }}>🔍</span>
            <span>Read Text in View</span>
          </>
        )}
      </button>

      {/* OCR Result Display Card */}
      {ocrResult && (
        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            background: "rgba(76, 201, 240, 0.05)",
            border: "1px solid rgba(76, 201, 240, 0.25)",
            borderRadius: "var(--radius-md)",
            animation: "fade-up 0.3s ease",
          }}
          role="region"
          aria-live="polite"
          aria-label="Optical character recognition results"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent-info)" }}>
              {(ocrResult.total_blocks_count ?? ocrResult.block_count ?? 0) > 0
                ? `Found ${ocrResult.total_blocks_count ?? ocrResult.block_count} text block(s) in ${(ocrResult.inference_time_ms || 0).toFixed(0)}ms`
                : "No text detected"}
            </span>

            {(ocrResult.total_text || ocrResult.full_text) && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onSpeakText && onSpeakText(ocrResult.speech_text || ocrResult.spoken_summary)}
                  aria-label="Speak text aloud again"
                >
                  🔊 Speak
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleCopy}
                  aria-label="Copy extracted text to clipboard"
                >
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: "0.95rem",
              lineHeight: "1.5",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "150px",
              overflowY: "auto",
              padding: "10px",
              background: "rgba(0, 0, 0, 0.2)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {ocrResult.total_text || ocrResult.full_text || "No readable text detected in current view."}
          </div>
        </div>
      )}
    </div>
  );
}
