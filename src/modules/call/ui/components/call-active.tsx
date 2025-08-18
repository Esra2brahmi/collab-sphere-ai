import { CallControls, useCallStateHooks, useCall } from "@stream-io/video-react-sdk";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CustomSpeakerLayout } from "./custom-speaker-layout";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";

interface Props {
    onLeave: () => void;
    meetingId: string;
    meetingName: string;
    agentId?: string;
}

// Speech Recognition types
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: any) => void) | null;
    onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognition;
        webkitSpeechRecognition: new () => SpeechRecognition;
    }
}

export const CallActive = ({ onLeave, meetingId, meetingName, agentId }: Props) => {
    const { useParticipants } = useCallStateHooks();
    const participants = useParticipants();
    const call = useCall();
    const { data: session } = authClient.useSession();
    const { toast } = useToast();
    const [isListening, setIsListening] = useState(false);
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
    const [isAIMuted, setIsAIMuted] = useState(false);
    const [isAIListeningDisabled, setIsAIListeningDisabled] = useState(false);
    const [agentName, setAgentName] = useState("AI Assistant");
    const [selectedVoice, setSelectedVoice] = useState("default");
    const [availableVoices, setAvailableVoices] = useState<string[]>([]);
    const [waitingForQuestion, setWaitingForQuestion] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const recognitionPausedByTTSRef = useRef(false);
    const ttsStopRequestedRef = useRef(false);
    const isShuttingDownRef = useRef(false);
    const greetedRef = useRef(false);
    const lastMicStateRef = useRef<boolean | null>(null);
    const lastQuestionRef = useRef<string>("");
    const conversationLogRef = useRef<string[]>([]);
    const [localUserName, setLocalUserName] = useState<string>("User");
    const accountUserId = session?.user?.id as string | undefined;
    const accountUserName = session?.user?.name as string | undefined;
    const [participantNames, setParticipantNames] = useState<string[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const ttsModeRef = useRef<"neural" | "browser" | null>(null);
    const lockedVoiceNameRef = useRef<string | null>(null);
    const voicesReadyRef = useRef<boolean>(false);
    // ElevenLabs quota hit: stick to browser TTS for reliability
    const FORCE_NEURAL_ONLY = false;
    const FORCE_BROWSER_ONLY = true;

    // Ensure browser voices are loaded before using speechSynthesis
    const ensureVoicesLoaded = async (): Promise<void> => {
        if (voicesReadyRef.current) return;
        return new Promise<void>((resolve) => {
            const voices = window.speechSynthesis?.getVoices?.() || [];
            if (voices.length > 0) {
                voicesReadyRef.current = true;
                resolve();
                return;
            }
            const onVoices = () => {
                const list = window.speechSynthesis?.getVoices?.() || [];
                if (list.length > 0) {
                    voicesReadyRef.current = true;
                    window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
                    resolve();
                }
            };
            window.speechSynthesis?.addEventListener('voiceschanged', onVoices);
            // Fallback timeout
            setTimeout(() => {
                window.speechSynthesis?.removeEventListener('voiceschanged', onVoices);
                voicesReadyRef.current = true; // proceed anyway
                resolve();
            }, 1500);
        });
    };

    const playNeuralTTS = async (text: string): Promise<boolean> => {
        try {
            const avail = await fetch('/api/tts', { method: 'GET' }).then(r => r.json()).catch(() => ({ available: false }));
            if (!avail?.available) return false;
            const resp = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (!resp.ok) {
                try {
                    const msg = await resp.text();
                    console.warn('[TTS] Neural response not OK:', resp.status, msg);
                } catch {}
                return false;
            }
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            if (!audioRef.current) {
                audioRef.current = new Audio();
            }
            const audio = audioRef.current;
            audio.src = url;
            // Play slightly faster while preserving natural pitch
            try {
                (audio as any).preservesPitch = true;
                (audio as any).mozPreservesPitch = true;
                (audio as any).webkitPreservesPitch = true;
            } catch {}
            audio.playbackRate = 1.08;
            await audio.play().catch(() => { URL.revokeObjectURL(url); });
            return true;
        } catch (e) {
            console.warn('[TTS] Neural request failed:', e);
            return false;
        }
    };

    // Play a sequence of phrases via neural TTS, one request per phrase
    const playNeuralTTSPhrases = async (phrases: string[]): Promise<{ playedAny: boolean; quotaExceeded: boolean }> => {
        const avail = await fetch('/api/tts', { method: 'GET' }).then(r => r.json()).catch(() => ({ available: false }));
        if (!avail?.available) return { playedAny: false, quotaExceeded: false };
        if (!audioRef.current) audioRef.current = new Audio();
        const audio = audioRef.current;
        // Apply once; browsers keep this for subsequent plays
        try {
            (audio as any).preservesPitch = true;
            (audio as any).mozPreservesPitch = true;
            (audio as any).webkitPreservesPitch = true;
        } catch {}
        audio.playbackRate = 1.08;
        let playedAny = false;
        let quotaExceeded = false;

        for (let i = 0; i < phrases.length; i++) {
            if (ttsStopRequestedRef.current || isShuttingDownRef.current || isAIMuted || quotaExceeded) break;
            const p = phrases[i];
            // ElevenLabs can fail on long payloads; keep phrase <= 300 chars to be safe
            const subparts = splitByMaxLength(p, 300);
            for (const sub of subparts) {
                if (ttsStopRequestedRef.current || isShuttingDownRef.current || isAIMuted || quotaExceeded) break;
                const resp = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: sub }),
                });
                if (!resp.ok) {
                    try { 
                        const raw = await resp.text();
                        console.warn('[TTS] Phrase synth failed:', resp.status, raw);
                        if (raw.includes('quota_exceeded')) {
                            quotaExceeded = true;
                            break;
                        }
                    } catch {}
                    continue; // skip this subpart but continue with others
                }
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                audio.src = url;
                try {
                    await audio.play();
                    playedAny = true;
                    await new Promise<void>((resolve) => {
                        const handler = () => {
                            audio.removeEventListener('ended', handler);
                            resolve();
                        };
                        audio.addEventListener('ended', handler);
                    });
                } catch (e) {
                    console.warn('[TTS] Playback error:', e);
                } finally {
                    URL.revokeObjectURL(url);
                }
                // small natural pause between phrase parts (slightly faster)
                await new Promise(r => setTimeout(r, 90));
            }
            // slightly longer pause between original phrases (slightly faster)
            await new Promise(r => setTimeout(r, 120));
        }

        return { playedAny, quotaExceeded };
    };

    const forceStopTTS = () => {
        try {
            // Cancel all speech synthesis
            window.speechSynthesis?.cancel();
            // Stop any neural TTS playback
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
                audioRef.current.src = '';
            }
            // Pause and resume to ensure complete stop
            window.speechSynthesis?.pause();
            window.speechSynthesis?.resume();
            window.speechSynthesis?.cancel();
        } catch {}
        
        // Multiple cancels with delays to ensure complete stop
        const tryAgain = (delay: number) => window.setTimeout(() => {
            try { 
                window.speechSynthesis?.cancel();
                window.speechSynthesis?.pause();
                window.speechSynthesis?.resume();
                window.speechSynthesis?.cancel();
                if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                }
            } catch {}
        }, delay);
        
        tryAgain(50);
        tryAgain(150);
        tryAgain(300);
    };

    // Get agent name from database
    useEffect(() => {
        if (agentId) {
            fetch(`/api/agent-info?agentId=${agentId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.name) {
                        setAgentName(data.name);
                    }
                })
                .catch(err => console.error('Failed to get agent name:', err));
        }
    }, [agentId]);

    // Get meeting participants from database
    useEffect(() => {
        if (meetingId) {
            fetch(`/api/meeting-participants?meetingId=${meetingId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.participants && Array.isArray(data.participants)) {
                        const names = data.participants.map((p: any) => p.name).filter(Boolean);
                        setParticipantNames(names);
                    }
                })
                .catch(err => console.error('Failed to get meeting participants:', err));
        }
    }, [meetingId]);

    // Determine local user's display name from participants list (best-effort)
    useEffect(() => {
        try {
            const me = (participants as any[])?.find?.((p: any) => p?.isLocalParticipant || p?.isSelf);
            if (me?.name && typeof me.name === 'string') {
                setLocalUserName(me.name);
            }
        } catch {}
    }, [participants]);

    // Initialize available voices
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const loadVoices = () => {
                const voices = window.speechSynthesis.getVoices();
                const voiceNames = voices
                    .filter(voice => voice.lang.startsWith('en'))
                    .map(voice => voice.name);
                setAvailableVoices(voiceNames);
            };

            // Load voices immediately if available
            loadVoices();

            // Also listen for voices to load
            window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
            
            return () => {
                window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
            };
        }
    }, []);

    // Monitor mic state changes and sync with AI speech recognition
    useEffect(() => {
        if (!call || !agentId || isAIListeningDisabled) return;

        const checkMicState = () => {
            const isMicEnabled = call.microphone.enabled;
            
            if (lastMicStateRef.current !== isMicEnabled) {
                lastMicStateRef.current = isMicEnabled;
                
                if (isMicEnabled && !isListening) {
                    if (recognitionRef.current && !isShuttingDownRef.current) {
                        try {
                            recognitionRef.current.start();
                            setIsListening(true);
                            // Remove automatic greeting - only greet when manually triggered
                        } catch (e) {
                            console.error('Failed to start recognition:', e);
                        }
                    }
                } else if (!isMicEnabled && isListening) {
                    if (recognitionRef.current) {
                        try {
                            recognitionRef.current.stop();
                            setIsListening(false);
                        } catch (e) {
                            console.error('Failed to stop recognition:', e);
                        }
                    }
                    
                    // Stop AI from speaking when mic is disabled
                    if (isAgentSpeaking) {
                        console.log('[Mic disabled] Stopping AI speech');
                        ttsStopRequestedRef.current = true;
                        forceStopTTS();
                        setIsAgentSpeaking(false);
                    }
                    
                    // Keep the last question so user can still trigger the response manually
                }
            }
        };

        checkMicState();
        const intervalId = setInterval(checkMicState, 500);

        return () => clearInterval(intervalId);
    }, [call, agentId, isListening, isAIListeningDisabled, isAgentSpeaking]);

    // Initialize speech recognition
    useEffect(() => {
        isShuttingDownRef.current = false;
        ttsStopRequestedRef.current = false;
        greetedRef.current = false;
        recognitionPausedByTTSRef.current = false;
        lastMicStateRef.current = null;

        if (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            
            if (recognitionRef.current) {
                recognitionRef.current.continuous = true;
                recognitionRef.current.interimResults = true;
                recognitionRef.current.lang = 'en-US';

                recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                    if (isShuttingDownRef.current) return;
                    let finalTranscript = '';
                    
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const result = event.results[i];
                        if (result.isFinal) {
                            finalTranscript += result[0].transcript;
                        }
                    }

                    if (finalTranscript.trim()) {
                        handleUserMessage(finalTranscript.trim());
                    }
                };

                recognitionRef.current.onerror = (event) => {
                    if (isShuttingDownRef.current) return;
                    console.error('Speech recognition error:', event);
                    setIsListening(false);
                };

                recognitionRef.current.onend = () => {
                    if (isShuttingDownRef.current) return;
                    setIsListening(false);
                };
            }
        }

        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch {}
            }
        };
    }, []);


