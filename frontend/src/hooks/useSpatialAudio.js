/**
 * useSpatialAudio - Custom React Hook
 * File: frontend/src/hooks/useSpatialAudio.js
 *
 * Uses the Web Audio API (AudioContext + StereoPannerNode) to generate
 * spatial directional chimes (left ear, right ear, centered, stop alert)
 * and mobile vibration feedback (navigator.vibrate).
 */

import { useRef, useCallback } from "react";

export function useSpatialAudio() {
  const audioCtxRef = useRef(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playDirectionalChime = useCallback((action) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Spatial stereo panning if supported
      let panner = null;
      if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
      }

      if (action === "veer_right") {
        // High pleasant ascending tone panned RIGHT
        osc.type = "sine";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.25);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        if (panner) panner.pan.setValueAtTime(0.85, now);
        if ("vibrate" in navigator) navigator.vibrate([80, 50, 80]);
      } else if (action === "veer_left") {
        // High pleasant ascending tone panned LEFT
        osc.type = "sine";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.25);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        if (panner) panner.pan.setValueAtTime(-0.85, now);
        if ("vibrate" in navigator) navigator.vibrate([80, 50, 80]);
      } else if (action === "stop") {
        // Low urgent warning double pulse
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(180, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        if (panner) panner.pan.setValueAtTime(0.0, now);
        if ("vibrate" in navigator) navigator.vibrate([250, 100, 250]);
      } else {
        // Straight / Clear path: soft centered dual harmonic
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        if (panner) panner.pan.setValueAtTime(0.0, now);
      }

      if (panner) {
        osc.connect(panner);
        panner.connect(gain);
      } else {
        osc.connect(gain);
      }
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // AudioContext autoplay restrictions are handled gracefully
    }
  }, [getAudioContext]);

  return { playDirectionalChime };
}
