import { StreamTheme, useCall, useCallStateHooks, CallingState } from "@stream-io/video-react-sdk";
import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
    meetingId: string;
    meetingName: string;
    agentId: string;
};

export const CallUI=({meetingId, meetingName, agentId}:Props)=>{
    const call=useCall();
    const { useCallCallingState } = useCallStateHooks();
    const callingState = useCallCallingState();
    const [show,setShow]=useState<"lobby" | "call" | "ended" >("lobby");
    const trpc = useTRPC();
    const { mutateAsync: joinMeeting } = useMutation(trpc.meetings.join.mutationOptions());
    const { mutateAsync: leaveMeeting } = useMutation(trpc.meetings.leave.mutationOptions());

    // Ensure we fully stop any queued or ongoing browser TTS
    const forceStopTTS = () => {
        try {
            window.speechSynthesis?.cancel();
            window.speechSynthesis?.pause();
            window.speechSynthesis?.resume();
            window.speechSynthesis?.cancel();
        } catch {}

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

    // Monitor call state changes to handle when call ends
    useEffect(() => {
        if (!call) return;

        const handleCallEnded = () => {
            console.log('[CallUI] Call ended, cleaning up...');
            forceStopTTS();
            setShow("ended");
        };

        // Listen for call state changes
        const unsubscribe = call.on('callEnded', handleCallEnded);
        
        // Also check if call is already ended
        if (callingState === CallingState.LEFT || callingState === CallingState.OFFLINE) {
            handleCallEnded();
        }

        return () => {
            unsubscribe();
        };
    }, [call, callingState]);

    const handleJoin = async () => {
        if (!call) return;
        // record participant before joining UI
        try {
            await joinMeeting({ meetingId, role: "attendee" });
        } catch (e) {
            console.warn("[CallUI] Failed to record participant join:", e);
        }
        await call.join();
        setShow("call"); 
    };

    const handleLeave= async () => {
        if(!call) return;
        console.log('[CallUI] User leaving call...');
        forceStopTTS();
        // Leave the call instead of ending it for everyone
        call.leave();
        // mark participant as left (best-effort)
        try {
            await leaveMeeting({ meetingId });
        } catch (e) {
            console.warn("[CallUI] Failed to record participant leave:", e);
        }
        setShow("ended");
    };
    return (
        <StreamTheme className="h-full">
            {show === "lobby" && <CallLobby onJoin={handleJoin}/>}
            {show === "call" && <CallActive onLeave={handleLeave} meetingId={meetingId} meetingName={meetingName} agentId={agentId}/>}
            {show === "ended" && <CallEnded/>}
        </StreamTheme>
    )
}