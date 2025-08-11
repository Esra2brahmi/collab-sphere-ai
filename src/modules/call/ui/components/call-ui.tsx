import { StreamTheme, useCall, useCallStateHooks, CallingState } from "@stream-io/video-react-sdk";
import { useState, useEffect } from "react";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
    meetingName:string;
    agentId:string;
};

export const CallUI=({meetingName,agentId}:Props)=>{
    const call=useCall();
    const { useCallCallingState } = useCallStateHooks();
    const callingState = useCallCallingState();
    const [show,setShow]=useState<"lobby" | "call" | "ended" >("lobby");

    // Monitor call state changes to handle when call ends
    useEffect(() => {
        if (!call) return;

        const handleCallEnded = () => {
            console.log('[CallUI] Call ended, cleaning up...');
            try { window.speechSynthesis?.cancel(); } catch (_) {}
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
        await call.join();
        setShow("call"); 
    };

    const handleLeave=() => {
        if(!call) return;
        console.log('[CallUI] User leaving call...');
        try { window.speechSynthesis?.cancel(); } catch (_) {}
        // Leave the call instead of ending it for everyone
        call.leave();
        setShow("ended");
    };
    return (
        <StreamTheme className="h-full">
            {show === "lobby" && <CallLobby onJoin={handleJoin}/>}
            {show === "call" && <CallActive onLeave={handleLeave} meetingName={meetingName} agentId={agentId}/>}
            {show === "ended" && <CallEnded/>}
        </StreamTheme>
    )
}