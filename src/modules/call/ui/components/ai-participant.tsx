import { useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, Play, Settings } from "lucide-react";

interface AIParticipantProps {
    isSpeaking: boolean;
    isListening: boolean;
    onToggleMute: () => void;
    onToggleListening: () => void;
    onManualTrigger: () => void;
    onTestVoice?: () => void;
    agentName?: string;
    selectedVoice?: string;
    onVoiceChange?: (voice: string) => void;
    availableVoices?: string[];
}

export const AIParticipant = ({ 
    isSpeaking, 
    isListening, 
    onToggleMute, 
    onToggleListening,
    onManualTrigger,
    onTestVoice,
    agentName = "AI Assistant",
    selectedVoice = "default",
    onVoiceChange,
    availableVoices = []
}: AIParticipantProps) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isListeningDisabled, setIsListeningDisabled] = useState(false);
    const [showVoiceSettings, setShowVoiceSettings] = useState(false);

    const handleToggleMute = () => {
        setIsMuted(!isMuted);
        onToggleMute();
    };

    const handleToggleListening = () => {
        setIsListeningDisabled(!isListeningDisabled);
        onToggleListening();
    };

    const handleManualTrigger = () => {
        onManualTrigger();
    };

    return (
        <div className="relative bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg overflow-hidden shadow-lg h-full w-full">
            {/* AI Avatar/Background */}
            <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                        <div className="text-2xl">🤖</div>
                    </div>
                    <div className="text-white font-medium">{agentName}</div>
                    <div className="text-white/70 text-sm">
                        {isSpeaking ? "Speaking..." : isListening ? "Listening..." : "Ready"}
                    </div>
                    {selectedVoice !== "default" && (
                        <div className="text-white/50 text-xs mt-1">
                            Voice: {selectedVoice}
                        </div>
                    )}
                </div>
            </div>

            {/* Speaking indicator */}
            {isSpeaking && (
                <div className="absolute top-3 left-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                </div>
            )}

            {/* Listening indicator */}
            {isListening && !isSpeaking && (
                <div className="absolute top-3 left-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                {/* Manual Trigger Button */}
                <button
                    onClick={handleManualTrigger}
                    className="p-2 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
                    title="Trigger AI Response"
                >
                    <Play className="w-4 h-4 text-white" />
                </button>

                {/* Test Voice Button */}
                {onTestVoice && (
                    <button
                        onClick={onTestVoice}
                        className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors"
                        title="Test Voice"
                    >
                        <Volume2 className="w-4 h-4 text-white" />
                    </button>
                )}

                {/* Mute/Unmute AI */}
                <button
                    onClick={handleToggleMute}
                    className={`p-2 rounded-full transition-colors ${
                        isMuted 
                            ? 'bg-red-500 hover:bg-red-600' 
                            : 'bg-white/20 hover:bg-white/30'
                    }`}
                    title={isMuted ? "Unmute AI" : "Mute AI"}
                >
                    {isMuted ? (
                        <VolumeX className="w-4 h-4 text-white" />
                    ) : (
                        <Volume2 className="w-4 h-4 text-white" />
                    )}
                </button>

                {/* Enable/Disable AI Listening */}
                <button
                    onClick={handleToggleListening}
                    className={`p-2 rounded-full transition-colors ${
                        isListeningDisabled 
                            ? 'bg-red-500 hover:bg-red-600' 
                            : 'bg-white/20 hover:bg-white/30'
                    }`}
                    title={isListeningDisabled ? "Enable AI Listening" : "Disable AI Listening"}
                >
                    {isListeningDisabled ? (
                        <MicOff className="w-4 h-4 text-white" />
                    ) : (
                        <Mic className="w-4 h-4 text-white" />
                    )}
                </button>

                {/* Voice Settings */}
                {availableVoices.length > 0 && (
                    <button
                        onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                        className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                        title="Voice Settings"
                    >
                        <Settings className="w-4 h-4 text-white" />
                    </button>
                )}
            </div>

            {/* Voice Settings Panel */}
            {showVoiceSettings && availableVoices.length > 0 && (
                <div className="absolute top-12 right-3 bg-black/80 rounded-lg p-3 min-w-[200px] z-10">
                    <div className="text-white text-sm font-medium mb-2">Select Voice</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                        {availableVoices.map((voice) => (
                            <button
                                key={voice}
                                onClick={() => {
                                    onVoiceChange?.(voice);
                                    setShowVoiceSettings(false);
                                }}
                                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                                    selectedVoice === voice
                                        ? 'bg-blue-500 text-white'
                                        : 'text-white/70 hover:bg-white/20'
                                }`}
                            >
                                {voice}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Status overlay */}
            <div className="absolute top-3 right-3">
                <div className="px-2 py-1 bg-black/50 rounded text-xs text-white">
                    AI
                </div>
            </div>
        </div>
    );
}; 