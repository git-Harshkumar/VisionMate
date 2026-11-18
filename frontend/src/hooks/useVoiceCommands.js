/**
 * useVoiceCommands - Robust Hands-Free Speech Recognition Hook
 * File: frontend/src/hooks/useVoiceCommands.js
 */

import { useState, useEffect, useRef, useCallback } from "react";

export function useVoiceCommands({
  isEnabled = true,
  isSpeaking = false,
  spokenText = "",
  onSceneDescription,
  onReadText,
  onTargetSearch,
  onStopAudio,
  onRepeat,
  onFeedback,
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [permissionError, setPermissionError] = useState(null);

  const recognitionRef = useRef(null);
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  const isExplicitlyStoppedRef = useRef(false);
  const restartTimerRef = useRef(null);
  const lastCommandTimeRef = useRef(0);
  const speechStateRef = useRef({ isSpeaking, spokenText, changedAt: 0 });
  useEffect(() => {
    if (speechStateRef.current.isSpeaking !== isSpeaking) speechStateRef.current.changedAt = Date.now();
    speechStateRef.current.isSpeaking = isSpeaking;
    speechStateRef.current.spokenText = spokenText;
  }, [isSpeaking, spokenText]);

  // Keep latest callbacks in ref
  const callbacksRef = useRef({
    onSceneDescription,
    onReadText,
    onTargetSearch,
    onStopAudio,
    onRepeat,
    onFeedback,
  });
  callbacksRef.current = {
    onSceneDescription,
    onReadText,
    onTargetSearch,
    onStopAudio,
    onRepeat,
    onFeedback,
  };

  const processCommand = useCallback((text) => {
    const lower = text.toLowerCase().trim();
    if (!lower) return;
    const explicitStop = /^(?:visionmate[, ]+)?(?:stop|quiet|silence|shut up|pause|cancel)(?: (?:audio|speaking|talking))?[.!?]*$/.test(lower);
    // Speakers can feed TTS back into the microphone. Accept deliberate stop
    // commands, but never turn our own reading into another read/repeat request.
    const state = speechStateRef.current;
    const normalize = value => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const normalized = normalize(lower);
    if (!explicitStop && (state.isSpeaking || Date.now() - state.changedAt < 600 ||
        (normalized.length >= 8 && normalize(state.spokenText).includes(normalized)))) return;

    console.log("[Voice Command Recognized]:", lower);

    const now = Date.now();
    // 0.8s debounce between commands
    if (!explicitStop && now - lastCommandTimeRef.current < 800) {
      return;
    }

    const cbs = callbacksRef.current;

    // 1. Stop / Quiet / Cancel
    if (explicitStop) {
      lastCommandTimeRef.current = now;
      if (cbs.onFeedback) cbs.onFeedback("Silenced");
      if (cbs.onStopAudio) cbs.onStopAudio();
      return;
    }

    // 2. Repeat
    if (
      lower.includes("repeat") ||
      lower.includes("again") ||
      lower.includes("say that again") ||
      lower.includes("what did you say")
    ) {
      lastCommandTimeRef.current = now;
      if (cbs.onFeedback) cbs.onFeedback("Repeating");
      if (cbs.onRepeat) cbs.onRepeat();
      return;
    }

    // 3. Read text / sign / document / examine item
    if (
      lower.includes("read") ||
      lower.includes("examine") ||
      lower.includes("what is this") ||
      lower.includes("what is on this") ||
      lower.includes("sign") ||
      lower.includes("words") ||
      lower.includes("label") ||
      lower.includes("book") ||
      lower.includes("document")
    ) {
      lastCommandTimeRef.current = now;
      if (cbs.onFeedback) cbs.onFeedback("Reading item...");
      if (cbs.onReadText) cbs.onReadText();
      return;
    }

    // 4. Targeted item search: "Find [item]", "Where is [item]", "Look for [item]"
    const findMatch = lower.match(
      /(?:find|where is|where's|locate|search for|look for)(?:\s+my|\s+the|\s+a)?\s+([a-z0-9\s]+)/i
    );
    if (findMatch && findMatch[1]) {
      const item = findMatch[1].trim();
      const genericWords = ["it", "that", "this", "something", "anything", "me", "front"];
      if (!genericWords.includes(item)) {
        lastCommandTimeRef.current = now;
        if (cbs.onFeedback) cbs.onFeedback(`Searching for ${item}...`);
        if (cbs.onTargetSearch) cbs.onTargetSearch(item);
        return;
      }
    }

    // 5. Scene description / What's in front of me
    if (
      lower.includes("what's in front") ||
      lower.includes("what is in front") ||
      lower.includes("describe") ||
      lower.includes("look around") ||
      lower.includes("what do you see") ||
      lower.includes("what is here") ||
      lower.includes("tell me what") ||
      lower.includes("scene") ||
      lower.includes("what is ahead")
    ) {
      lastCommandTimeRef.current = now;
      if (cbs.onFeedback) cbs.onFeedback("Analyzing scene...");
      if (cbs.onSceneDescription) cbs.onSceneDescription(lower);
      return;
    }
  }, []);

  const initAndStart = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setPermissionError("Speech recognition not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    // Clean up any stale recognition session
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.abort();
      } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setPermissionError(null);
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        const text = res[0].transcript;
        setTranscript(text);
        if (res.isFinal) processCommand(text);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        return;
      }
      if (event.error === "network") {
        console.warn("[Voice] Network timeout with browser speech service. Will reconnect.");
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setPermissionError("Microphone permission denied. Please click the camera/mic icon in the browser address bar and choose 'Always allow'.");
        setIsListening(false);
        return;
      }
      console.warn("[Voice] SpeechRecognition error:", event.error);
    };

    recognition.onend = () => {
      if (!isEnabledRef.current || isExplicitlyStoppedRef.current) {
        setIsListening(false);
        return;
      }

      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (isEnabledRef.current && !isExplicitlyStoppedRef.current) {
          try {
            recognition.start();
          } catch (e) {
            initAndStart();
          }
        } else {
          setIsListening(false);
        }
      }, 500);
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn("[Voice] Error starting recognition:", e);
    }

    recognitionRef.current = recognition;
  }, [processCommand]);

  useEffect(() => {
    if (!isEnabled) {
      isExplicitlyStoppedRef.current = true;
      setIsListening(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      return;
    }

    isExplicitlyStoppedRef.current = false;
    initAndStart();

    return () => {
      isExplicitlyStoppedRef.current = true;
      clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, [isEnabled, initAndStart]);

  return {
    isListening,
    transcript,
    permissionError,
    restartVoice: () => {
      isExplicitlyStoppedRef.current = false;
      initAndStart();
    },
  };
}