// Monitor mic state changes and sync with AI speech recognition
useEffect(() => {
    if (!call || !agentId || isAIListeningDisabled) return;

    const checkMicState = () => {
        const isMicEnabled = call.microphone.enabled;
        
        if (lastMicStateRef.current !== isMicEnabled) {
            lastMicStateRef.current = isMicEnabled;
            
            if (isMicEnabled && !isListening) {
                if (recognitionRef.current && !isShuttingDownRef.current) {
                    try {
                        recognitionRef.current.start();
                        setIsListening(true);
                        // Remove automatic greeting - only greet when manually triggered
                    } catch (e) {
                        console.error('Failed to start recognition:', e);
                    }
                }
            } else if (!isMicEnabled && isListening) {
                if (recognitionRef.current) {
                    try {
                        recognitionRef.current.stop();
                        setIsListening(false);
                    } catch (e) {
                        console.error('Failed to stop recognition:', e);
                    }
                }
                
                // Stop AI from speaking when mic is disabled
                if (isAgentSpeaking) {
                    console.log('[Mic disabled] Stopping AI speech');
                    ttsStopRequestedRef.current = true;
                    forceStopTTS();
                    setIsAgentSpeaking(false);
                }
                
                // Keep the last question so user can still trigger the response manually
            }
        }
    };

    checkMicState();
    const intervalId = setInterval(checkMicState, 500);

    return () => clearInterval(intervalId);
}, [call, agentId, isListening, isAIListeningDisabled, isAgentSpeaking]);

