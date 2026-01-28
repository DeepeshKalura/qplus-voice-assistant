export enum AppState {
    IDLE = 'IDLE',
    LISTENING_WAKE_WORD = 'LISTENING_WAKE_WORD',
    ACTIVE_LISTENING = 'ACTIVE_LISTENING',
    PROCESSING = 'PROCESSING',
    SPEAKING = 'SPEAKING',
    ERROR = 'ERROR'
}

export interface TranscriptEntry {
    role: 'user' | 'assistant';
    text: string;
    isFinal: boolean;
}

export interface KnowledgeBase {
    [key: string]: string;
}