import { StreamTheme, useCall } from "@stream-io/video-react-sdk";
import { useState } from "react";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
    meetingName:string;
    agentId:string;
};

export const CallUI=({meetingName,agentId}:Props)=>{
    const call=useCall();
    const [show,setShow]=useState<"lobby" | "call" | "ended" >("lobby");

    const handleJoin = async () => {
        if (!call) return;
        await call.join();
        setShow("call"); 
    };

    const handleLeave=() => {
        if(!call) return;
        try { window.speechSynthesis?.cancel(); } catch (_) {}
        call.endCall();
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