// Initialize speech recognition
useEffect(() => {
    isShuttingDownRef.current = false;
    ttsStopRequestedRef.current = false;
    greetedRef.current = false;
    recognitionPausedByTTSRef.current = false;
    lastMicStateRef.current = null;

    if (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        
        if (recognitionRef.current) {
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                if (isShuttingDownRef.current) return;
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        finalTranscript += result[0].transcript;
                    }
                }

                if (finalTranscript.trim()) {
                    handleUserMessage(finalTranscript.trim());
                }
            };

            recognitionRef.current.onerror = (event) => {
                if (isShuttingDownRef.current) return;
                console.error('Speech recognition error:', event);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                if (isShuttingDownRef.current) return;
                setIsListening(false);
            };
        }
    }

    return () => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch {}
        }
    };
}, []);

// Handle user speech input
const handleUserMessage = async (message: string) => {
    if (!message) return;

    // Log user message, then send to your agent backend or LLM
    // Append to conversation log and sync per-user chunk
    conversationLogRef.current.push(`${accountUserName || localUserName}: ${message}`);
    // Store the question for later manual response
    lastQuestionRef.current = message;
    setWaitingForQuestion(false);
    try {
        fetch('/api/conversation-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meetingId,
                mode: 'append',
                chunk: {
                    speaker: 'user',
                    userId: accountUserId,
                    userName: accountUserName || localUserName,
                    text: message,
                    ts: Date.now(),
                },
            }),
        }).catch(() => {});
    } catch {}
    
    // Don't respond immediately - wait for manual trigger
    console.log(`[User asked]: ${message}`);
    
    // Never respond automatically - only store the question
    // Response will only happen when user clicks the manual trigger button
};

