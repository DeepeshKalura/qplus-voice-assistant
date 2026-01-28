/**
 * QPlus Voice Bot Agent - Simplified Implementation
 * 
 * Uses a simpler approach that works with LiveKit Agents SDK 1.0:
 * 1. Connect to LiveKit room
 * 2. Use built-in pipeline patterns
 * 3. Integrate Groq for STT/LLM
 */

import './env.js';
import {
    ServerOptions,
    cli,
    defineAgent,
    JobContext,
} from '@livekit/agents';
import { logger, metrics } from './lib/metrics.js';
import { transcribeAudio, streamResponse } from './lib/groq.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Conversation history per room
const roomConversations = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

// Define the voice agent
export default defineAgent({
    entry: async (ctx: JobContext) => {
        const correlationId = metrics.generateCorrelationId();
        metrics.incrementCounter('sessions');

        const roomName = ctx.room.name ?? 'unknown';

        logger.info({
            roomName,
            correlationId,
        }, 'Agent connected to room');

        // Initialize conversation history for this room
        if (!roomConversations.has(roomName)) {
            roomConversations.set(roomName, []);
        }
        const conversationHistory = roomConversations.get(roomName)!;

        logger.info({ correlationId }, 'Agent initialized and ready');
        logger.info({
            summary: metrics.getSummary(),
            correlationId
        }, 'Current metrics');

        // For now, log room events
        // Full VAD/STT/LLM pipeline will be implemented in Phase 4
        ctx.room.on('trackSubscribed', (track, publication, participant) => {
            logger.info({
                participantId: participant.identity,
                trackKind: track.kind,
                correlationId,
            }, 'Track subscribed');
        });

        ctx.room.on('participantDisconnected', (participant) => {
            logger.info({
                participantId: participant.identity,
                correlationId,
            }, 'Participant disconnected');
        });

        ctx.room.on('disconnected', () => {
            logger.info({
                roomName,
                correlationId,
                metrics: metrics.getSummary(),
            }, 'Room disconnected - final metrics');

            roomConversations.delete(roomName);
        });

        // Example: Process a test message to verify Groq integration
        if (process.env.TEST_MODE === 'true') {
            logger.info('Running test mode...');

            try {
                const testResponse = await streamResponse(
                    'Hello, can you introduce yourself briefly?',
                    [],
                    correlationId
                );

                let fullResponse = '';
                for await (const chunk of testResponse) {
                    fullResponse += chunk;
                }

                logger.info({ response: fullResponse }, 'Test response received');
            } catch (error) {
                logger.error({ error }, 'Test failed');
            }
        }
    },
});

// CLI entry point
cli.runApp(new ServerOptions({
    agent: import.meta.filename,
}));
