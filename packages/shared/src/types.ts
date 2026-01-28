// Shared types for QPlus Voice Bot

export enum VoiceBotState {
    IDLE = 'idle',
    CONNECTING = 'connecting',
    LISTENING = 'listening',
    PROCESSING = 'processing',
    SPEAKING = 'speaking',
    INTERRUPTED = 'interrupted',
    ERROR = 'error',
}

export interface TranscriptEntry {
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
    isFinal: boolean;
}

export interface VoiceBotMetrics {
    e2eLatencyMs: number;
    sttLatencyMs: number;
    llmLatencyMs: number;
    ttsFirstByteMs: number;
    interruptCount: number;
}

export interface VoiceBotEvent {
    type: string;
    timestamp: number;
    correlationId: string;
    data?: Record<string, unknown>;
}
