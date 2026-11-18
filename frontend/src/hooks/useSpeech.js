/**
 * useSpeech – Custom React Hook
 * File: frontend/src/hooks/useSpeech.js
 *
 * Wraps the Web Speech API (SpeechSynthesis) with VisionMate-specific controls:
 * - speak(text): Cancels pending speech and speaks new text immediately.
 * - pause() / resume(): Control mid-speech playback.
 * - cancel(): Immediately stops all current and queued speech.
 * - repeat(): Replays the most recent announced text.
 * - isSpeaking: Real-time boolean reactive state.
 */

import { useRef, useState, useCallback, useEffect } from "react";

export function useSpeech({ rate = 0.95, pitch = 1.0, volume = 1.0 } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const lastTextRef = useRef("");
  const generationRef = useRef(0);
  const lastAutomaticKeyRef = useRef("");
  const automaticHistoryRef = useRef(new Map());
  const synthRef = useRef(window.speechSynthesis);

  const speak = useCallback(
    (text, { onEnd, priority = false, automatic = false, dedupeKey } = {}) => {
      if (!text || !text.trim()) return false;
      const key = dedupeKey || text.trim().toLowerCase().replace(/\s+/g, " ");
      const now = Date.now();
      const history = automaticHistoryRef.current;
      const duplicateWindow = priority ? 0 : 30000;
      if (automatic && !priority && lastAutomaticKeyRef.current === key) return false;
      if (automatic && now - (history.get(key) ?? -Infinity) < duplicateWindow) return false;
      // Automatic routine output never cuts off a sentence or a requested read.
      if (automatic && !priority && isSpeakingRef.current) return false;
      if (automatic) {
        for (const [oldKey, time] of history) if (now - time > 60000) history.delete(oldKey);
        history.set(key, now);
        lastAutomaticKeyRef.current = key;
      }
      const generation = ++generationRef.current;
      const synth = synthRef.current;

      // Cancel any in-progress speech to avoid audio overlap
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      utterance.lang = "en-US";

      utterance.onstart = () => {
        if (generation !== generationRef.current) return;
        setIsSpeaking(true);
        isSpeakingRef.current = true;
      };

      utterance.onend = () => {
        if (generation !== generationRef.current) return;
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        if (onEnd) onEnd();
      };

      utterance.onerror = () => {
        if (generation !== generationRef.current) return;
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        if (onEnd) onEnd();
      };

      lastTextRef.current = text;
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      synth.speak(utterance);
      return true;
    },
    [rate, pitch, volume]
  );

  const pause = useCallback(() => {
    synthRef.current.pause();
  }, []);

  const resume = useCallback(() => {
    synthRef.current.resume();
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    synthRef.current.cancel();
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  }, []);

  const repeat = useCallback(() => {
    if (lastTextRef.current) speak(lastTextRef.current);
  }, [speak]);

  // Cancel speech when the component using this hook unmounts
  useEffect(() => {
    return () => synthRef.current.cancel();
  }, []);

  return { speak, pause, resume, cancel, repeat, isSpeaking, isSpeakingRef, lastText: lastTextRef.current };
}
