import React, { useState } from "react";
import { useJarvisLive } from "./hooks/useJarvisLive";
import { IronManBlueprintHUD } from "./components/IronManBlueprintHUD";
import { TranscriptOverlay } from "./components/TranscriptOverlay";

export default function App() {
  const {
    systemState,
    isMicMuted,
    needsUserGesture,
    voiceName,
    transcripts,
    sampleAudioMetrics,
    unlockAndResumeAudio,
    reconnect,
    toggleMicMute,
    changeVoice,
    clearTranscripts,
    interruptJarvis,
  } = useJarvisLive();

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* ── Main Stark Industries Blueprint HUD ── */}
      <IronManBlueprintHUD
        systemState={systemState}
        sampleAudioMetrics={sampleAudioMetrics}
        isMicMuted={isMicMuted}
        needsUserGesture={needsUserGesture}
        voiceName={voiceName}
        onToggleMic={toggleMicMute}
        onUnlockAudio={unlockAndResumeAudio}
        onReconnect={reconnect}
        onInterrupt={interruptJarvis}
        onChangeVoice={changeVoice}
        onToggleTranscript={() => setIsTranscriptOpen((prev) => !prev)}
        isTranscriptOpen={isTranscriptOpen}
      />

      {/* ── Floating Holographic Transcript Overlay ── */}
      <TranscriptOverlay
        transcripts={transcripts}
        isOpen={isTranscriptOpen}
        onClear={clearTranscripts}
        onClose={() => setIsTranscriptOpen(false)}
      />
    </div>
  );
}
