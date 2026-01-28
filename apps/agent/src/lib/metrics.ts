/**
 * Structured Metrics Logger for QPlus Voice Bot
 * 
 * Provides:
 * - Structured logging with Pino
 * - Metric collection and aggregation
 * - Event correlation via correlationId
 */

import pino from 'pino';

export interface MetricEvent {
    type: string;
    timestamp: number;
    correlationId: string;
    durationMs?: number;
    data?: Record<string, unknown>;
}

export interface MetricsSummary {
    sessionCount: number;
    avgE2ELatencyMs: number;
    avgSttLatencyMs: number;
    avgLlmLatencyMs: number;
    avgTtsLatencyMs: number;
    interruptCount: number;
    errorRate: number;
}

class MetricsCollector {
    private logger: pino.Logger;
    private events: MetricEvent[] = [];
    private counters = {
        sessions: 0,
        requests: 0,
        errors: 0,
        interrupts: 0,
    };
    private latencies = {
        e2e: [] as number[],
        stt: [] as number[],
        llm: [] as number[],
        tts: [] as number[],
    };

    constructor() {
        this.logger = pino({
            level: process.env.LOG_LEVEL || 'info',
            transport: {
                target: 'pino-pretty',
                options: { colorize: true },
            },
        });
    }

    // Generate unique correlation ID
    generateCorrelationId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Log structured event
    logEvent(event: MetricEvent): void {
        this.events.push(event);
        this.logger.info({ event }, `[${event.type}]`);

        // Keep only last 1000 events
        if (this.events.length > 1000) {
            this.events.shift();
        }
    }

    // Track latency
    trackLatency(type: 'e2e' | 'stt' | 'llm' | 'tts', durationMs: number): void {
        this.latencies[type].push(durationMs);

        // Keep only last 100 measurements
        if (this.latencies[type].length > 100) {
            this.latencies[type].shift();
        }
    }

    // Increment counter
    incrementCounter(type: 'sessions' | 'requests' | 'errors' | 'interrupts'): void {
        this.counters[type]++;
    }

    // Get average latency
    private getAvgLatency(type: 'e2e' | 'stt' | 'llm' | 'tts'): number {
        const latencies = this.latencies[type];
        if (latencies.length === 0) return 0;
        return Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    }

    // Get summary
    getSummary(): MetricsSummary {
        return {
            sessionCount: this.counters.sessions,
            avgE2ELatencyMs: this.getAvgLatency('e2e'),
            avgSttLatencyMs: this.getAvgLatency('stt'),
            avgLlmLatencyMs: this.getAvgLatency('llm'),
            avgTtsLatencyMs: this.getAvgLatency('tts'),
            interruptCount: this.counters.interrupts,
            errorRate: this.counters.requests > 0
                ? this.counters.errors / this.counters.requests
                : 0,
        };
    }

    // Get logger instance
    getLogger(): pino.Logger {
        return this.logger;
    }
}

// Singleton instance
export const metrics = new MetricsCollector();
export const logger = metrics.getLogger();
