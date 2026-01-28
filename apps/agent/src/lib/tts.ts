/**
 * Text-to-Speech Client
 * 
 * Note: Groq doesn't have a TTS API yet.
 * Options:
 * 1. Use browser's SpeechSynthesis API (client-side)
 * 2. Use a free TTS service (less quality)
 * 3. Use OpenAI TTS when user gets API key
 * 
 * For now, we'll use a simple browser-based approach:
 * The agent sends text to the frontend, which uses SpeechSynthesis.
 * 
 * Future: When OpenAI key is available, switch to GPT-4o Mini TTS.
 */

import { logger, metrics } from './metrics.js';

/**
 * TTS result that will be sent to frontend
 */
export interface TTSResult {
    type: 'text_for_speech';
    text: string;
    correlationId: string;
    timestamp: number;
}

/**
 * Convert text to TTS result
 * Frontend will handle the actual synthesis using SpeechSynthesis API
 */
export function createTTSResult(
    text: string,
    correlationId: string
): TTSResult {
    const startTime = Date.now();

    metrics.logEvent({
        type: 'tts.text_prepared',
        timestamp: startTime,
        correlationId,
        data: { textLength: text.length },
    });

    return {
        type: 'text_for_speech',
        text,
        correlationId,
        timestamp: startTime,
    };
}

/**
 * Split text into chunks for streaming TTS
 * This helps with lower perceived latency
 */
export function* chunkTextForTTS(
    text: string,
    maxChunkLength: number = 100
): Generator<string> {
    // Split on sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= maxChunkLength) {
            currentChunk += sentence;
        } else {
            if (currentChunk) {
                yield currentChunk.trim();
            }
            currentChunk = sentence;
        }
    }

    if (currentChunk.trim()) {
        yield currentChunk.trim();
    }
}

/**
 * Future: OpenAI TTS integration (when API key available)
 */
export async function synthesizeSpeechOpenAI(
    text: string,
    correlationId: string,
    voice: string = 'alloy'
): Promise<Buffer> {
    // Placeholder for OpenAI TTS
    // Will be implemented when OPENAI_API_KEY is provided

    logger.warn({ correlationId }, 'OpenAI TTS not configured - using browser SpeechSynthesis');

    throw new Error('OpenAI TTS not configured. Set OPENAI_API_KEY environment variable.');
}
