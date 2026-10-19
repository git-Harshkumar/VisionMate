/**
 * CameraPreview Component
 * File: frontend/src/components/CameraPreview.jsx
 *
 * Renders the live video feed from navigator.mediaDevices, scanning animations,
 * live stream indicator, and fallback UI with test image support when camera is inactive.
 */

import React, { useRef } from "react";

export function CameraPreview({
  videoRef,
  isStreaming,
  isProcessing,
  annotatedImage,
  showAnnotated,
  devices = [],
  selectedDeviceId = "",
  onStartCamera,
  onSwitchCamera,
  onSampleImageLoaded,
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result && onSampleImageLoaded) {
        onSampleImageLoaded(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <section
      className="camera-preview-wrapper"
      role="region"
      aria-label="Live camera view and visual perception stream"
    >
      {/* Live Video Element */}
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        autoPlay
        style={{ display: isStreaming && !showAnnotated ? "block" : "none" }}
        aria-label="Live camera feed"
      />

      {/* Annotated Debug View (when enabled & available) */}
      {showAnnotated && annotatedImage && (
        <img
          src={
            annotatedImage.startsWith("data:")
              ? annotatedImage
              : `data:image/jpeg;base64,${annotatedImage}`
          }
          alt="Visual bounding box debug overlay"
          className="camera-video"
          style={{ objectFit: "contain", transform: "none" }}
        />
      )}

      {/* Camera Inactive Fallback */}
      {!isStreaming && (!showAnnotated || !annotatedImage) && (
        <div className="camera-idle-placeholder" role="status">
          <div className="idle-icon" aria-hidden="true">
            📷
          </div>
          <div style={{ textAlign: "center", padding: "0 24px", maxWidth: "480px" }}>
            <h3 style={{ marginBottom: "8px" }}>Camera Inactive</h3>
            <p style={{ marginBottom: "16px", fontSize: "0.9rem" }}>
              Connect your phone or start your camera for real-time visual assistance.
            </p>

            {/* Camera Device Selector (e.g. Phone Webcam vs Laptop Cam) */}
            {devices.length > 1 && (
              <div style={{ marginBottom: "16px", textAlign: "left" }}>
                <label
                  htmlFor="camera-select"
                  style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}
                >
                  Select Camera Source:
                </label>
                <select
                  id="camera-select"
                  className="btn btn-ghost"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                  value={selectedDeviceId}
                  onChange={(e) => onSwitchCamera && onSwitchCamera(e.target.value)}
                >
                  {devices.map((device, idx) => (
                    <option key={device.deviceId || idx} value={device.deviceId} style={{ background: "#1a1d2e", color: "#fff" }}>
                      {device.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onStartCamera && onStartCamera(selectedDeviceId)}
                aria-label="Turn on camera stream"
              >
                <span>▶ Start Camera</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload a test image for inspection"
              >
                <span>📁 Upload Image</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for sample image loading */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Live Streaming Badge + On-the-fly Camera Switcher */}
      {isStreaming && (
        <div style={{ position: "absolute", top: "12px", left: "12px", right: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "none" }}>
          <div className="live-indicator" aria-label="Camera is live" style={{ pointerEvents: "auto" }}>
            <div className="live-dot" />
            <span>LIVE</span>
          </div>

          {devices.length > 1 && (
            <select
              style={{
                pointerEvents: "auto",
                background: "rgba(10, 11, 20, 0.85)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "0.75rem",
                padding: "4px 8px",
              }}
              value={selectedDeviceId}
              onChange={(e) => onSwitchCamera && onSwitchCamera(e.target.value)}
              aria-label="Switch active camera source"
            >
              {devices.map((device, idx) => (
                <option key={device.deviceId || idx} value={device.deviceId} style={{ background: "#1a1d2e", color: "#fff" }}>
                  📷 {device.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Scanning Shimmer Effect during inference */}
      {isProcessing && <div className="scan-overlay" aria-hidden="true" />}
    </section>
  );
}