// Helper: split long text into manageable chunks
const splitTextIntoChunks = (text: string, maxLen = 220): string[] => {
    const sentences = text
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';
    for (const s of sentences) {
        if ((current + ' ' + s).trim().length <= maxLen) {
            current = (current ? current + ' ' : '') + s;
        } else {
            if (current) chunks.push(current);
            if (s.length <= maxLen) {
                current = s;
            } else {
                for (let i = 0; i < s.length; i += maxLen) {
                    const piece = s.slice(i, i + maxLen);
                    if (piece.length === maxLen) {
                        chunks.push(piece);
                    } else {
                        current = piece;
                    }
                }
            }
        }
    }
    if (current) chunks.push(current);
    return chunks;
};

// Further split a chunk into short phrases to introduce natural pauses
const splitIntoPhrases = (text: string): string[] => {
    // Split on commas, semicolons, dashes, and keep sentence boundaries
    const parts = text
        .split(/(?<=[,;:])\s+|\s+—\s+|\s+-\s+/)
        .map(p => p.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts : [text];
};

// Split long text into smaller pieces by max length preserving words
const splitByMaxLength = (text: string, maxLen: number): string[] => {
    const result: string[] = [];
    let remaining = text.trim();
    while (remaining.length > maxLen) {
        // try to split at last space before maxLen
        let idx = remaining.lastIndexOf(' ', maxLen);
        if (idx < 40) idx = maxLen; // fall back to hard split if no good space
        result.push(remaining.slice(0, idx).trim());
        remaining = remaining.slice(idx).trim();
    }
    if (remaining) result.push(remaining);
    return result;
};

// Sanitize AI text for TTS: remove markdown (**, *, _, `), links, stray asterisks, and normalize whitespace
const sanitizeForTTS = (input: string): string => {
    if (!input) return '';
    let out = input;
    // Replace bullets/newlines with sentences
    out = out.replace(/\r?\n|\r/g, ' ');
    out = out.replace(/\s*[\-•]\s+/g, ' ');
    // Markdown bold/italic
    out = out.replace(/\*\*(.*?)\*\*/g, '$1');
    out = out.replace(/\*(.*?)\*/g, '$1');
    out = out.replace(/_(.*?)_/g, '$1');
    // Inline/code blocks
    out = out.replace(/`{1,3}([\s\S]*?)`{1,3}/g, '$1');
    // Markdown links [text](url) -> text
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    // Remove any remaining asterisks
    out = out.replace(/\*/g, '');
    // Collapse multiple dots
    out = out.replace(/\.\.\.+/g, '…');
    // Normalize spaces
    out = out.replace(/\s+/g, ' ').trim();
    return out;
};

// Text-to-speech for agent responses
const speakResponse = async (text: string) => {
    if (!text) return;
    if (isAIMuted) return; // allow neural even if speechSynthesis is unavailable
    if (isShuttingDownRef.current) return;
    // Append to conversation log and sync AI chunk (keep original text for logs/transcript)
    if (!ttsStopRequestedRef.current) {
        conversationLogRef.current.push(`AI: ${text}`);
        try {
            fetch('/api/conversation-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId,
                    mode: 'append',
                    chunk: {
                        speaker: 'ai',
                        text,
                        ts: Date.now(),
                    },
                }),
            }).catch(() => {});
        } catch {}
    }
    if (isAgentSpeaking) {
        console.log('[TTS] Already speaking, stopping current speech first');
        forceStopTTS();
        // Wait a bit before starting new speech
        setTimeout(() => {
            if (!isShuttingDownRef.current && !ttsStopRequestedRef.current && !isAIMuted) {
                speakResponse(text);
            }
        }, 100);
        return;
    }

    // Pause STT while TTS is active
    if (recognitionRef.current && isListening) {
        try {
            recognitionRef.current.stop();
            recognitionPausedByTTSRef.current = true;
            setIsListening(false);
        } catch (_) {}
    }

    // Reset stop flag
    ttsStopRequestedRef.current = false;

    const spokenText = sanitizeForTTS(text);

    // Force browser-only mode
    if (FORCE_BROWSER_ONLY) {
        ttsModeRef.current = 'browser';
    }

    // FORCE neural-only: always attempt neural, never fall back
    if (FORCE_NEURAL_ONLY) {
        // Build phrase queue for robustness and natural pacing
        const sentenceChunks = splitTextIntoChunks(spokenText);
        const phraseQueue = sentenceChunks.flatMap(chunk => splitIntoPhrases(chunk));
        setIsAgentSpeaking(true);
        const { playedAny, quotaExceeded } = await playNeuralTTSPhrases(phraseQueue);
        setIsAgentSpeaking(false);
        if (playedAny) {
            if (
                recognitionRef.current &&
                recognitionPausedByTTSRef.current &&
                !isShuttingDownRef.current &&
                !ttsStopRequestedRef.current &&
                call?.microphone.enabled &&
                !isAIListeningDisabled
            ) {
                try { recognitionRef.current.start(); setIsListening(true); } catch { setIsListening(false); }
                finally { recognitionPausedByTTSRef.current = false; }
            }
        }
        if (quotaExceeded) {
            toast({
                title: 'Neural TTS quota reached',
                description: 'Your ElevenLabs quota is exceeded. The assistant will display text without speaking.',
                variant: 'destructive',
            });
        } else if (!playedAny) {
            console.warn('[TTS] Neural-only mode: synthesis failed, skipping speech');
        }
        return;
    }

    // Decide and lock TTS mode on first use
    if (!ttsModeRef.current) {
        const ok = await playNeuralTTS(spokenText);
        if (ok) {
            ttsModeRef.current = 'neural';
            setIsAgentSpeaking(true);
            const onEnded = () => {
                setIsAgentSpeaking(false);
                // Resume STT if we paused it AND mic is still enabled
                if (
                    recognitionRef.current &&
                    recognitionPausedByTTSRef.current &&
                    !isShuttingDownRef.current &&
                    !ttsStopRequestedRef.current &&
                    call?.microphone.enabled &&
                    !isAIListeningDisabled
                ) {
                    try {
                        recognitionRef.current.start();
                        setIsListening(true);
                    } catch (e) {
                        console.error('Failed to resume recognition after TTS:', e);
                        setIsListening(false);
                    } finally {
                        recognitionPausedByTTSRef.current = false;
                    }
                }
                audioRef.current?.removeEventListener('ended', onEnded);
            };
            audioRef.current?.addEventListener('ended', onEnded);
            return;
        }
        // Lock to browser mode if neural unavailable
        ttsModeRef.current = 'browser';
    }

    if (ttsModeRef.current === 'neural') {
        // Always stick to neural; if it fails, do not fallback to avoid voice change
        const ok = await playNeuralTTS(spokenText);
        if (ok) {
            setIsAgentSpeaking(true);
            const onEnded = () => {
                setIsAgentSpeaking(false);
                if (
                    recognitionRef.current &&
                    recognitionPausedByTTSRef.current &&
                    !isShuttingDownRef.current &&
                    !ttsStopRequestedRef.current &&
                    call?.microphone.enabled &&
                    !isAIListeningDisabled
                ) {
                    try { recognitionRef.current.start(); setIsListening(true); } catch { setIsListening(false); }
                    finally { recognitionPausedByTTSRef.current = false; }
                }
                audioRef.current?.removeEventListener('ended', onEnded);
            };
            audioRef.current?.addEventListener('ended', onEnded);
        } else {
            console.warn('[TTS] Neural voice unavailable; skipping fallback to keep voice consistent.');
        }
        return;
    }

    // Browser TTS path (locked)
    if (!('speechSynthesis' in window)) {
        console.warn('[TTS] Browser speechSynthesis not available');
        return;
    }

    await ensureVoicesLoaded();

    const sentenceChunks = splitTextIntoChunks(spokenText);
    const phraseQueue = sentenceChunks.flatMap(chunk => splitIntoPhrases(chunk));
    if (phraseQueue.length === 0) return;

    setIsAgentSpeaking(true);

    const pickBetterDefaultVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer natural/neural voices where available
        const preferredNames = [
            'Microsoft Aria Online (Natural)',
            'Microsoft Jenny',
            'Microsoft Guy',
            'Google US English',
            'Google UK English Female',
            'Samantha', 'Victoria', 'Moira', 'Karen',
            'Alloy', 'Verse', 'Bright', // Some vendors expose these labels
        ];
        for (const name of preferredNames) {
            const v = voices.find(voice => voice.name.toLowerCase().includes(name.toLowerCase()));
            if (v) return v;
        }
        // Otherwise pick any en-US voice, then fallback to first
        const enUS = voices.find(v => /en[-_]?US/i.test(v.lang));
        return enUS || voices[0];
    };

    const speakPhraseAt = (index: number) => {
        if (isShuttingDownRef.current || ttsStopRequestedRef.current || isAIMuted) {
            setIsAgentSpeaking(false);
            return;
        }
        if (index >= phraseQueue.length) {
            setIsAgentSpeaking(false);
            // Resume STT if we paused it AND mic is still enabled
            if (
                recognitionRef.current &&
                recognitionPausedByTTSRef.current &&
                !isShuttingDownRef.current &&
                !ttsStopRequestedRef.current &&
                call?.microphone.enabled &&
                !isAIListeningDisabled
            ) {
                try {
                    recognitionRef.current.start();
                    setIsListening(true);
                } catch (e) {
                    console.error('Failed to resume recognition after TTS:', e);
                    setIsListening(false);
                } finally {
                    recognitionPausedByTTSRef.current = false;
                }
            }
            return;
        }

        if (isShuttingDownRef.current || ttsStopRequestedRef.current || isAIMuted) {
            setIsAgentSpeaking(false);
            return;
        }

        const phrase = phraseQueue[index];
        const utterance = new SpeechSynthesisUtterance(phrase);
        
        // Set voice (locked across session)
        const voices = window.speechSynthesis.getVoices();
        let voiceToUse: SpeechSynthesisVoice | undefined;
        if (lockedVoiceNameRef.current) {
            voiceToUse = voices.find(v => v.name === lockedVoiceNameRef.current);
        }
        if (!voiceToUse) {
            if (selectedVoice && selectedVoice !== 'default') {
                voiceToUse = voices.find(v => v.name === selectedVoice);
            }
        }
        if (!voiceToUse) {
            voiceToUse = pickBetterDefaultVoice();
        }
        if (voiceToUse) {
            utterance.voice = voiceToUse;
            if (!lockedVoiceNameRef.current) lockedVoiceNameRef.current = voiceToUse.name;
            // Align language with the selected voice when available
            if (voiceToUse.lang) {
                utterance.lang = voiceToUse.lang;
            }
        }
        
        // Slight natural variation per phrase
        const isQuestion = /\?\s*$/.test(phrase);
        // Noticeably faster default speaking rate, still natural
        const baseRate = 1.18;
        const basePitch = 0.98;
        const rateJitter = (Math.random() * 0.06) - 0.03; // ±0.03
        const pitchJitter = (Math.random() * 0.08) - 0.04; // ±0.04
        // Keep rate within a natural-sounding range but clearly faster
        utterance.rate = Math.max(1.05, Math.min(1.35, baseRate + rateJitter));
        utterance.pitch = Math.max(0.9, Math.min(1.15, basePitch + pitchJitter + (isQuestion ? 0.08 : 0)));
        utterance.volume = 1.0;

        utterance.onend = () => {
            if (!isShuttingDownRef.current && !ttsStopRequestedRef.current && !isAIMuted) {
                // Natural pause: longer at sentence ends, shorter at commas/phrases
                const lastChar = phrase.trim().slice(-1);
                const isSentenceEnd = /[.!?…]/.test(lastChar);
                // Further reduced pauses to feel more responsive
                const pauseMs = isSentenceEnd ? 160 + Math.random() * 80 : 80 + Math.random() * 50;
                setTimeout(() => speakPhraseAt(index + 1), pauseMs);
            } else {
                setIsAgentSpeaking(false);
            }
        };
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            if (!isShuttingDownRef.current && !ttsStopRequestedRef.current && !isAIMuted) {
                setTimeout(() => speakPhraseAt(index + 1), 80);
            } else {
                setIsAgentSpeaking(false);
            }
        };

        window.speechSynthesis.speak(utterance);
    };

    speakPhraseAt(0);
};

