/**
 * Groq API Client for QPlus Voice Bot
 * 
 * Provides:
 * - Whisper Large V3 Turbo for STT
 * - Llama 3.1 70B for LLM
 * - Streaming responses with metrics tracking
 */

import Groq from 'groq-sdk';
import { metrics, logger } from './metrics.js';

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Rate limiting state (Groq has limits)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 100; // 10 req/sec max

async function rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    lastRequestTime = Date.now();
}

/**
 * Transcribe audio using Whisper Large V3 Turbo
 */
export async function transcribeAudio(
    audioBuffer: Buffer,
    correlationId: string
): Promise<string> {
    const startTime = Date.now();

    try {
        await rateLimit();

        metrics.logEvent({
            type: 'stt.request_start',
            timestamp: startTime,
            correlationId,
        });

        const transcription = await groq.audio.transcriptions.create({
            file: new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' }),
            model: 'whisper-large-v3-turbo',
            language: 'en', // Auto-detect possible, but explicit is faster
        });

        const durationMs = Date.now() - startTime;
        metrics.trackLatency('stt', durationMs);

        metrics.logEvent({
            type: 'stt.request_complete',
            timestamp: Date.now(),
            correlationId,
            durationMs,
            data: { textLength: transcription.text.length },
        });

        return transcription.text;
    } catch (error) {
        metrics.incrementCounter('errors');
        logger.error({ error, correlationId }, 'STT transcription failed');
        throw error;
    }
}

/**
 * Generate LLM response using Llama 3.1 70B
 */
export async function generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    correlationId: string
): Promise<string> {
    const startTime = Date.now();

    try {
        await rateLimit();

        metrics.logEvent({
            type: 'llm.request_start',
            timestamp: startTime,
            correlationId,
        });

        const messages = [
            {
                role: 'system' as const,
                content: `You are Qplus, a helpful voice assistant for Quantum Strides.
Keep responses short (1-2 sentences max) for natural conversation.
Be friendly but professional. If you don't know something, say so briefly.`,
            },
            ...conversationHistory.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: userMessage },
        ];

        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-70b-versatile',
            messages,
            max_tokens: 200, // Keep responses short for voice
            temperature: 0.7,
        });

        const response = completion.choices[0]?.message?.content || '';
        const durationMs = Date.now() - startTime;

        metrics.trackLatency('llm', durationMs);
        metrics.incrementCounter('requests');

        metrics.logEvent({
            type: 'llm.request_complete',
            timestamp: Date.now(),
            correlationId,
            durationMs,
            data: {
                inputTokens: completion.usage?.prompt_tokens,
                outputTokens: completion.usage?.completion_tokens,
            },
        });

        return response;
    } catch (error) {
        metrics.incrementCounter('errors');
        logger.error({ error, correlationId }, 'LLM generation failed');
        throw error;
    }
}

/**
 * Stream LLM response (for lower latency)
 */
export async function* streamResponse(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    correlationId: string
): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    let firstTokenTime: number | null = null;

    try {
        await rateLimit();

        metrics.logEvent({
            type: 'llm.stream_start',
            timestamp: startTime,
            correlationId,
        });

        const messages = [
            {
                role: 'system' as const,
                content: `You are Qplus, a helpful voice assistant. Keep responses under 2 sentences.`,
            },
            ...conversationHistory.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: userMessage },
        ];

        const stream = await groq.chat.completions.create({
            model: 'llama-3.1-70b-versatile',
            messages,
            max_tokens: 200,
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                if (!firstTokenTime) {
                    firstTokenTime = Date.now();
                    logger.info({
                        ttft: firstTokenTime - startTime,
                        correlationId
                    }, 'Time to first token');
                }
                yield content;
            }
        }

        const durationMs = Date.now() - startTime;
        metrics.trackLatency('llm', durationMs);

        metrics.logEvent({
            type: 'llm.stream_complete',
            timestamp: Date.now(),
            correlationId,
            durationMs,
        });
    } catch (error) {
        metrics.incrementCounter('errors');
        logger.error({ error, correlationId }, 'LLM streaming failed');
        throw error;
    }
}
