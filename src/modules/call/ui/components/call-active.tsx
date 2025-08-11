import { CallControls, useCallStateHooks, useCall } from "@stream-io/video-react-sdk";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CustomSpeakerLayout } from "./custom-speaker-layout";

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

    const forceStopTTS = () => {
        try {
            // Cancel all speech synthesis
            window.speechSynthesis?.cancel();
            
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

    // Handle user speech input
    const handleUserMessage = async (message: string) => {
        if (!agentId || isShuttingDownRef.current) return;

        // Store the question for later response
        lastQuestionRef.current = message;
        setWaitingForQuestion(false);
        // Append to conversation log
        conversationLogRef.current.push(`User: ${message}`);
        
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

    // Text-to-speech for agent responses
    const speakResponse = (text: string) => {
        if (!('speechSynthesis' in window) || isAIMuted) return;
        if (isShuttingDownRef.current) return;
        // Append to conversation log
        if (text?.trim()) {
            conversationLogRef.current.push(`AI: ${text}`);
        }
        if (isAgentSpeaking) {
            console.log('[TTS] Already speaking, stopping current speech first');
            forceStopTTS();
            // Wait a bit before starting new speech
            setTimeout(() => {
                if (!isShuttingDownRef.current && !isAIMuted) {
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

        window.speechSynthesis.cancel();
        ttsStopRequestedRef.current = false;

        const chunks = splitTextIntoChunks(text);
        if (chunks.length === 0) return;

        setIsAgentSpeaking(true);

        const speakChunkAt = (index: number) => {
            if (isShuttingDownRef.current || ttsStopRequestedRef.current || isAIMuted) {
                setIsAgentSpeaking(false);
                return;
            }
            if (index >= chunks.length) {
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
            const utterance = new SpeechSynthesisUtterance(chunks[index]);
            
            // Set voice if selected
            if (selectedVoice !== "default") {
                const voices = window.speechSynthesis.getVoices();
                const selectedVoiceObj = voices.find(voice => voice.name === selectedVoice);
                if (selectedVoiceObj) {
                    utterance.voice = selectedVoiceObj;
                }
            }
            
            utterance.rate = 0.95;
            utterance.pitch = 1.05;
            utterance.volume = 0.85;

            utterance.onend = () => {
                if (!isShuttingDownRef.current && !ttsStopRequestedRef.current && !isAIMuted) {
                    speakChunkAt(index + 1);
                } else {
                    setIsAgentSpeaking(false);
                }
            };
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event);
                if (!isShuttingDownRef.current && !ttsStopRequestedRef.current && !isAIMuted) {
                    speakChunkAt(index + 1);
                } else {
                    setIsAgentSpeaking(false);
                }
            };

            window.speechSynthesis.speak(utterance);
        };

        speakChunkAt(0);
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
        ttsStopRequestedRef.current = true;
        isShuttingDownRef.current = true;
        forceStopTTS();
        try { recognitionRef.current?.abort(); } catch (_) {}
        setIsListening(false);
        setIsAgentSpeaking(false);
        // Send conversation for summary and mark meeting completed
        try {
            await fetch('/api/meeting-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId,
                    conversation: conversationLogRef.current.join('\n')
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

    // Handle call state changes
    useEffect(() => {
        if (!call) return;

        const handleCallStateChange = () => {
            console.log('[CallActive] Call state changed, ensuring cleanup...');
            forceStopTTS();
            try { recognitionRef.current?.abort(); } catch (_) {}
            setIsListening(false);
            setIsAgentSpeaking(false);
            ttsStopRequestedRef.current = true;
            isShuttingDownRef.current = true;
        };

        const unsubscribe = call.on('callEnded', handleCallStateChange);
        
        return () => {
            unsubscribe();
        };
    }, [call]);

    return (
        <div className="flex h-full text-white">
            {/* Main Call Area */}
            <div className="flex-1 flex flex-col justify-between p-4">
            <div className="bg-[#101213] rounded-full p-4 flex items-center gap-4">
                <Link href="/" className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit">
                    <Image src="/logo.svg" width={22} height={22} alt="Logo" />
                </Link>
                <h4 className="text-base">
                    {meetingName}
                </h4>
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