// Greet on user gesture
const greetIfNeededOnGesture = () => {
    if (greetedRef.current || isShuttingDownRef.current || isAIMuted) return;
    
    // Add a small delay to ensure voice selection is applied
    setTimeout(() => {
        if (greetedRef.current || isShuttingDownRef.current || isAIMuted) return;
        
        const participantCount = participants.length;
        const greeting = participantCount > 1 
            ? `Hello everyone! I'm ${agentName}. I'm here to help all ${participantCount} of you during this call. I'll wait for your questions and respond when you trigger me.`
            : `Hello! I'm ${agentName}. I'm here to help you during this call. I'll wait for your questions and respond when you trigger me.`;
        greetedRef.current = true;
        speakResponse(greeting);
        setWaitingForQuestion(true);
    }, 200); // 200ms delay to ensure voice is set
};

// Manual trigger for AI response
const handleManualTrigger = async () => {
    if (isAgentSpeaking) {
        // AI is currently speaking - stop it
        console.log('[Manual trigger] Stopping current AI speech');
        ttsStopRequestedRef.current = true;
        forceStopTTS();
        setIsAgentSpeaking(false);
        return;
    }

    if (lastQuestionRef.current && !isAIMuted) {
        // Respond to the last question (prioritize this over greeting)
        try {
            console.log(`[Manual trigger] Responding to: ${lastQuestionRef.current}`);
            
            const response = await fetch('/api/groq-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: lastQuestionRef.current,
                    agentId,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get agent response');
            }

            const data = await response.json();
            console.log(`[Agent response]: ${data.response}`);
            
            if (isShuttingDownRef.current) return;
            speakResponse(data.response);
            // Clear the last question after speaking the response
            lastQuestionRef.current = "";
            setWaitingForQuestion(true);
            
        } catch (error) {
            if (!isShuttingDownRef.current) {
                console.error('Error getting agent response:', error);
            }
        }
    } else if (!greetedRef.current && !isAIMuted) {
        // No question asked yet and haven't greeted - give initial greeting
        greetIfNeededOnGesture();
    } else if (greetedRef.current && !lastQuestionRef.current && !isAIMuted) {
        // Already greeted but no question - prompt user to ask a question
        const prompt = "I'm ready to help! Please ask me a question first, then I'll respond when you trigger me.";
        speakResponse(prompt);
    }
};

