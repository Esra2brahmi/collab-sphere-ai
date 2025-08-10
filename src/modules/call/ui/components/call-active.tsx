import { CallControls, SpeakerLayout, useCallStateHooks, useCall } from "@stream-io/video-react-sdk";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface Props {
    onLeave: () => void;
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

export const CallActive = ({ onLeave, meetingName, agentId }: Props) => {
    const { useParticipants } = useCallStateHooks();
    const participants = useParticipants();
    const call = useCall();
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [agentResponse, setAgentResponse] = useState("");
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const recognitionPausedByTTSRef = useRef(false);
    const ttsStopRequestedRef = useRef(false);
    const isShuttingDownRef = useRef(false);
    const greetingTimeoutRef = useRef<number | null>(null);
    const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const greetedRef = useRef(false);
    const voiceUnlockedRef = useRef(false);
    const lastMicStateRef = useRef<boolean | null>(null);

    const forceStopTTS = () => {
        try {
            // Detach handlers on the current utterance to avoid chaining
            if (currentUtteranceRef.current) {
                currentUtteranceRef.current.onend = null as any;
                currentUtteranceRef.current.onerror = null as any;
            }
        } catch {}
        try { window.speechSynthesis?.cancel(); } catch {}
        // Some Chromium builds need a couple of cancels spaced out
        const tryAgain = (delay: number) => window.setTimeout(() => {
            try { window.speechSynthesis?.cancel(); } catch {}
        }, delay);
        tryAgain(50);
        tryAgain(150);
    };

    // Monitor mic state changes and sync with AI speech recognition
    useEffect(() => {
        if (!call || !agentId) return;

        const checkMicState = () => {
            const isMicEnabled = call.microphone.enabled;
            
            // Only update if mic state actually changed
            if (lastMicStateRef.current !== isMicEnabled) {
                lastMicStateRef.current = isMicEnabled;
                
                if (isMicEnabled && !isListening) {
                    // Mic turned on - start AI listening
                    if (recognitionRef.current && !isShuttingDownRef.current) {
                        try {
                            recognitionRef.current.start();
                            setIsListening(true);
                            // Trigger greeting on first mic enable
                            if (!greetedRef.current) {
                                setTimeout(() => greetIfNeededOnGesture(), 100);
                            }
                        } catch (e) {
                            console.error('Failed to start recognition:', e);
                        }
                    }
                } else if (!isMicEnabled && isListening) {
                    // Mic turned off - stop AI listening
                    if (recognitionRef.current) {
                        try {
                            recognitionRef.current.stop();
                            setIsListening(false);
                        } catch (e) {
                            console.error('Failed to stop recognition:', e);
                        }
                    }
                }
            }
        };

        // Check initial state
        checkMicState();

        // Set up interval to monitor mic state changes
        const intervalId = setInterval(checkMicState, 500);

        return () => clearInterval(intervalId);
    }, [call, agentId, isListening]);

    // Initialize speech recognition and reset flags for each mount
    useEffect(() => {
        // Reset shutdown-related flags for a fresh session
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
                        setTranscript(finalTranscript);
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
        if (!agentId || isShuttingDownRef.current) return;

        try {
            console.log(`[User said]: ${message}`);
            
            const response = await fetch('/api/groq-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    agentId,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get agent response');
            }

            const data = await response.json();
            console.log(`[Agent response]: ${data.response}`);
            
            if (isShuttingDownRef.current) return;
            setAgentResponse(data.response);
            speakResponse(data.response);
            
        } catch (error) {
            if (!isShuttingDownRef.current) {
                console.error('Error getting agent response:', error);
            }
        }
    };

    // Helper: split long text into manageable chunks (~220 chars, sentence-aware)
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
                    // hard split very long sentences
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

    // Text-to-speech for agent responses (chunked) with STT pause/resume
    const speakResponse = (text: string) => {
        if (!('speechSynthesis' in window)) return;
        if (isShuttingDownRef.current) return;

        // Pause STT while TTS is active to avoid feedback/echo
        if (recognitionRef.current && isListening) {
            try {
                recognitionRef.current.stop();
                recognitionPausedByTTSRef.current = true;
                setIsListening(false);
            } catch (_) {}
        }

        // Stop any ongoing speech before starting a new queue
        window.speechSynthesis.cancel();
        ttsStopRequestedRef.current = false;

        const chunks = splitTextIntoChunks(text);
        if (chunks.length === 0) return;

        setIsAgentSpeaking(true);

        const speakChunkAt = (index: number) => {
            if (isShuttingDownRef.current || ttsStopRequestedRef.current) {
                setIsAgentSpeaking(false);
                return;
            }
            if (index >= chunks.length) {
                // Finished all chunks
                setIsAgentSpeaking(false);
                // Resume STT if we paused it AND mic is still enabled
                if (
                    recognitionRef.current &&
                    recognitionPausedByTTSRef.current &&
                    !isShuttingDownRef.current &&
                    !ttsStopRequestedRef.current &&
                    call?.microphone.enabled
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

            if (isShuttingDownRef.current || ttsStopRequestedRef.current) {
                setIsAgentSpeaking(false);
                return;
            }
            const utterance = new SpeechSynthesisUtterance(chunks[index]);
            utterance.rate = 0.95;
            utterance.pitch = 1.05;
            utterance.volume = 0.85;

            utterance.onend = () => {
                if (!isShuttingDownRef.current && !ttsStopRequestedRef.current) {
                    speakChunkAt(index + 1);
                } else {
                    setIsAgentSpeaking(false);
                }
            };
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event);
                if (!isShuttingDownRef.current && !ttsStopRequestedRef.current) {
                    speakChunkAt(index + 1);
                } else {
                    setIsAgentSpeaking(false);
                }
            };

            currentUtteranceRef.current = utterance;
            window.speechSynthesis.speak(utterance);
        };

        speakChunkAt(0);
    };

    // Greet on user gesture to satisfy autoplay policies
    const greetIfNeededOnGesture = () => {
        if (greetedRef.current || isShuttingDownRef.current) return;
        const greeting = `Hello! I'm your AI assistant. I'm here to help you during this call. You can speak to me and I'll respond.`;
        greetedRef.current = true;
        speakResponse(greeting);
        setAgentResponse(greeting);
    };

    // Stop TTS/STT immediately and then delegate to parent leave
    const handleLeaveAndStopAudio = () => {
        ttsStopRequestedRef.current = true;
        isShuttingDownRef.current = true;
        forceStopTTS();
        try { recognitionRef.current?.abort(); } catch (_) {}
        if (greetingTimeoutRef.current) {
            window.clearTimeout(greetingTimeoutRef.current);
            greetingTimeoutRef.current = null;
        }
        setIsListening(false);
        setIsAgentSpeaking(false);
        onLeave();
    };

    // Optional voice warm-up (non-blocking); greeting will happen on first user gesture
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            // Access voices to allow them to load; no auto-speak here
            void window.speechSynthesis.getVoices();
            const onVoicesChanged = () => {
                window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged as any);
            };
            try { window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged as any); } catch {}
        }
    }, []);

    // Ensure TTS/STS stop when component unmounts or tab becomes hidden
    useEffect(() => {
        const stopAudioPipelines = () => {
            forceStopTTS();
            try { recognitionRef.current?.abort(); } catch (_) {}
            setIsListening(false);
            setIsAgentSpeaking(false);
            ttsStopRequestedRef.current = true;
            isShuttingDownRef.current = true;
            if (greetingTimeoutRef.current) {
                window.clearTimeout(greetingTimeoutRef.current);
                greetingTimeoutRef.current = null;
            }
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

    // If everyone leaves (or call view switches), stop any ongoing speech
    useEffect(() => {
        if (participants.length === 0) {
            forceStopTTS();
            try { recognitionRef.current?.abort(); } catch (_) {}
            setIsListening(false);
            setIsAgentSpeaking(false);
            ttsStopRequestedRef.current = true;
            if (greetingTimeoutRef.current) {
                window.clearTimeout(greetingTimeoutRef.current);
                greetingTimeoutRef.current = null;
            }
        }
    }, [participants.length]);

    return (
        <div className="flex flex-col justify-between p-4 h-full text-white">
            <div className="bg-[#101213] rounded-full p-4 flex items-center gap-4">
                <Link href="/" className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit">
                    <Image src="/logo.svg" width={22} height={22} alt="Logo" />
                </Link>
                <h4 className="text-base">
                    {meetingName}
                </h4>
            </div>

            {/* Agent Status & Controls */}
            <div className="bg-[#1a1b1d] rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isAgentSpeaking ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                        <span className="text-sm">AI Assistant</span>
                    </div>
                    <div className="text-xs text-gray-400">
                        {!agentId ? 'No agent configured' : 
                         (call?.microphone.enabled ? 
                          (isListening ? '🎤 Listening to you' : '🎤 Mic enabled, ready to listen') :
                          '🎤 Enable mic to talk to AI')}
                    </div>
                </div>
                
                {transcript && (
                    <div className="mb-2">
                        <div className="text-xs text-gray-400 mb-1">You said:</div>
                        <div className="text-sm bg-blue-900/30 p-2 rounded">{transcript}</div>
                    </div>
                )}
                
                {agentResponse && (
                    <div>
                        <div className="text-xs text-gray-400 mb-1">Agent response:</div>
                        <div className="text-sm bg-green-900/30 p-2 rounded">{agentResponse}</div>
                    </div>
                )}
            </div>

            <SpeakerLayout />
            
            <div className="bg-[#101213] rounded-full px-4">
                <CallControls onLeave={handleLeaveAndStopAudio} />
            </div>
        </div>
    );
};