/**
 * Voice Bot State Machine (XState v5)
 * 
 * Manages the lifecycle of the voice interaction:
 * Idle <-> Connecting <-> Ready (Listening) <-> Processing <-> Speaking
 */

import { setup, assign, fromPromise } from 'xstate';
import { livekitClient } from '../livekit/livekit-client';

export type VoiceBotContext = {
    roomName: string;
    url: string | null;
    token: string | null;
    error: string | null;
    transcript: string[];
};

export const voiceBotMachine = setup({
    types: {
        context: {} as VoiceBotContext,
        events: {} as
            | { type: 'CONNECT' }
            | { type: 'DISCONNECT' }
            | { type: 'USER_SPEAKING_START' }
            | { type: 'USER_SPEAKING_END' }
            | { type: 'AGENT_SPEAKING_START' }
            | { type: 'AGENT_SPEAKING_END' }
            | { type: 'ERROR'; error: string },
    },
    actors: {
        connectToLiveKit: fromPromise(async ({ input }: { input: { roomName: string } }) => {
            // Fetch token
            const response = await fetch(`/api/token?room=${input.roomName}`);
            const data = await response.json();

            if (!data.token) throw new Error('Failed to get token');

            // Connect to LiveKit
            await livekitClient.connect(data.url, data.token);
            return data;
        }),
    },
}).createMachine({
    id: 'voiceBot',
    initial: 'idle',
    context: {
        roomName: 'daily-standup',
        url: null,
        token: null,
        error: null,
        transcript: [],
    },
    states: {
        idle: {
            on: {
                CONNECT: 'connecting',
            },
        },
        connecting: {
            invoke: {
                src: 'connectToLiveKit',
                input: ({ context }) => ({ roomName: context.roomName }),
                onDone: {
                    target: 'listening',
                    actions: assign({
                        token: ({ event }) => event.output.token,
                        url: ({ event }) => event.output.url,
                    }),
                },
                onError: {
                    target: 'error',
                    actions: assign({
                        error: ({ event }) => (event.error as Error).message,
                    }),
                },
            },
        },
        listening: {
            on: {
                USER_SPEAKING_START: 'processing', // Or just stay listening & show indicator
                DISCONNECT: 'idle',
            },
        },
        processing: {
            on: {
                AGENT_SPEAKING_START: 'speaking',
                USER_SPEAKING_END: 'listening', // Back to listening if false alarm
            },
        },
        speaking: {
            entry: () => {
                // Agent is speaking
            },
            on: {
                AGENT_SPEAKING_END: 'listening',
                USER_SPEAKING_START: {
                    target: 'listening', // Barge-in!
                    actions: () => {
                        console.log('Barge-in detected! Stopping playback.');
                        // Implement interrupt logic here
                    },
                },
            },
        },
        error: {
            on: {
                CONNECT: 'connecting',
            },
        },
    },
});
