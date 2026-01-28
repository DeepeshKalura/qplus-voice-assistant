/**
 * Audio Player for QPlus Voice Bot
 * 
 * Uses Web Audio API for low-latency playback and instant interruption.
 * Critical Requirement: Must support instant stop() to handle barge-in.
 */

export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private activeSources: Set<AudioBufferSourceNode> = new Set();
    private isPlaying = false;
    private queue: AudioBuffer[] = [];
    private nextStartTime = 0;

    constructor() {
        // AudioContext will be initialized on first user interaction
    }

    async init(): Promise<void> {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Play simple beep sound (for wake word ack)
     */
    playBeep(frequency = 440, duration = 0.2): void {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    /**
     * Decode and schedule audio chunk for playback
     */
    async scheduleChunk(audioData: ArrayBuffer): Promise<void> {
        if (!this.audioContext) await this.init();
        if (!this.audioContext) return;

        try {
            const audioBuffer = await this.audioContext.decodeAudioData(audioData);

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);

            const currentTime = this.audioContext.currentTime;
            // Schedule for next available slot, or immediately if falling behind
            const startTime = Math.max(currentTime, this.nextStartTime);

            source.start(startTime);
            this.nextStartTime = startTime + audioBuffer.duration;

            this.activeSources.add(source);

            source.onended = () => {
                this.activeSources.delete(source);
                if (this.activeSources.size === 0) {
                    this.isPlaying = false;
                }
            };

            this.isPlaying = true;
        } catch (error) {
            console.error('Error decoding audio chunk:', error);
        }
    }

    /**
     * INSTANT INTERRUPTION
     * Stops all active sources and clears the schedule.
     */
    interrupt(): void {
        if (!this.audioContext) return;

        // Stop all active sources immediately
        this.activeSources.forEach(source => {
            try {
                source.stop();
                source.disconnect();
            } catch (e) {
                // Ignore errors if already stopped
            }
        });

        this.activeSources.clear();
        this.nextStartTime = this.audioContext.currentTime;
        this.isPlaying = false;

        // Briefly suspend context to force flush hardware buffers (optional but effective)
        // this.audioContext.suspend().then(() => this.audioContext?.resume());
    }

    isActive(): boolean {
        return this.isPlaying;
    }
}

export const audioPlayer = new AudioPlayer();
