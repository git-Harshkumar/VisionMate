/**
 * NavigationCard Component
 * File: frontend/src/components/NavigationCard.jsx
 *
 * Real-time Safe Walking Path & Indoor Obstacle Avoidance HUD.
 * Evaluates 3-corridor clearance (Left, Center Walking Path, Right)
 * and displays actionable directional guidance (Straight, Veer Right, Veer Left, Stop).
 * When STOP is triggered, shows numbered next-step instructions instead of dead-end message.
 */

import React from "react";
import { Icon } from "./Icon";

function getStatusStyle(status) {
  switch (status) {
    case "clear":
      return {
        badge: "badge-success",
        label: "CLEAR",
        icon: "check",
        bg: "rgba(0, 212, 170, 0.08)",
        border: "rgba(0, 212, 170, 0.35)",
        color: "var(--accent-secondary)",
      };
    case "caution":
      return {
        badge: "badge-warning",
        label: "CAUTION",
        icon: "alert-triangle",
        bg: "rgba(255, 169, 64, 0.08)",
        border: "rgba(255, 169, 64, 0.35)",
        color: "var(--accent-warning)",
      };
    case "blocked":
    default:
      return {
        badge: "badge-danger",
        label: "BLOCKED",
        icon: "x",
        bg: "rgba(255, 77, 79, 0.12)",
        border: "rgba(255, 77, 79, 0.45)",
        color: "var(--accent-danger)",
      };
  }
}

function getActionBanner(action) {
  switch (action) {
    case "straight":
      return {
        icon: "arrow-up",
        title: "SAFE FORWARD PATH",
        subtitle: "Walk straight ahead",
        bg: "linear-gradient(135deg, rgba(0, 212, 170, 0.25), rgba(0, 212, 170, 0.05))",
        border: "var(--accent-secondary)",
        textColor: "var(--accent-secondary)",
      };
    case "veer_right":
      return {
        icon: "arrow-up-right",
        title: "STEP RIGHT — SAFE CORRIDOR",
        subtitle: "Center path obstructed, veer slightly right",
        bg: "linear-gradient(135deg, rgba(255, 169, 64, 0.25), rgba(255, 169, 64, 0.05))",
        border: "var(--accent-warning)",
        textColor: "var(--accent-warning)",
      };
    case "veer_left":
      return {
        icon: "arrow-up-left",
        title: "STEP LEFT — SAFE CORRIDOR",
        subtitle: "Center path obstructed, veer slightly left",
        bg: "linear-gradient(135deg, rgba(255, 169, 64, 0.25), rgba(255, 169, 64, 0.05))",
        border: "var(--accent-warning)",
        textColor: "var(--accent-warning)",
      };
    case "stop":
    default:
      return {
        icon: "octagon",
        title: "STOP — PATH BLOCKED",
        subtitle: "Follow the steps below to find a clear route",
        bg: "linear-gradient(135deg, rgba(255, 77, 79, 0.35), rgba(255, 77, 79, 0.1))",
        border: "var(--accent-danger)",
        textColor: "var(--accent-danger)",
      };
  }
}

