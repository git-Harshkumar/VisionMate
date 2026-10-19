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
  const lastTextRef = useRef("");
  const synthRef = useRef(window.speechSynthesis);

  const speak = useCallback(
    (text) => {
      if (!text || !text.trim()) return;
      const synth = synthRef.current;

      // Cancel any in-progress speech to avoid audio overlap
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      utterance.lang = "en-US";

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      lastTextRef.current = text;
      synth.speak(utterance);
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
    synthRef.current.cancel();
    setIsSpeaking(false);
  }, []);

  const repeat = useCallback(() => {
    if (lastTextRef.current) speak(lastTextRef.current);
  }, [speak]);

  // Cancel speech when the component using this hook unmounts
  useEffect(() => {
    return () => synthRef.current.cancel();
  }, []);

  return { speak, pause, resume, cancel, repeat, isSpeaking, lastText: lastTextRef.current };
}
