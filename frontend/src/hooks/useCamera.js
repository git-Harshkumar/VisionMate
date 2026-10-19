/**
 * useCamera – Custom React Hook
 * File: frontend/src/hooks/useCamera.js
 *
 * Manages camera stream lifecycle, frame capture via canvas, cleanup,
 * device enumeration, and seamless switching between integrated and phone webcams
 * (such as Iriun Webcam, DroidCam, or external USB cameras).
 */

import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Default constraints intentionally omit `facingMode` because virtual cameras
 * (Iriun Webcam, DroidCam, Camo, etc.) do NOT report any facingMode capability.
 * Using facingMode causes OverconstrainedError on those devices.
 */
const DEFAULT_CONSTRAINTS = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

/** Bare-minimum fallback when even resolution hints fail (some virtual cams). */
const MINIMAL_CONSTRAINTS = { video: true, audio: false };

export function useCamera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [resolution, setResolution] = useState({ width: 0, height: 0 });
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  /** Discover all available video input devices (webcams, Iriun, DroidCam, etc.) */
  const updateDeviceList = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoInputs);
      console.log(
        "[useCamera] Discovered video devices:",
        videoInputs.map((d) => `${d.label || "(unlabelled)"} [${d.deviceId?.slice(0, 8)}…]`)
      );

      // Auto-select phone webcam if present and nothing chosen yet
      if (videoInputs.length > 0) {
        setSelectedDeviceId((current) => {
          if (current) return current;
          const phoneCam = videoInputs.find((d) => {
            const label = d.label.toLowerCase();
            return (
              label.includes("iriun") ||
              label.includes("droidcam") ||
              label.includes("phone") ||
              label.includes("camo")
            );
          });
          const chosen = phoneCam || videoInputs[0];
          console.log("[useCamera] Auto-selected device:", chosen.label || chosen.deviceId);
          return chosen.deviceId;
        });
      }
    } catch {
      // Enumeration before initial user grant may have empty labels, which updates after startCamera
    }
  }, []);

  /**
   * Attach a MediaStream to the <video> element and update state.
   * Extracted so every success path goes through the same logic.
   */
  const attachStream = useCallback(
    async (stream) => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        console.log("[useCamera] Stream active:", track.label, settings);
        setResolution({ width: settings.width || 0, height: settings.height || 0 });
        if (settings.deviceId) {
          setSelectedDeviceId(settings.deviceId);
        }
      }
      setIsStreaming(true);
      await updateDeviceList();
    },
    [updateDeviceList]
  );

  /** Start the camera stream and attach it to the video element. */
  const startCamera = useCallback(
    async (targetDeviceId) => {
      setError(null);
      const deviceId = targetDeviceId || selectedDeviceId;

      // Stop previous stream if running
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      /**
       * Progressive constraint chain — try the most specific first, then
       * fall back through increasingly relaxed constraints so that virtual
       * cameras (Iriun, DroidCam, etc.) that reject resolution hints or
       * deviceId: exact still get a chance to connect.
       */
      const attempts = [];

      if (deviceId) {
        // 1️⃣ Exact device + ideal resolution
        attempts.push({
          label: `exact device ${deviceId.slice(0, 8)}… + ideal res`,
          constraints: {
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
        });
        // 2️⃣ Exact device, no resolution hints (some virtual cams choke on resolution)
        attempts.push({
          label: `exact device ${deviceId.slice(0, 8)}… bare`,
          constraints: {
            video: { deviceId: { exact: deviceId } },
            audio: false,
          },
        });
        // 3️⃣ Preferred (non-exact) device — lets the browser pick a close match
        attempts.push({
          label: `preferred device ${deviceId.slice(0, 8)}…`,
          constraints: {
            video: { deviceId: { ideal: deviceId } },
            audio: false,
          },
        });
      }

      // 4️⃣ Default constraints (any camera, ideal resolution)
      attempts.push({
        label: "default (any camera, ideal res)",
        constraints: DEFAULT_CONSTRAINTS,
      });

      // 5️⃣ Minimal — just { video: true }
      attempts.push({
        label: "minimal (video: true)",
        constraints: MINIMAL_CONSTRAINTS,
      });

      let lastErr = null;
      for (const attempt of attempts) {
        try {
          console.log(`[useCamera] Trying: ${attempt.label}`);
          const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
          console.log(`[useCamera] ✅ Success with: ${attempt.label}`);
          await attachStream(stream);
          return; // success — stop trying
        } catch (err) {
          console.warn(`[useCamera] ❌ Failed (${attempt.label}):`, err.name, err.message);
          lastErr = err;
        }
      }

      // All attempts exhausted
      const message =
        lastErr?.name === "NotAllowedError"
          ? "Camera access denied. Please allow camera permission and refresh."
          : lastErr?.name === "NotFoundError"
          ? "No camera device found. If using Iriun Webcam, make sure the Iriun app is running on both PC and phone."
          : lastErr?.name === "NotReadableError"
          ? "Camera is in use by another application. Close other apps using the camera and try again."
          : `Camera error: ${lastErr?.message || "Unknown error"}`;
      setError(message);
      setIsStreaming(false);
    },
    [selectedDeviceId, attachStream]
  );

  /** Switch active camera to another device (e.g. from laptop cam to Iriun phone cam) */
  const switchCamera = useCallback(
    async (newDeviceId) => {
      setSelectedDeviceId(newDeviceId);
      if (isStreaming) {
        await startCamera(newDeviceId);
      }
    },
    [isStreaming, startCamera]
  );

  /** Stop all camera tracks and detach from video element. */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  /** Capture current frame to an off-screen canvas and return base64 Data URI. */
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !isStreaming) return null;
    const video = videoRef.current;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.8);
  }, [isStreaming]);

  // Enumerate devices on mount and listen for hardware changes (connecting phone)
  useEffect(() => {
    updateDeviceList();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", updateDeviceList);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", updateDeviceList);
      };
    }
  }, [updateDeviceList]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    isStreaming,
    error,
    resolution,
    devices,
    selectedDeviceId,
    startCamera,
    stopCamera,
    switchCamera,
    captureFrame,
  };
}