// Handle voice change
const handleVoiceChange = (voice: string) => {
    // Stop any ongoing speech immediately when changing voice
    ttsStopRequestedRef.current = true;
    forceStopTTS();
    setIsAgentSpeaking(false);
    
    setSelectedVoice(voice);
    console.log(`[Voice changed to]: ${voice}`);
    
    // Reset greeting so user can hear new voice immediately
    greetedRef.current = false;
    
    // Don't auto-greet - let user trigger manually
};

// Test voice function
const handleTestVoice = () => {
    if (!isAIMuted && !isAgentSpeaking) {
        const testMessage = `Hello! This is ${agentName} speaking with the ${selectedVoice} voice. How can I help you today?`;
        speakResponse(testMessage);
    }
};

// AI Controls
const handleToggleAIMute = () => {
    setIsAIMuted(!isAIMuted);
    if (isAIMuted) {
        // Unmuting - do nothing special
    } else {
        // Muting - stop current speech
        ttsStopRequestedRef.current = true;
        forceStopTTS();
        setIsAgentSpeaking(false);

        // Ensure STT is active so user can ask while muted
        if (
            call?.microphone.enabled &&
            !isAIListeningDisabled &&
            recognitionRef.current &&
            !isListening &&
            !isShuttingDownRef.current
        ) {
            try {
                recognitionRef.current.start();
                setIsListening(true);
            } catch (e) {
                console.error('Failed to start recognition after muting AI:', e);
            }
        }
    }
};

