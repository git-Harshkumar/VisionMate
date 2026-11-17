/**
 * useOrientation - Custom React Hook for Camera Misalignment Guidance
 * File: frontend/src/hooks/useOrientation.js
 *
 * Uses the DeviceOrientation API to monitor device pitch (forward/backward tilt)
 * and roll (side-to-side tilt). Provides gentle, debounced cues for visually
 * impaired users to keep the phone at an optimal walking/viewing angle.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export function useOrientation({ onOrientationIssue, isEnabled = true } = {}) {
  const [pitch, setPitch] = useState(null); // beta: [-180, 180]
  const [roll, setRoll] = useState(null);   // gamma: [-90, 90]
  const [guidanceMessage, setGuidanceMessage] = useState(null);

  const lastSpokenTimeRef = useRef(0);
  const consecutiveIssuesRef = useRef(0);

  const handleOrientation = useCallback((event) => {
    if (!isEnabled) return;
    const beta = event.beta;   // front-to-back tilt in degrees
    const gamma = event.gamma; // left-to-right tilt in degrees

    if (beta === null || gamma === null) return;

    setPitch(Math.round(beta));
    setRoll(Math.round(gamma));

    // Ideal walking navigation angle: Phone held vertically or slightly tilted forward (60° to 95°)
    let issue = null;

    // Pointing too low at the floor / shoes
    if (beta < 45 && beta > -30) {
      issue = "Tilt camera up slightly";
    }
    // Pointing too high at the ceiling / sky
    else if (beta > 115 || beta < -120) {
      issue = "Tilt camera down slightly";
    }
    // Heavily rolled sideways
    else if (Math.abs(gamma) > 35) {
      issue = "Hold phone upright";
    }

    setGuidanceMessage(issue);

    if (issue) {
      consecutiveIssuesRef.current += 1;
      const now = Date.now();
      // Responsive guidance: trigger after ~1.0s of sustained tilt with a 6-second gap
      if (consecutiveIssuesRef.current >= 4 && now - lastSpokenTimeRef.current > 6000) {
        lastSpokenTimeRef.current = now;
        consecutiveIssuesRef.current = 0;
        if (onOrientationIssue) {
          onOrientationIssue(issue);
        }
      }
    } else {
      consecutiveIssuesRef.current = 0;
    }
  }, [isEnabled, onOrientationIssue]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.DeviceOrientationEvent) {
      return;
    }

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [handleOrientation]);

  return { pitch, roll, guidanceMessage };
}

