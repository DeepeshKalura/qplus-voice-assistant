/**
 * LiveKit Client Wrapper for QPlus Voice Bot
 * 
 * Handles:
 * - Connecting to LiveKit Room
 * - Publishing microphone track with AEC enabled
 * - Subscribing to agent audio
 * - Handling disconnection
 */

import {
    Room,
    RoomEvent,
    RemoteParticipant,
    RemoteTrackPublication,
    RemoteTrack,
    Participant,
    LocalTrackPublication,
    Track,
    createLocalTracks,
    RoomOptions,
} from 'livekit-client';
import { audioPlayer } from '../audio/player';

export class LiveKitClient {
    private room: Room | null = null;
    private token: string | null = null;

    // Callbacks
    public onStateChange: ((state: string) => void) | null = null;
    public onAgentAudio: ((track: RemoteTrack) => void) | null = null;

    constructor() { }

    async connect(url: string, token: string): Promise<void> {
        this.token = token;

        // Configure room options with valid defaults
        const options: RoomOptions = {
            adaptiveStream: true,
            dynacast: true,
            publishDefaults: {
                simulcast: false,
                red: true, // Audio redundancy for packet loss
            },
        };

        this.room = new Room(options);

        // Set up event listeners
        this.room
            .on(RoomEvent.ConnectionStateChanged, (state) => {
                console.log('LiveKit State:', state);
                if (this.onStateChange) this.onStateChange(state);
            })
            .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
            .on(RoomEvent.Disconnected, () => {
                console.log('Disconnected from Room');
                if (this.onStateChange) this.onStateChange('disconnected');
            });

        await this.room.connect(url, token);
        console.log('Connected to Room:', this.room.name);

        // Publish microphone
        await this.publishMicrophone();
    }

    async publishMicrophone(): Promise<void> {
        if (!this.room) return;

        try {
            // Create audio track with AEC and Noise Suppression
            const tracks = await createLocalTracks({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });

            for (const track of tracks) {
                await this.room.localParticipant.publishTrack(track);
            }
            console.log('Microphone published');
        } catch (error) {
            console.error('Failed to publish microphone:', error);
            throw error;
        }
    }

    handleTrackSubscribed = (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
    ) => {
        if (track.kind === 'audio') {
            console.log('Subscribed to audio track from:', participant.identity);

            // Attach to invisible audio element for standard playing
            // OR pass to custom AudioPlayer if we want raw data
            track.attach();

            // For now, let LiveKit handle playback via HTML5 Audio
            // If we implement raw audio via Data Channels later, we use AudioPlayer

            if (this.onAgentAudio) {
                this.onAgentAudio(track);
            }
        }
    };

    async disconnect(): Promise<void> {
        if (this.room) {
            await this.room.disconnect();
            this.room = null;
        }
    }
}

export const livekitClient = new LiveKitClient();