const handleToggleAIListening = () => {
    setIsAIListeningDisabled(!isAIListeningDisabled);
    if (isAIListeningDisabled) {
        // Re-enabling listening
        if (call?.microphone.enabled && !isListening) {
            try {
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                console.error('Failed to start recognition:', e);
            }
        }
    } else {
        // Disabling listening
        try {
            recognitionRef.current?.stop();
            setIsListening(false);
        } catch (e) {
            console.error('Failed to stop recognition:', e);
        }
    }
};

// Stop TTS/STT immediately and then delegate to parent leave
const handleLeaveAndStopAudio = async () => {
    console.log('[CallActive] Handle leave: stopping audio pipelines and finalizing meeting...');
    setIsAIListeningDisabled(true);
    setIsListening(false);
    setIsAgentSpeaking(false);
    ttsStopRequestedRef.current = true;
    isShuttingDownRef.current = true;
    // Stop TTS/STT aggressively
    try { forceStopTTS(); } catch {}
    try { recognitionRef.current?.abort(); } catch {}
    // Send conversation for summary and mark meeting completed
    try {
        // Fetch merged transcript across all participants from sync API
        const joined = await fetch(`/api/conversation-sync?meetingId=${encodeURIComponent(meetingId)}&format=joined`).then(r => r.json()).catch(() => null);
        const mergedTranscript: string = joined?.transcript || conversationLogRef.current.join('\n');
        await fetch('/api/meeting-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meetingId,
                conversation: mergedTranscript,
            }),
        });
    } catch (e) {
        console.error('Failed to finalize meeting:', e);
    }
    onLeave();
};

