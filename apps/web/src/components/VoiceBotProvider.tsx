'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { voiceBotMachine } from '../lib/state/voice-machine';
import { livekitClient } from '../lib/livekit/livekit-client';
import { audioPlayer } from '../lib/audio/player';

interface VoiceBotContextType {
    state: any; // Type this properly if needed
    send: (event: any) => void;
    client: typeof livekitClient;
}

const VoiceBotContext = createContext<VoiceBotContextType | null>(null);

export function VoiceBotProvider({ children }: { children: React.ReactNode }) {
    const [state, send] = useMachine(voiceBotMachine);

    useEffect(() => {
        // Sync LiveKit events to XState machine
        livekitClient.onStateChange = (connectionState) => {
            if (connectionState === 'disconnected') {
                send({ type: 'DISCONNECT' });
            }
        };

        livekitClient.onAgentAudio = (track) => {
            // When agent audio starts, we can infer AGENT_SPEAKING_START
            // But better to use VAD events or data channel messages if available
            // For now, we rely on track subscription as a proxy for "ready to receive"

            // If we want to use AudioPlayer for instant interrupt:
            // 1. Get raw stream
            // 2. Feed to AudioContext
            // 3. Handle stop() on user speech
        };

        // Listen for user speech (VAD) locally?
        // User requested AEC on browser side. 
        // LiveKit handles AEC. 
        // Browser VAD via Hargrave or similar would be ideal for super-fast local interrupt.
        // For now, rely on Agent sending "user_started_speaking" via data channel?
        // Or just simple UI button "Stop" for manual test first.
    }, [send]);

    return (
        <VoiceBotContext.Provider value={{ state, send, client: livekitClient }}>
            {children}
        </VoiceBotContext.Provider>
    );
}

export const useVoiceBot = () => {
    const context = useContext(VoiceBotContext);
    if (!context) {
        throw new Error('useVoiceBot must be used within a VoiceBotProvider');
    }
    return context;
};
