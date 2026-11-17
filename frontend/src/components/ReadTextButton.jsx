/**
 * ReadTextButton Component
 * File: frontend/src/components/ReadTextButton.jsx
 *
 * Reading Mode card: dedicated accessible controls for on-demand OCR text
 * extraction plus the Reading & Item Mode toggle (which pauses obstacle
 * detection while the user holds an item up to the camera).
 * Avoids cognitive overload by executing optical character recognition
 * ONLY when explicitly triggered by the user.
 */

import React, { useState } from "react";
import { Icon } from "./Icon";

export function ReadTextButton({
  isStreaming,
  isLoading,
  ocrResult,
  vlmText,
  isReadingMode,
  onToggleReadingMode,
  onTriggerOcr,
  onSpeakText,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = vlmText || ocrResult?.total_text;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const blockCount = ocrResult?.total_blocks_count ?? ocrResult?.block_count ?? 0;
  const hasText = !!(ocrResult?.total_text || ocrResult?.full_text);

  return (
    <div className="card reader-card" style={{ padding: "20px" }}>
      <div className="reader-card-header">
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><Icon name="book-open" size={20} /> Reading Mode</h3>
        <span className="badge badge-info">OCR Engine: EasyOCR</span>
      </div>

      <p className="reader-card-subtitle">
        Pause obstacle guidance, hold documents, signs, labels, or packaging in
        front of the camera, and trigger reading on demand.
      </p>

      {/* Reading & Item Mode Toggle */}
      <button
        type="button"
        onClick={onToggleReadingMode}
        className={`mode-btn ${isReadingMode ? "active" : ""}`}
        aria-pressed={isReadingMode}
        aria-label="Toggle Reading and Item Examination Mode"
      >
        <Icon name="book" size={18} className="mode-btn-icon" />
        <span>
          {isReadingMode
            ? "Reading Mode Active — obstacles paused"
            : "Switch to Reading & Item Mode"}
        </span>
        <span className="mode-btn-state">{isReadingMode ? "On" : "Off"}</span>
      </button>

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
            <Icon name="search" size={20} />
            <span>Read Text in View</span>
          </>
        )}
      </button>

      {/* AI (VLM) Rich Reading */}
      {vlmText && (
        <div
          className="vlm-reading"
          role="region"
          aria-live="polite"
          aria-label="AI item reading"
        >
          <div className="vlm-reading-label"><Icon name="sparkles" size={13} style={{ marginRight: "5px" }} />AI Reading</div>
          <div className="vlm-reading-text">{vlmText}</div>
        </div>
      )}

      {/* OCR Result Display Card */}
      {ocrResult && (
        <div
          className="ocr-result"
          role="region"
          aria-live="polite"
          aria-label="Optical character recognition results"
        >
          <div className="ocr-result-header">
            <span className="ocr-result-meta">
              {blockCount > 0
                ? `Found ${blockCount} text block(s) in ${(ocrResult.inference_time_ms || 0).toFixed(0)}ms`
                : "No text detected"}
            </span>

            {(hasText || vlmText) && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onSpeakText && onSpeakText(vlmText || ocrResult.speech_text || ocrResult.spoken_summary)}
                  aria-label="Speak text aloud again"
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="volume" size={14} /> Speak</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleCopy}
                  aria-label="Copy extracted text to clipboard"
                >
                  {copied ? (<span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="check" size={14} /> Copied</span>) : (<span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="copy" size={14} /> Copy</span>)}
                </button>
              </div>
            )}
          </div>

          <div className="ocr-text-body">
            {ocrResult.total_text || ocrResult.full_text || "No readable text detected in current view."}
          </div>

          {ocrResult.framing_guidance && (
            <div className="ocr-framing" role="alert">
              <Icon name="scan" size={15} /> <strong>Framing Cue:</strong> {ocrResult.framing_guidance}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
