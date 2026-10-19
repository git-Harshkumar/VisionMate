/**
 * VisionMate - Accessible AI Visual Assistant
 * File: frontend/src/App.jsx
 *
 * Core application coordinating:
 * - Real-time camera acquisition (navigator.mediaDevices)
 * - Dynamic frame capture & throttling (1 frame / 1.5s to prevent cognitive/audio overload)
 * - Object detection & spatial prioritization API (/api/v1/inspect-json)
 * - Temporal tracking cooldowns for deduplicated natural announcements
 * - Web Speech API synthesis with replay, pause, and mute controls
 * - On-demand EasyOCR text extraction (/api/v1/read-text-json)
 * - Accessible keyboard shortcuts (Space, R, T, I, M)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import "./styles/components.css";

import { useCamera } from "./hooks/useCamera";
import { useSpeech } from "./hooks/useSpeech";
import { useSpatialAudio } from "./hooks/useSpatialAudio";
import { fetchHealth, inspectFrame, readTextFromFrame } from "./services/visionmateApi";

import { Header } from "./components/Header";
import { CameraStatus } from "./components/CameraStatus";
import { ErrorMessage } from "./components/ErrorMessage";
import { CameraPreview } from "./components/CameraPreview";
import { NavigationCard } from "./components/NavigationCard";
import { SpeechBanner } from "./components/SpeechBanner";
import { ControlPanel } from "./components/ControlPanel";
import { DetectionOverlay } from "./components/DetectionOverlay";
import { ReadTextButton } from "./components/ReadTextButton";
import { MetricsCard } from "./components/MetricsCard";

const THROTTLE_MS = 2500; // 2.5s interval — slower than 1.6s to prevent contradictory rapid-fire guidance

export default function App() {
  // Camera & Audio Hooks
  const {
    videoRef,
    isStreaming,
    error: cameraError,
    resolution,
    devices,
    selectedDeviceId,
    startCamera,
    stopCamera,
    switchCamera,
    captureFrame,
  } = useCamera();

  const {
    speak,
    cancel: cancelSpeech,
    repeat: repeatSpeech,
    isSpeaking,
    lastText: lastSpokenText,
  } = useSpeech({ rate: 0.95, pitch: 1.0 });

  const { playDirectionalChime } = useSpatialAudio();

  // Navigation & Perception State
  const [navigationMode, setNavigationMode] = useState(true);
  const [isInspecting, setIsInspecting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [annotatedImage, setAnnotatedImage] = useState(null);

  // Telemetry & Results
  const [latestInspection, setLatestInspection] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [totalLatencyMs, setTotalLatencyMs] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);

  // On-Demand OCR State
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);

  // Sample static image fallback (when no physical webcam is present)
  const [sampleImage, setSampleImage] = useState(null);

  // Ref to track processing to avoid race conditions in setInterval/timeout
  const processingRef = useRef(false);
  processingRef.current = isProcessing;

  const audioMutedRef = useRef(audioMuted);
  audioMutedRef.current = audioMuted;

  const navigationModeRef = useRef(navigationMode);
  navigationModeRef.current = navigationMode;

  const lastNavActionRef = useRef(null);
  const lastNavSpeechTimeRef = useRef(0);

  // Navigation temporal smoothing: ring buffer of last N actions to require consistency
  // before speaking. Prevents "move forward" → "stop" flip-flop between frames.
  const NAV_HISTORY_SIZE = 3;
  const NAV_CONSISTENCY_THRESHOLD = 2; // action must appear this many times in history
  const NAV_SPEECH_COOLDOWN_MS = 6000; // minimum gap between nav announcements
  const navActionHistoryRef = useRef([]);

  // 1. Initial Health Check
  useEffect(() => {
    let mounted = true;
    async function checkHealth() {
      try {
        const health = await fetchHealth();
        if (mounted) setApiHealth(health);
      } catch (err) {
        if (mounted) {
          setErrorMessage(
            "Backend server is offline or unreachable at http://localhost:8000. Please ensure the FastAPI server is running."
          );
        }
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Sync camera errors to user message
  useEffect(() => {
    if (cameraError) {
      setErrorMessage(cameraError);
    }
  }, [cameraError]);

  /**
   * Process a single frame through the inspection pipeline.
   */
  const processFrame = useCallback(
    async (frameDataUri) => {
      if (!frameDataUri || processingRef.current) return;

      setIsProcessing(true);
      setErrorMessage(null);
      const startTime = performance.now();

      try {
        const response = await inspectFrame(frameDataUri, showAnnotated);
        const elapsed = performance.now() - startTime;
        setTotalLatencyMs(elapsed);
        setLatestInspection(response);
        setFrameCount((prev) => prev + 1);

        if (response.annotated_image || response.annotated_image_base64) {
          setAnnotatedImage(response.annotated_image || response.annotated_image_base64);
        }

        // Voice & Spatial Audio Guidance Logic
        if (!audioMutedRef.current) {
          if (navigationModeRef.current && response.navigation) {
            const nav = response.navigation;
            const now = Date.now();

            // ── Temporal smoothing: push to ring buffer ──
            const history = navActionHistoryRef.current;
            history.push(nav.action);
            if (history.length > NAV_HISTORY_SIZE) history.shift();

            // Count how many of the last N frames agree on this action
            const actionCount = history.filter((a) => a === nav.action).length;
            const isConsistent = actionCount >= NAV_CONSISTENCY_THRESHOLD;

            const actionChanged = nav.action !== lastNavActionRef.current;
            const cooldownPassed = now - lastNavSpeechTimeRef.current > NAV_SPEECH_COOLDOWN_MS;
            const isUrgent = !!nav.urgent_hazard;

            // Speak only if: (a) action is temporally stable AND (changed OR cooldown expired),
            // OR (b) genuine urgent hazard (bypasses consistency but still needs cooldown unless truly urgent)
            const shouldSpeak =
              (isConsistent && (actionChanged || cooldownPassed)) ||
              (isUrgent && (now - lastNavSpeechTimeRef.current > 3000));

            if (shouldSpeak) {
              playDirectionalChime(nav.action);

              // Build a full spoken message: short guidance + numbered next steps
              // This ensures the blind user hears every actionable instruction, not just the one-liner.
              let fullSpeech = nav.guidance_speech || "";
              const steps = nav.next_steps;
              if (steps && steps.length > 0) {
                const stepOrdinals = ["First", "Second", "Third", "Fourth", "Fifth"];
                const stepText = steps
                  .map((s, i) => `${stepOrdinals[i] || `Step ${i + 1}`}, ${s}`)
                  .join(". ");
                fullSpeech = `${fullSpeech} Here is what to do: ${stepText}.`;
              }

              speak(fullSpeech);
              lastNavActionRef.current = nav.action;
              lastNavSpeechTimeRef.current = now;
            }
          } else {
            // Scene Perception / Object Catalog announcement
            if (
              response.new_announcements &&
              response.new_announcements.length > 0
            ) {
              const speechText = response.new_announcements.join(". ");
              speak(speechText);
            } else if (response.speech_text || response.announcement) {
              speak(response.speech_text || response.announcement);
            }
          }
        }
      } catch (err) {
        console.error("Frame inspection failed:", err);
        setErrorMessage(`Inspection error: ${err.message}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [showAnnotated, speak, playDirectionalChime]
  );

  /**
   * Manual Single Inspection Trigger
   */
  const handleInspectOnce = useCallback(() => {
    const frame = captureFrame() || sampleImage;
    if (frame) {
      processFrame(frame);
    } else {
      setErrorMessage("No active video feed or sample image to inspect.");
    }
  }, [captureFrame, sampleImage, processFrame]);

  /**
   * On-Demand OCR Trigger
   */
  const handleTriggerOcr = useCallback(async () => {
    const frame = captureFrame() || sampleImage;
    if (!frame) {
      setErrorMessage("Please start the camera or upload an image before reading text.");
      return;
    }

    setOcrLoading(true);
    setErrorMessage(null);

    try {
      const result = await readTextFromFrame(frame);
      setOcrResult(result);

      if (!audioMutedRef.current && (result.speech_text || result.spoken_summary)) {
        speak(result.speech_text || result.spoken_summary);
      }
    } catch (err) {
      console.error("OCR request failed:", err);
      setErrorMessage(`OCR failed: ${err.message}`);
    } finally {
      setOcrLoading(false);
    }
  }, [captureFrame, sampleImage, speak]);

  /**
   * Continuous Acquisition Loop
   */
  useEffect(() => {
    if (!isStreaming || !isInspecting) return;

    const timer = setInterval(() => {
      if (!processingRef.current) {
        const frame = captureFrame();
        if (frame) {
          processFrame(frame);
        }
      }
    }, THROTTLE_MS);

    return () => clearInterval(timer);
  }, [isStreaming, isInspecting, captureFrame, processFrame]);

  /**
   * Handle Sample Static Image Upload
   */
  const handleSampleImageLoaded = useCallback(
    (dataUrl) => {
      setSampleImage(dataUrl);
      processFrame(dataUrl);
    },
    [processFrame]
  );

  /**
   * Keyboard Shortcuts Handler (Accessibility requirement)
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input or textarea
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        setIsInspecting((prev) => !prev);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNavigationMode((prev) => !prev);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        repeatSpeech();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        handleTriggerOcr();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        handleInspectOnce();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setAudioMuted((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [repeatSpeech, handleTriggerOcr, handleInspectOnce]);

  return (
    <div className="app-container">
      {/* Header */}
      <Header apiHealth={apiHealth} />

      {/* Live System Health & Telemetry Bar */}
      <div style={{ marginBottom: "20px" }}>
        <CameraStatus
          apiHealth={apiHealth}
          isStreaming={isStreaming}
          resolution={resolution}
          frameCount={frameCount}
          isInspecting={isInspecting}
          navigationMode={navigationMode}
        />
      </div>

      {/* Accessible Error / Alert Banner */}
      {errorMessage && (
        <div style={{ marginBottom: "20px" }}>
          <ErrorMessage
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        </div>
      )}

      {/* Main Two-Column Accessibility Dashboard */}
      <main className="main-layout" role="main">
        {/* Left Column: Visual Stream, Speech Banner & Primary Controls */}
        <div className="column-stack">
          {/* Camera View */}
          <CameraPreview
            videoRef={videoRef}
            isStreaming={isStreaming}
            isProcessing={isProcessing}
            annotatedImage={annotatedImage}
            showAnnotated={showAnnotated}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onStartCamera={startCamera}
            onSwitchCamera={switchCamera}
            onSampleImageLoaded={handleSampleImageLoaded}
          />

          {/* Spoken Announcement Banner */}
          <SpeechBanner
            lastAnnouncement={
              lastSpokenText ||
              (navigationMode && latestInspection?.navigation?.guidance_speech
                ? latestInspection.navigation.guidance_speech
                : latestInspection?.speech_text ||
                  latestInspection?.announcement)
            }
            isSpeaking={isSpeaking}
            audioMuted={audioMuted}
            onRepeat={repeatSpeech}
            onCancel={cancelSpeech}
          />

          {/* Primary Controls */}
          <ControlPanel
            isStreaming={isStreaming}
            isInspecting={isInspecting}
            isProcessing={isProcessing}
            audioMuted={audioMuted}
            showAnnotated={showAnnotated}
            navigationMode={navigationMode}
            onToggleCamera={() => (isStreaming ? stopCamera() : startCamera())}
            onToggleInspection={() => setIsInspecting((prev) => !prev)}
            onInspectOnce={handleInspectOnce}
            onRepeatSpeech={repeatSpeech}
            onToggleMute={() => setAudioMuted((prev) => !prev)}
            onToggleAnnotated={() => setShowAnnotated((prev) => !prev)}
            onToggleNavigationMode={() => setNavigationMode((prev) => !prev)}
          />
        </div>

        {/* Right Column: Safe Path Guide, OCR, Prioritized Detections & Metrics */}
        <div className="column-stack">
          {/* Safe Walking Path & Corridor Navigation Guide */}
          <NavigationCard
            navigation={latestInspection?.navigation}
            onSpeakGuidance={(text) => speak(text)}
          />

          {/* On-Demand Text Reader (OCR) */}
          <ReadTextButton
            isStreaming={isStreaming || !!sampleImage}
            isLoading={ocrLoading}
            ocrResult={ocrResult}
            onTriggerOcr={handleTriggerOcr}
            onSpeakText={(text) => speak(text)}
          />

          {/* Prioritized Detections List */}
          <DetectionOverlay
            detections={
              latestInspection?.detections ||
              latestInspection?.prioritized_detections ||
              []
            }
            totalCount={
              latestInspection?.prioritized_count ??
              latestInspection?.total_detected_count ??
              latestInspection?.summary_metrics?.prioritized_count ??
              0
            }
          />

          {/* Latency & Telemetry */}
          <MetricsCard
            metrics={
              latestInspection
                ? {
                    preprocess_time_ms: 0,
                    inference_time_ms: latestInspection.inference_time_ms,
                    prioritizer_time_ms: Math.max(
                      0,
                      (latestInspection.total_time_ms || 0) -
                        (latestInspection.inference_time_ms || 0)
                    ),
                    total_backend_time_ms: latestInspection.total_time_ms,
                    raw_detection_count: latestInspection.total_detected_count,
                    prioritized_count: latestInspection.prioritized_count,
                    ...latestInspection.summary_metrics,
                  }
                : null
            }
            totalLatencyMs={totalLatencyMs}
          />
        </div>
      </main>

      {/* Accessible Footer */}
      <footer className="app-footer">
        <div>
          <strong>VisionMate</strong> — Assistive Visual Perception System. Built with YOLOv8, EasyOCR, FastAPI & React.
        </div>
        <ul className="footer-nav">
          <li>
            <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer">
              FastAPI Docs
            </a>
          </li>
          <li>
            <a href="http://localhost:8000/api/v1/health" target="_blank" rel="noopener noreferrer">
              Health Check
            </a>
          </li>
          <li>
            <a href="http://localhost:8000/api/v1/model-info" target="_blank" rel="noopener noreferrer">
              Model Info
            </a>
          </li>
        </ul>
      </footer>
    </div>
  );
}
