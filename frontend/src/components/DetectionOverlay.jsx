/**
 * DetectionOverlay Component
 * File: frontend/src/components/DetectionOverlay.jsx
 *
 * Visualizes prioritized detected objects, spatial positioning (left/center/right),
 * relative visual prominence (prominent/mid-range/distant), and confidence levels.
 */

import React from "react";

const HAZARD_LABELS = new Set([
  "car", "truck", "bus", "motorcycle", "bicycle", "traffic light", "stop sign",
  "stairs", "hole", "fire hydrant", "train"
]);

function getPositionBadge(position) {
  const pos = (position || "").toLowerCase();
  if (pos.includes("left")) {
    return <span className="badge badge-info">◀ Left</span>;
  }
  if (pos.includes("right")) {
    return <span className="badge badge-info">Right ▶</span>;
  }
  return <span className="badge badge-purple">● Center</span>;
}

function getProminenceBadge(prominence) {
  const prom = (prominence || "").toLowerCase();
  if (prom.includes("prominent") || prom.includes("close") || prom.includes("near")) {
    return <span className="badge badge-warning">⚠ Prominent / Near</span>;
  }
  if (prom.includes("mid")) {
    return <span className="badge badge-purple">Mid-range</span>;
  }
  return <span className="badge badge-success">Distant</span>;
}

export function DetectionOverlay({ detections = [], totalCount = 0 }) {
  const isSafetyHazard = (label) => HAZARD_LABELS.has(label?.toLowerCase());

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>👁️ Observed Objects</span>
        </h3>
        <span className="badge badge-purple" aria-label={`${detections.length} objects detected`}>
          {detections.length} {detections.length === 1 ? "Object" : "Objects"}
        </span>
      </div>

      {detections.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--text-muted)" }}>
          <p style={{ fontSize: "0.95rem" }}>No prioritized objects currently in view.</p>
          <p style={{ fontSize: "0.8rem", marginTop: "4px" }}>
            The scene appears clear or objects are below detection threshold.
          </p>
        </div>
      ) : (
        <ul
          className="detection-overlay"
          role="list"
          aria-label="List of prioritized detected objects with spatial orientation"
          style={{ listStyle: "none", padding: 0 }}
        >
          {detections.map((det, index) => {
            const isHazard = isSafetyHazard(det.label);
            const confPct = Math.round((det.confidence || 0) * 100);

            return (
              <li
                key={`${det.label}-${index}-${det.track_id || 0}`}
                className={`detection-item ${isHazard ? "priority" : ""}`}
                role="listitem"
              >
                {/* Object Name & Hazard Indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                  {isHazard && (
                    <span
                      title="Safety-relevant obstacle"
                      aria-label="Safety hazard warning"
                      style={{ color: "var(--accent-warning)" }}
                    >
                      ⚠️
                    </span>
                  )}
                  <span className="detection-label">
                    {det.label}
                    {det.track_id !== undefined && (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "6px" }}>
                        #trk-{det.track_id}
                      </span>
                    )}
                  </span>
                </div>

                {/* Spatial Position & Prominence Badges */}
                <div className="detection-meta">
                  {getPositionBadge(det.position)}
                  {getProminenceBadge(det.prominence)}

                  {/* Confidence Bar */}
                  <div
                    className="confidence-bar-wrap"
                    title={`Confidence: ${confPct}%`}
                    aria-label={`Confidence ${confPct} percent`}
                  >
                    <div className="confidence-bar" style={{ width: `${confPct}%` }} />
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "32px", textAlign: "right" }}>
                    {confPct}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
