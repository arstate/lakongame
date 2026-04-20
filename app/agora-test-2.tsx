import React, { useState, useEffect } from 'react';
import AgoraRTC, { AgoraRTCProvider, useRTCClient, useLocalMicrophoneTrack, usePublish, useJoin, useRemoteAudioTracks, useRemoteUsers } from "agora-rtc-react";
import { Mic, MicOff } from "lucide-react";

export const appId = "565e38e7aa3c4d71845a1f0205279df1";

const AgoraVoiceChatInner = ({ roomId, inGame }: { roomId: string, inGame: boolean }) => {
  const [micOn, setMicOn] = useState(false);
  
  // Initialize microphone track manually based on the micOn state
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  
  useJoin({ appid: appId, channel: roomId, token: null }, inGame);
  usePublish([localMicrophoneTrack]);
  
  const remoteUsers = useRemoteUsers();
  const { audioTracks } = useRemoteAudioTracks(remoteUsers);
  
  useEffect(() => {
    audioTracks.forEach(track => track.play());
  }, [audioTracks]);

  if (!inGame) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button 
        onClick={() => setMicOn(!micOn)}
        className={`p-4 rounded-full shadow-2xl transition-all flex items-center justify-center ${micOn ? 'bg-green-500 hover:bg-green-600 animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.6)] text-white' : 'bg-stone-800 hover:bg-stone-700 text-red-500 border border-stone-700'}`}
      >
        {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
      </button>
    </div>
  );
};

export const AgoraVoiceChat = ({ roomId, inGame }: { roomId: string, inGame: boolean }) => {
  const agoraClient = useRTCClient(AgoraRTC.createClient({ codec: "vp8", mode: "rtc" }));
  return (
    <AgoraRTCProvider client={agoraClient}>
      <AgoraVoiceChatInner roomId={roomId} inGame={inGame} />
    </AgoraRTCProvider>
  );
};