/** Parses "Here is what to do: First, ... Second, ..." into numbered steps */
function parseStopSteps(guidanceSpeech) {
  if (!guidanceSpeech) return [];
  const afterColon = guidanceSpeech.split("Here is what to do:")[1];
  if (!afterColon) return [];
  return afterColon
    .split(/First,|Second,|If still blocked,|If everything is blocked,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function NavigationCard({ navigation, onSpeakGuidance, paused = false }) {
  // Reading Mode pauses the inspection loop, so any stored guidance is STALE.
  // Never show old walking directions while paused: hide them entirely and say
  // clearly that nothing is being checked right now.
  if (paused) {
    return (
      <div className="card" style={{ padding: "20px" }} role="region" aria-label="Navigation paused while reading mode is on">
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="compass" size={20} />
          <span>Safe Walking Path Guide</span>
        </h3>
        <div className="nav-paused" role="alert">
          <Icon name="pause" size={22} />
          <div>
            <strong>Paused while Reading Mode is on</strong>
            <p>
              No camera frames are being checked for obstacles right now, and earlier
              directions are hidden because they may be out of date. Do not walk by old
              guidance. Turn Reading Mode off to resume live obstacle detection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!navigation) {
    return (
      <div className="card" style={{ padding: "20px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="compass" size={20} />
          <span>Safe Walking Path Guide</span>
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "8px" }}>
          Awaiting camera frames to assess walkable corridors and ground obstacles.
        </p>
      </div>
    );
  }

  const { 
    action, 
    guidance_speech, 
    corridors, 
    urgent_hazard, 
    primary_obstacle, 
    obstacle_explanation, 
    next_steps 
  } = navigation;
  const banner = getActionBanner(action);

  // Normalize corridor payloads defensively: a partial or malformed corridor
  // object must never crash the whole render tree.
  const emptyCorridor = { status: "clear", obstacles: [], clearance_score: 1.0 };
  const normalizeCorridor = (c) => ({
    ...emptyCorridor,
    ...(c || {}),
    obstacles: Array.isArray(c?.obstacles) ? c.obstacles : [],
  });
  const leftInfo  = normalizeCorridor(corridors?.left);
  const centerInfo= normalizeCorridor(corridors?.center);
  const rightInfo = normalizeCorridor(corridors?.right);

  const leftStyle   = getStatusStyle(leftInfo.status);
  const centerStyle = getStatusStyle(centerInfo.status);
  const rightStyle  = getStatusStyle(rightInfo.status);

  const isStop = action === "stop";
  const displaySteps = (next_steps && next_steps.length > 0)
    ? next_steps
    : (isStop ? parseStopSteps(guidance_speech) : []);

  return (
    <div
      className="card"
      style={{
        padding: "20px",
        border: `1.5px solid ${banner.border}`,
        position: "relative",
        overflow: "hidden",
      }}
      role="region"
      aria-live="polite"
      aria-label="Indoor navigation and safe walking path guidance"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <Icon name="compass" size={20} />
          <span>Safe Walking Path Guide</span>
        </h3>
        <span className="badge badge-purple" style={{ textTransform: "uppercase" }}>
          Indoor Mobility
        </span>
      </div>

      {/* Urgent Floor / Trip Hazard Warning */}
      {urgent_hazard && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255, 77, 79, 0.18)",
            border: "1px solid var(--accent-danger)",
            borderRadius: "var(--radius-sm)",
            color: "#ff7875",
            fontSize: "0.85rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "14px",
          }}
          role="alert"
        >
          <Icon name="alert-triangle" size={16} />
          <span>Caution: {urgent_hazard}</span>
        </div>
      )}

      {/* Primary Directional Action Banner */}
      <div
        style={{
          background: banner.bg,
          border: `1px solid ${banner.border}`,
          borderRadius: "var(--radius-md)",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "14px",
        }}
      >
        <div style={{ lineHeight: 1, color: banner.textColor }} aria-hidden="true">
          <Icon name={banner.icon} size={38} strokeWidth={2.4} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "1.0rem", fontWeight: 700, color: banner.textColor }}>
            {banner.title}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "2px" }}>
            {primary_obstacle
              ? `${primary_obstacle} detected — ${banner.subtitle.toLowerCase()}`
              : banner.subtitle}
          </div>
        </div>
        {guidance_speech && onSpeakGuidance && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onSpeakGuidance(guidance_speech)}
            aria-label="Replay walking guidance aloud"
            title="Read guidance aloud"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <Icon name="volume" size={14} /> Hear
            </span>
          </button>
        )}
      </div>

      {/* ── Clear Explanation of What is Ahead and Why ── */}
      {obstacle_explanation && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "14px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
          }}
        >
          <span style={{ flexShrink: 0, color: "var(--accent-info)", marginTop: "1px" }}>
            <Icon name="info" size={17} />
          </span>
          <div>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "3px", fontWeight: 700 }}>
              What is ahead & Why:
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: "1.45" }}>
              {obstacle_explanation}
            </div>
          </div>
        </div>
      )}

      {/* ── NUMBERED STEP-BY-STEP GUIDANCE ── */}
      {displaySteps.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: isStop ? "var(--accent-danger)" : "var(--accent-secondary)", marginBottom: "8px", fontWeight: 600 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Icon name="list" size={14} /> {isStop ? "What to do next:" : "Next steps:"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {displaySteps.map((step, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "8px 12px",
                  background: isStop ? "rgba(255, 77, 79, 0.06)" : "rgba(0, 212, 170, 0.05)",
                  border: isStop ? "1px solid rgba(255, 77, 79, 0.2)" : "1px solid rgba(0, 212, 170, 0.15)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <span
                  style={{
                    minWidth: "22px",
                    height: "22px",
                    background: isStop ? "rgba(255, 77, 79, 0.3)" : "rgba(0, 212, 170, 0.2)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    color: isStop ? "#ff7875" : "var(--accent-secondary)",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontSize: "0.82rem", color: "var(--text-primary)", lineHeight: "1.45" }}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Corridor Spatial HUD */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "8px" }}>
          Corridor Clearance — Left / Center / Right:
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: "8px" }}>
          {/* Left Corridor */}
          <div
            style={{
              padding: "10px",
              background: leftStyle.bg,
              border: `1px solid ${leftStyle.border}`,
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>◀ Left</div>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: leftStyle.color, marginTop: "4px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name={leftStyle.icon} size={12} /> {leftStyle.label}
              </span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px", minHeight: "14px" }}>
              {leftInfo.obstacles.length > 0 ? leftInfo.obstacles.slice(0,2).join(", ") : "Path Open"}
            </div>
          </div>

          {/* Center Corridor (Direct Walking Path) */}
          <div
            style={{
              padding: "10px",
              background: centerStyle.bg,
              border: `2px solid ${centerStyle.border}`,
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontSize: "0.73rem", color: "var(--text-primary)", fontWeight: 700 }}>● Center</div>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: centerStyle.color, marginTop: "4px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name={centerStyle.icon} size={12} /> {centerStyle.label}
              </span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", marginTop: "4px", minHeight: "14px" }}>
              {centerInfo.obstacles.length > 0 ? centerInfo.obstacles.slice(0,2).join(", ") : "Path Clear"}
            </div>
          </div>

          {/* Right Corridor */}
          <div
            style={{
              padding: "10px",
              background: rightStyle.bg,
              border: `1px solid ${rightStyle.border}`,
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>Right ▶</div>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: rightStyle.color, marginTop: "4px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name={rightStyle.icon} size={12} /> {rightStyle.label}
              </span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px", minHeight: "14px" }}>
              {rightInfo.obstacles.length > 0 ? rightInfo.obstacles.slice(0,2).join(", ") : "Path Open"}
            </div>
          </div>
        </div>
      </div>

      {/* Natural Audio Guidance Phrase (short version) */}
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(255, 255, 255, 0.03)",
          borderRadius: "var(--radius-sm)",
          fontSize: "0.83rem",
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          lineHeight: "1.5",
        }}
      >
        <span style={{ color: "var(--accent-secondary)", flexShrink: 0, marginTop: "2px" }}>
          <Icon name="message" size={15} />
        </span>
        <span style={{ fontStyle: "italic" }}>
          &ldquo;{guidance_speech || "Path assessment in progress..."}&rdquo;
        </span>
      </div>
    </div>
  );
}
