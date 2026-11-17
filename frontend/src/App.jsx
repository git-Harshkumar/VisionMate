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
import { useOrientation } from "./hooks/useOrientation";
import { useVoiceCommands } from "./hooks/useVoiceCommands";
import { fetchHealth, inspectFrame, readTextFromFrame, askVLM } from "./services/visionmateApi";

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
import { VoiceStatusPill } from "./components/VoiceStatusPill";

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
    isSpeakingRef,
    lastText: lastSpokenText,
  } = useSpeech({ rate: 0.95, pitch: 1.0 });

  const { playDirectionalChime } = useSpatialAudio();

  // Navigation & Perception State
  const [navigationMode, setNavigationMode] = useState(true);
  const [isReadingMode, setIsReadingMode] = useState(false); // Dedicated mode when holding item up to read
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

  // Tier 2 Multimodal VLM State & Voice
  const [vlmLoading, setVlmLoading] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const [targetObject, setTargetObject] = useState(null);
  const targetObjectRef = useRef(null);
  targetObjectRef.current = targetObject;

  // Sample static image fallback (when no physical webcam is present)
  const [sampleImage, setSampleImage] = useState(null);

  // Ref to track processing to avoid race conditions in setInterval/timeout
  const processingRef = useRef(false);
  processingRef.current = isProcessing;

  const audioMutedRef = useRef(audioMuted);
  audioMutedRef.current = audioMuted;

  const navigationModeRef = useRef(navigationMode);
  navigationModeRef.current = navigationMode;

  const isReadingModeRef = useRef(isReadingMode);
  isReadingModeRef.current = isReadingMode;

  const lastNavActionRef = useRef(null);
  const lastNavSpeechTimeRef = useRef(0);
  const stopSpokenCountRef = useRef(0); // Track how many times stop/hazard was announced for current obstacle

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

        // Targeted Item Search Mode Check
        const detectedList = response.detections || response.prioritized_detections || response.detected_objects;
        if (targetObjectRef.current && detectedList) {
          const target = targetObjectRef.current.toLowerCase();
          const match = detectedList.find((obj) =>
            obj.label.toLowerCase().includes(target)
          );
          if (match) {
            playDirectionalChime("clear");
            if (!audioMutedRef.current) {
              const pos = match.position || match.spatial_position || "in front";
              speak(`Found ${match.label} ${pos}.`);
            }
          }
        }

        // Voice & Spatial Audio Guidance Logic (Suppressed while in Reading Mode!)
        if (!audioMutedRef.current && !isReadingModeRef.current) {
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
            const isUrgent = !!nav.urgent_hazard;
            const isStraightWalk = nav.action === "straight" || nav.action === "clear";
            const isStopped = nav.action === "stop";
            const periodicGap = isStraightWalk ? 20000 : NAV_SPEECH_COOLDOWN_MS;
            const cooldownPassed = now - lastNavSpeechTimeRef.current > periodicGap;

            // Reset stop count whenever action changes away from stop
            if (actionChanged && !isStopped) {
              stopSpokenCountRef.current = 0;
            }

            // Policy:
            // 1. If action changed, speak immediately.
            // 2. If 'stop', ONLY announce up to 2 times total for the same obstacle!
            //    Do NOT keep repeating in an endless loop while the user stands still.
            let shouldSpeak = false;

            if (actionChanged && isConsistent) {
              shouldSpeak = true;
            } else if (isStopped) {
              // Only repeat warning a second time if at least 7 seconds passed and count < 2
              if (stopSpokenCountRef.current < 2 && (now - lastNavSpeechTimeRef.current > 7000)) {
                shouldSpeak = true;
              }
            } else if (cooldownPassed && isConsistent && !isStraightWalk) {
              shouldSpeak = true;
            }

            if (shouldSpeak) {
              playDirectionalChime(nav.action);

              let spokenGuidance = nav.guidance_speech || "";

              if (isStopped) {
                stopSpokenCountRef.current += 1;

                const leftScore = nav.corridors?.left?.clearance_score || 0;
                const rightScore = nav.corridors?.right?.clearance_score || 0;

                let nextMove = "";
                if (rightScore > leftScore && rightScore > 0.35) {
                  nextMove = "Turn to your right to find an open path.";
                } else if (leftScore > 0.35) {
                  nextMove = "Turn to your left to find an open path.";
                } else {
                  nextMove = "Take two steps back, then turn slowly to locate a clear exit.";
                }

                if (stopSpokenCountRef.current === 1) {
                  spokenGuidance = `${spokenGuidance} Next: ${nextMove}`;
                } else {
                  // Second reminder is very short and directly tells them the action
                  spokenGuidance = `Still blocked. ${nextMove}`;
                }
              }

              speak(spokenGuidance);
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
   * Dedicated Reading & Item Orientation Mode Toggle
   */
  const handleToggleReadingMode = useCallback(async () => {
    setIsReadingMode((prev) => {
      const next = !prev;
      if (next) {
        speak("Entering reading mode. Obstacle warnings paused. Hold the item in front of the lens. Checking orientation.");
      } else {
        speak("Exiting reading mode. Resuming navigation obstacle detection.");
      }
      return next;
    });
  }, [speak]);

  /**
   * On-Demand OCR & AI Item Assistant Trigger
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
      // Direct call to Gemini Multimodal AI for 100% reading accuracy & item explanation
      const vlmPromise = askVLM(
        frame,
        "Read all text visible on this item accurately and describe what this object is and what it is all about. If text is mirrored or reversed by the webcam, read it correctly. If any text is cut off, give brief framing advice."
      );

      // Run local OCR in parallel as fast fallback
      const ocrPromise = readTextFromFrame(frame).catch(() => null);

      const [vlmRes, ocrRes] = await Promise.all([vlmPromise, ocrPromise]);

      if (ocrRes) {
        setOcrResult(ocrRes);
      }

      let textToSpeak = "";

      if (vlmRes && vlmRes.spoken_response && !vlmRes.spoken_response.includes("GEMINI_API_KEY")) {
        textToSpeak = vlmRes.spoken_response;
      } else if (ocrRes && (ocrRes.speech_text || ocrRes.total_text)) {
        textToSpeak = ocrRes.speech_text || ocrRes.total_text;
        if (ocrRes.framing_guidance) {
          textToSpeak = `${textToSpeak} ${ocrRes.framing_guidance}`;
        }
      } else {
        textToSpeak = "No clear text found. Please hold the item about 10 inches directly in front of the camera lens.";
      }

      if (!audioMutedRef.current && textToSpeak) {
        speak(textToSpeak);
      }
    } catch (err) {
      console.error("OCR request failed:", err);
      setErrorMessage(`OCR failed: ${err.message}`);
    } finally {
      setOcrLoading(false);
    }
  }, [captureFrame, sampleImage, speak]);

  /**
   * Tier 2 Multimodal VLM Conversational Query Trigger
   */
  const handleAskVLM = useCallback(
    async (prompt = "Describe this scene concisely for a blind person navigating.") => {
      const frame = captureFrame() || sampleImage;
      if (!frame) {
        setErrorMessage("Please enable the camera or load an image to analyze.");
        return;
      }

      setVlmLoading(true);
      setErrorMessage(null);

      try {
        const result = await askVLM(frame, prompt);
        if (result && result.spoken_response) {
          if (!audioMutedRef.current) {
            speak(result.spoken_response);
          }
        }
      } catch (err) {
        console.error("VLM query failed:", err);
        setErrorMessage(`AI query failed: ${err.message}`);
      } finally {
        setVlmLoading(false);
      }
    },
    [captureFrame, sampleImage, speak]
  );

  /**
   * Camera Orientation Guidance Hook
   */
  const { guidanceMessage: orientationGuidance } = useOrientation({
    isEnabled: isStreaming,
    onOrientationIssue: (issue) => {
      if (!audioMutedRef.current) {
        speak(issue);
      }
    },
  });

  /**
   * Hands-Free Voice Commands Hook
   */
  const {
    isListening: isVoiceListening,
    transcript: voiceTranscript,
    permissionError: voicePermissionError,
    restartVoice,
  } = useVoiceCommands({
    isEnabled: true,
    onFeedback: (fb) => setVoiceFeedback(fb),
    onStopAudio: () => {
      cancelSpeech();
    },
    onRepeat: () => {
      repeatSpeech();
    },
    onReadText: () => {
      handleTriggerOcr();
    },
    onSceneDescription: (userQuery) => {
      handleAskVLM(userQuery || "Describe this scene concisely for a blind person navigating.");
    },
    onTargetSearch: (item) => {
      setTargetObject(item);
      speak(`Searching for ${item}. Move your camera around slowly.`);
    },
  });

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
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        handleToggleReadingMode();
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
      <div style={{ marginBottom: "12px" }}>
        <CameraStatus
          apiHealth={apiHealth}
          isStreaming={isStreaming}
          resolution={resolution}
          frameCount={frameCount}
          isInspecting={isInspecting}
          navigationMode={navigationMode}
        />
      </div>

      {/* Voice Assistant & Camera Orientation Guidance Status Bar */}
      <VoiceStatusPill
        isListening={isVoiceListening}
        lastVoiceFeedback={voiceFeedback}
        transcript={voiceTranscript}
        permissionError={voicePermissionError}
        onRestartVoice={restartVoice}
        guidanceMessage={orientationGuidance}
        targetObject={targetObject}
        onClearTarget={() => setTargetObject(null)}
        vlmLoading={vlmLoading}
      />

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

          {/* Dedicated Read & Examine Item Mode Button */}
          <button
            onClick={handleToggleReadingMode}
            style={{
              backgroundColor: isReadingMode ? "#ff9800" : "#20233b",
              color: isReadingMode ? "#000" : "#ffb74d",
              border: "2px solid #ff9800",
              borderRadius: "8px",
              padding: "0.85rem 1rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.6rem",
              width: "100%",
              marginTop: "12px",
              boxShadow: isReadingMode ? "0 0 15px rgba(255, 152, 0, 0.4)" : "none",
            }}
            aria-pressed={isReadingMode}
            aria-label="Toggle Reading and Item Examination Mode"
          >
            {isReadingMode ? "📖 Reading Mode ACTIVE (Obstacles Paused)" : "📖 Switch to Reading & Item Mode"}
          </button>
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

          {/* Tier 2 Multimodal AI Scene Inquirer */}
          <button
            onClick={() => handleAskVLM()}
            disabled={vlmLoading || (!isStreaming && !sampleImage)}
            style={{
              backgroundColor: "#20233b",
              color: "#4cc9f0",
              border: "1px solid #4cc9f0",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              cursor: vlmLoading ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "0.95rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              width: "100%",
            }}
            title="Ask AI to describe the entire scene (VLM Tier 2)"
            aria-label="Describe scene with AI"
          >
            🧠 {vlmLoading ? "Consulting AI..." : "Ask AI: What's In Front Of Me?"}
          </button>

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
