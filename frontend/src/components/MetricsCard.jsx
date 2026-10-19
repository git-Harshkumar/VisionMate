/**
 * MetricsCard Component
 * File: frontend/src/components/MetricsCard.jsx
 *
 * Telemetry and latency analysis card.
 * Shows preprocessing time, model inference, prioritizer runtime, and total end-to-end response.
 */

import React from "react";

export function MetricsCard({ metrics, totalLatencyMs }) {
  if (!metrics) {
    return (
      <div className="card" style={{ padding: "20px" }}>
        <h3 style={{ marginBottom: "12px" }}>📊 Perception Telemetry</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Awaiting first frame inspection for telemetry benchmarks.
        </p>
      </div>
    );
  }

  const preprocess = (metrics.preprocess_time_ms || 0).toFixed(1);
  const inference = (metrics.inference_time_ms || 0).toFixed(1);
  const prioritizer = (metrics.prioritizer_time_ms || 0).toFixed(1);
  const totalBackend = (metrics.total_backend_time_ms || 0).toFixed(1);
  const roundtrip = totalLatencyMs ? totalLatencyMs.toFixed(0) : totalBackend;

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3>📊 Perception Telemetry</h3>
        <span className="badge badge-success">
          ~{(1000 / Math.max(Number(totalBackend), 1)).toFixed(1)} FPS Max Cap
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px" }}>
        <div style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Network + Roundtrip</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-secondary)", marginTop: "4px" }}>
            {roundtrip} ms
          </div>
        </div>

        <div style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>YOLOv8 Inference</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-primary)", marginTop: "4px" }}>
            {inference} ms
          </div>
        </div>

        <div style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Spatial Prioritizer</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-warning)", marginTop: "4px" }}>
            {prioritizer} ms
          </div>
        </div>

        <div style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Raw Detections</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
            {metrics.raw_detection_count ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}
