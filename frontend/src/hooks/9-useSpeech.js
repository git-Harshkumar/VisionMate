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
 * - langRef: Ref holding the selected speech language (e.g. "en-US", "hi-IN").
 *   Each utterance uses the current language and a matching installed voice.
 * - Priority (hazard) speech interrupts, but the SAME hazard key cannot restart
 *   within a 20s window, so frame-to-frame detection jitter never chops a
 *   sentence into repeated fragments. A genuinely different hazard still
 *   interrupts immediately.
 */

import { useRef, useState, useCallback, useEffect } from "react";

const ROUTINE_DUPLICATE_WINDOW_MS = 30000; // unchanged routine announcements
const HAZARD_DUPLICATE_WINDOW_MS = 20000;  // same hazard re-announce / reminder gap

export function useSpeech({ rate = 0.95, pitch = 1.0, volume = 1.0, langRef } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const isSpeakingRef = useRef(false);
  const lastTextRef = useRef("");
  const generationRef = useRef(0);
  const lastAutomaticKeyRef = useRef("");
  const automaticHistoryRef = useRef(new Map());
  const synthRef = useRef(window.speechSynthesis);

  // Voice list loads asynchronously in every browser; keep it in state.
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return undefined;
    const loadVoices = () => setVoices(synth.getVoices() || []);
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
    return () => synth.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  const pickVoice = useCallback(
    (lang) => {
      if (!lang || !voices.length) return null;
      const prefix = lang.split("-")[0].toLowerCase();
      return (
        voices.find((v) => v.lang === lang) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith(prefix)) ||
        null
      );
    },
    [voices]
  );

  const isVoiceAvailable = useCallback(
    (lang) => {
      if (!lang || lang.startsWith("en")) return true; // every platform ships an English voice
      return !!pickVoice(lang);
    },
    [pickVoice]
  );

  const speak = useCallback(
    (text, { onEnd, priority = false, automatic = false, dedupeKey } = {}) => {
      if (!text || !text.trim()) return false;
      const key = dedupeKey || text.trim().toLowerCase().replace(/\s+/g, " ");
      const now = Date.now();
      const history = automaticHistoryRef.current;
      const duplicateWindow = priority ? HAZARD_DUPLICATE_WINDOW_MS : ROUTINE_DUPLICATE_WINDOW_MS;
      if (automatic && !priority && lastAutomaticKeyRef.current === key) return false;
      // Same announcement (routine OR the same hazard) never restarts inside its
      // window - this is what stops a flapping detection from chopping "Caution!
      // A chair is..." into repeated "Caution... Caution..." fragments.
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
      const lang = langRef?.current || "en-US";
      utterance.lang = lang;
      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;

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
    [rate, pitch, volume, langRef, pickVoice]
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

  return { speak, pause, resume, cancel, repeat, isSpeaking, isSpeakingRef, lastText: lastTextRef.current, voices, isVoiceAvailable };
}
