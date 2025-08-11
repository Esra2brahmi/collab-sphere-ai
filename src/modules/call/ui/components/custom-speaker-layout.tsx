import { useCallStateHooks, ParticipantView } from "@stream-io/video-react-sdk";
import { AIParticipant } from "./ai-participant";

interface CustomSpeakerLayoutProps {
    isAgentSpeaking: boolean;
    isListening: boolean;
    onToggleAIMute: () => void;
    onToggleAIListening: () => void;
    onManualTrigger: () => void;
    onTestVoice?: () => void;
    agentName?: string;
    agentId?: string;
    selectedVoice?: string;
    onVoiceChange?: (voice: string) => void;
    availableVoices?: string[];
}

export const CustomSpeakerLayout = ({
    isAgentSpeaking,
    isListening,
    onToggleAIMute,
    onToggleAIListening,
    onManualTrigger,
    onTestVoice,
    agentName,
    agentId,
    selectedVoice,
    onVoiceChange,
    availableVoices
}: CustomSpeakerLayoutProps) => {
    const { useParticipants } = useCallStateHooks();
    const participants = useParticipants();

    // Fixed layout with absolute positioning - no shifting ever
    return (
        <div className="relative h-full w-full">
            {/* Fixed grid positions - never change */}
            
            {/* Top Left - Always Human 1 */}
            <div className="absolute top-0 left-0 w-1/2 h-1/2 p-2">
                {participants[0] ? (
                    <div className="h-full w-full rounded-lg overflow-hidden">
                        <ParticipantView participant={participants[0]} />
                    </div>
                ) : (
                    <div className="h-full w-full bg-gray-800/20 rounded-lg border-2 border-dashed border-gray-600/30"></div>
                )}
            </div>

            {/* Top Right - Always Human 2 */}
            <div className="absolute top-0 right-0 w-1/2 h-1/2 p-2">
                {participants[1] ? (
                    <div className="h-full w-full rounded-lg overflow-hidden">
                        <ParticipantView participant={participants[1]} />
                    </div>
                ) : (
                    <div className="h-full w-full bg-gray-800/20 rounded-lg border-2 border-dashed border-gray-600/30"></div>
                )}
            </div>

            {/* Bottom Left - Always Human 3 */}
            <div className="absolute bottom-0 left-0 w-1/2 h-1/2 p-2">
                {participants[2] ? (
                    <div className="h-full w-full rounded-lg overflow-hidden">
                        <ParticipantView participant={participants[2]} />
                    </div>
                ) : (
                    <div className="h-full w-full bg-gray-800/20 rounded-lg border-2 border-dashed border-gray-600/30"></div>
                )}
            </div>

            {/* Bottom Right - Always AI or Human 4 */}
            <div className="absolute bottom-0 right-0 w-1/2 h-1/2 p-2">
                {agentId ? (
                    <div className="h-full w-full rounded-lg overflow-hidden">
                        <AIParticipant
                            isSpeaking={isAgentSpeaking}
                            isListening={isListening}
                            onToggleMute={onToggleAIMute}
                            onToggleListening={onToggleAIListening}
                            onManualTrigger={onManualTrigger}
                            onTestVoice={onTestVoice}
                            agentName={agentName}
                            selectedVoice={selectedVoice}
                            onVoiceChange={onVoiceChange}
                            availableVoices={availableVoices}
                        />
                    </div>
                ) : participants[3] ? (
                    <div className="h-full w-full rounded-lg overflow-hidden">
                        <ParticipantView participant={participants[3]} />
                    </div>
                ) : (
                    <div className="h-full w-full bg-gray-800/20 rounded-lg border-2 border-dashed border-gray-600/30"></div>
                )}
            </div>
        </div>
    );
}; 