// Ensure TTS/STS stop when component unmounts or tab becomes hidden
useEffect(() => {
    const stopAudioPipelines = () => {
        forceStopTTS();
        try { recognitionRef.current?.abort(); } catch (_) {}
        setIsListening(false);
        setIsAgentSpeaking(false);
        ttsStopRequestedRef.current = true;
        isShuttingDownRef.current = true;
    };

    const handleVisibility = () => {
        if (document.hidden) {
            stopAudioPipelines();
        }
    };

    const handlePageHide = () => stopAudioPipelines();
    const handleBeforeUnload = () => stopAudioPipelines();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        stopAudioPipelines();
    };
}, []);

    return (
        <div className="flex h-full text-white">
            {/* Main Call Area */}
            <div className="flex-1 flex flex-col justify-between p-4">
            <div className="bg-[#101213] rounded-full p-4 flex items-center gap-4">
                <Link href="/" className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit">
                    <Image src="/logo.svg" width={22} height={22} alt="Logo" />
                </Link>
                <div className="flex flex-col">
                    <h4 className="text-base font-medium">
                        {meetingName}
                    </h4>
                    <div className="text-sm text-gray-300">
                        Participants: {participantNames.length > 0 ? participantNames.join(', ') : 'You'}, {agentName}
                    </div>
                </div>
            </div>

                {/* Participants Grid with AI */}
                <div className="flex-1 flex flex-col gap-4">
                    {/* Human Participants */}
                    <div className="flex-1">
                        <CustomSpeakerLayout
                            isAgentSpeaking={isAgentSpeaking}
                            isListening={isListening}
                            onToggleAIMute={handleToggleAIMute}
                            onToggleAIListening={handleToggleAIListening}
                            onManualTrigger={handleManualTrigger}
                            onTestVoice={handleTestVoice}
                            agentName={agentName}
                            agentId={agentId}
                            selectedVoice={selectedVoice}
                            onVoiceChange={handleVoiceChange}
                            availableVoices={availableVoices}
                        />
                    </div>
                </div>
                
            <div className="bg-[#101213] rounded-full px-4">
                    <CallControls onLeave={handleLeaveAndStopAudio} />
                </div>
            </div>
        </div>
    );
};