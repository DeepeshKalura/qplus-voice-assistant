'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AppState, TranscriptEntry } from '@/lib/types';
import { WAKE_WORD, WAKE_WORD_VARIANTS, SAMPLING_RATE_IN, SAMPLING_RATE_OUT, GEMINI_MODEL } from '@/lib/constants';
import { encode, decode, decodeAudioData, downsampleTo16k } from '@/lib/audioUtils';
import { knowledgeBase } from '@/lib/knowledge_base';


const VoiceAssistant: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(AppState.IDLE);
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [wakeWordBuffer, setWakeWordBuffer] = useState<string>('');
    const [recognitionStatus, setRecognitionStatus] = useState<string>('OFFLINE');
    const [isAccepted, setIsAccepted] = useState(false);
    const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

    const [isBooted, setIsBooted] = useState(false);

    // Refs for audio processing
    const audioContextInRef = useRef<AudioContext | null>(null);
    const audioContextOutRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameRef = useRef<number>(0);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const sessionRef = useRef<any>(null);
    const micStreamRef = useRef<MediaStream | null>(null);

    // Refs for transcription buffering
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    // Wake word detector
    const wakeWordRecognitionRef = useRef<any>(null);
    const processingRef = useRef(false);

    const stopAllAudio = useCallback(() => {
        sourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) { }
        });
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    }, []);

    const updateTranscripts = useCallback((role: 'user' | 'assistant', text: string, isFinal: boolean) => {
        setTranscripts(prev => {
            const newTranscripts = [...prev];
            const lastIndex = newTranscripts.map(t => t.role).lastIndexOf(role);

            if (lastIndex !== -1 && !newTranscripts[lastIndex].isFinal) {
                newTranscripts[lastIndex] = { role, text, isFinal };
                return newTranscripts;
            } else {
                return [...prev, { role, text, isFinal }];
            }
        });
    }, []);

    const drawVisualizer = useCallback(() => {
        if (!analyserRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const render = () => {
            animationFrameRef.current = requestAnimationFrame(render);
            analyserRef.current!.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

                const r = 34 + (i * 2);
                const g = 211 - (i * 0.5);
                const b = 238;

                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${appState === AppState.ACTIVE_LISTENING || appState === AppState.LISTENING_WAKE_WORD ? 0.8 : 0.3})`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };
        render();
    }, [appState]);

    useEffect(() => {
        if (appState !== AppState.IDLE) {
            drawVisualizer();
        } else {
            cancelAnimationFrame(animationFrameRef.current);
        }
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [appState, drawVisualizer]);

    const initAudioSystem = async () => {
        try {
            if (!micStreamRef.current) {
                micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            if (!audioContextInRef.current) {
                audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            if (!analyserRef.current) {
                const source = audioContextInRef.current.createMediaStreamSource(micStreamRef.current);
                analyserRef.current = audioContextInRef.current.createAnalyser();
                analyserRef.current.fftSize = 64;
                source.connect(analyserRef.current);
            }

            return true;
        } catch (err) {
            console.error("Mic initialization failed:", err);
            setError("Microphone access is required.");
            return false;
        }
    };

    const startAssistantSession = useCallback(async () => {
        if (processingRef.current || appState !== AppState.LISTENING_WAKE_WORD) return; // Prevent re-triggering

        try {
            processingRef.current = true;
            setAppState(AppState.ACTIVE_LISTENING);
            setWakeWordBuffer('');

            const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
            if (!apiKey) {
                setError("API Key missing.");
                setAppState(AppState.ERROR);
                processingRef.current = false;
                return;
            }

            const ai = new GoogleGenAI({ apiKey });

            if (!audioContextOutRef.current) {
                audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const sessionPromise = ai.live.connect({
                model: GEMINI_MODEL,
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
                    },
                    // @ts-ignore
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: `You are Qplus, a voice assistant for Quantum Strides. Follow these rules strictly:
1. Give SHORT, SINGLE responses - never repeat yourself
2. Speak naturally in 1-2 sentences maximum
3. Do NOT combine multiple answers into one response
4. Wait for the user to ask before providing more information
5. If greeted, respond with a brief greeting only

Knowledge base: ${JSON.stringify(knowledgeBase)}`,
                },
                callbacks: {
                    onopen: () => {
                        const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcm16 = downsampleTo16k(inputData, audioContextInRef.current!.sampleRate);

                            const pcmBlob = {
                                data: encode(new Uint8Array(pcm16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };

                        const source = audioContextInRef.current!.createMediaStreamSource(micStreamRef.current!);
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(audioContextInRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            const newText = message.serverContent.inputTranscription.text || '';
                            // Smart append - only add if it's truly new content
                            if (newText && !currentInputTranscriptionRef.current.endsWith(newText)) {
                                // Check if new text is an extension of current
                                if (newText.startsWith(currentInputTranscriptionRef.current)) {
                                    currentInputTranscriptionRef.current = newText;
                                } else {
                                    currentInputTranscriptionRef.current += newText;
                                }
                            }
                            updateTranscripts('user', currentInputTranscriptionRef.current, false);
                        }
                        if (message.serverContent?.outputTranscription) {
                            const newText = message.serverContent.outputTranscription.text || '';
                            // Smart append - only add if it's truly new content
                            if (newText && !currentOutputTranscriptionRef.current.endsWith(newText)) {
                                // Check if new text is an extension of current
                                if (newText.startsWith(currentOutputTranscriptionRef.current)) {
                                    currentOutputTranscriptionRef.current = newText;
                                } else {
                                    currentOutputTranscriptionRef.current += newText;
                                }
                            }
                            updateTranscripts('assistant', currentOutputTranscriptionRef.current, false);
                            setAppState(AppState.SPEAKING);
                        }
                        if (message.serverContent?.turnComplete) {
                            updateTranscripts('user', currentInputTranscriptionRef.current, true);
                            updateTranscripts('assistant', currentOutputTranscriptionRef.current, true);
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';
                            setAppState(AppState.ACTIVE_LISTENING);
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

                        if (base64Audio && audioContextOutRef.current) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContextOutRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), audioContextOutRef.current, SAMPLING_RATE_OUT, 1);
                            const source = audioContextOutRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(audioContextOutRef.current.destination);
                            source.addEventListener('ended', () => sourcesRef.current.delete(source));
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }
                        if (message.serverContent?.interrupted) stopAllAudio();
                    },
                    onerror: (e) => {
                        console.error(e);
                        setError('Connection failed. Re-initializing...');
                        setAppState(AppState.ERROR);
                    },
                    onclose: () => {
                        console.log("Session closed");
                        processingRef.current = false;
                        setAppState(AppState.LISTENING_WAKE_WORD);
                    }
                }
            });
            sessionRef.current = await sessionPromise;
        } catch (err) {
            console.error(err);
            setError('Audio initialization failed.');
            setAppState(AppState.ERROR);
        }
    }, [stopAllAudio, updateTranscripts, appState]);

    // --- REFACTORED WAKE WORD LOGIC WITH CLEANUP ---
    useEffect(() => {
        if (!isBooted) return;
        // Don't start wake word detection if we are already in an active session
        if (appState === AppState.ACTIVE_LISTENING || appState === AppState.SPEAKING) return;

        let recognition: any;

        const startWakeWordDetection = async () => {
            const initialized = await initAudioSystem();
            if (!initialized) {
                setIsBooted(false); // Reset boot state on failure
                return;
            }

            setAppState(AppState.LISTENING_WAKE_WORD);
            setRecognitionStatus('BOOTING...');

            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                setError("Speech API unsupported. Please use Chrome/Edge.");
                setAppState(AppState.ERROR);
                return;
            }

            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => setRecognitionStatus('ENGINE ONLINE');
            recognition.onaudiostart = () => setRecognitionStatus('SIGNAL DETECTED');
            recognition.onspeechstart = () => setRecognitionStatus('LISTENING...');
            recognition.onspeechend = () => setRecognitionStatus('PROCESSING...');

            recognition.onresult = (event: any) => {
                let fullTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    fullTranscript += event.results[i][0].transcript;
                }

                const normalized = fullTranscript.toLowerCase().trim();
                setWakeWordBuffer(normalized);

                if (WAKE_WORD_VARIANTS.some(v => normalized.includes(v))) {
                    setIsAccepted(true);
                    setRecognitionStatus('ACCEPTED');
                    setTimeout(() => setIsAccepted(false), 1200);
                    recognition.stop();
                    startAssistantSession();
                }
            };

            recognition.onerror = (event: any) => {
                console.error("Wake word engine error:", event.error);
                if (event.error === 'not-allowed') {
                    setError("Microphone access denied.");
                    setAppState(AppState.ERROR);
                }
                setRecognitionStatus('ERROR: ' + event.error.toUpperCase());
            };

            recognition.onend = () => {
                // Only restart if we are still in the correct state and the component is booted
                if (appState === AppState.LISTENING_WAKE_WORD && isBooted) {
                    setRecognitionStatus('RESTARTING ENGINE...');
                    try { recognition.start(); } catch (e) { }
                }
            };

            wakeWordRecognitionRef.current = recognition;
            recognition.start();
        }

        startWakeWordDetection();

        // --- CRITICAL CLEANUP FUNCTION ---
        return () => {
            if (wakeWordRecognitionRef.current) {
                console.log("Cleaning up wake word engine...");
                wakeWordRecognitionRef.current.onend = null; // Prevent onend from firing during cleanup
                wakeWordRecognitionRef.current.stop();
                wakeWordRecognitionRef.current = null;
            }
            if (sessionRef.current) {
                sessionRef.current.close();
                sessionRef.current = null;
            }
        };
    }, [isBooted, appState, startAssistantSession]); // Re-run effect if boot state changes


    return (
        <div className="flex flex-col h-screen select-none relative">
            {/* ... The rest of your JSX remains exactly the same ... */}
            {/* --- START OF UNCHANGED JSX --- */}
            <div className={`fixed inset-0 pointer-events-none z-[100] bg-cyan-500/10 transition-opacity duration-300 ${isAccepted ? 'opacity-100' : 'opacity-0'}`}></div>
            {isSupportModalOpen && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
                    onClick={() => setIsSupportModalOpen(false)}
                >
                    <div
                        className="bg-slate-900 border-2 border-cyan-500/50 rounded-2xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(6,182,212,0.2)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-cyan-500/10 rounded-full flex items-center justify-center border border-cyan-500/30">
                                <i className="fas fa-headset text-cyan-400 text-xl"></i>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">System Support</h3>
                                <p className="text-[10px] font-mono text-slate-500 uppercase">Quantum Strides Engineering</p>
                            </div>
                        </div>
                        <div className="space-y-4 mb-8">
                            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                <p className="text-xs text-slate-400 mb-2 font-mono uppercase tracking-widest text-[9px]">Contact Email</p>
                                <a href="mailto:support@quantumstrides.com" className="text-cyan-400 font-bold hover:underline">support@quantumstrides.com</a>
                            </div>
                            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                <p className="text-xs text-slate-400 mb-2 font-mono uppercase tracking-widest text-[9px]">Handshake Status</p>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${appState === AppState.ERROR ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></div>
                                    <span className="text-xs font-mono text-slate-200 uppercase">{appState}</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed italic">
                                If the wake-word is not detecting, ensure your microphone is active and you are in a quiet environment. Say "Hey Qplus" clearly toward your device.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsSupportModalOpen(false)}
                            className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition-all active:scale-95 shadow-[0_10px_20px_rgba(6,182,212,0.2)]"
                        >
                            CLOSE DASHBOARD
                        </button>
                    </div>
                </div>
            )}
            <header className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4 z-10 p-4 md:p-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.6)] animate-pulse">
                        <i className="fas fa-atom text-slate-950 text-xl"></i>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-cyan-400">QUANTUM STRIDES</h1>
                        <p className="text-[10px] font-mono text-slate-500 uppercase">System v2.5.0-Flash-Native</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                    <button
                        onClick={() => setIsSupportModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/10 transition-all active:scale-95 group"
                    >
                        <i className="fas fa-question-circle group-hover:rotate-12 transition-transform"></i>
                        <span className="text-[10px] font-bold font-mono uppercase tracking-wider hidden sm:inline">Support</span>
                    </button>
                    <div className="hidden sm:flex flex-col items-end mr-2">
                        <span className="text-[9px] text-slate-500 font-mono uppercase">Telemetry Status</span>
                        <span className="text-[10px] text-cyan-500 font-mono tracking-widest">ENCRYPTED • ACTIVE</span>
                    </div>
                    <div className={`px-3 py-1 rounded-full border border-slate-800 flex items-center gap-2 ${appState === AppState.ACTIVE_LISTENING ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-900'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${appState === AppState.ACTIVE_LISTENING || appState === AppState.SPEAKING ? 'bg-green-500 animate-pulse' :
                            appState === AppState.LISTENING_WAKE_WORD ? 'bg-amber-500 animate-pulse' : 'bg-slate-700'
                            }`}></div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{appState.replace(/_/g, ' ')}</span>
                    </div>
                </div>
            </header>
            <main className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden z-10 px-4 md:px-6 pb-4 md:pb-6">
                <div className={`flex-1 flex flex-col bg-slate-900/40 rounded-3xl border transition-colors duration-500 p-6 relative overflow-hidden group ${isAccepted ? 'border-cyan-400 bg-cyan-900/20' : 'border-slate-800'}`}>
                    <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent ${isAccepted ? 'h-2 opacity-100' : 'opacity-40'}`}></div>
                    <div className="flex-1 flex flex-col items-center justify-center relative">
                        <canvas
                            ref={canvasRef}
                            width={400}
                            height={150}
                            className="absolute w-full max-w-lg opacity-40 transition-opacity duration-1000"
                        />
                        <div className="relative z-10">
                            {isAccepted && (
                                <div className="absolute inset-0 -m-8 rounded-full bg-cyan-400/20 blur-3xl animate-pulse"></div>
                            )}
                            <div className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-700 ${isAccepted ? 'bg-cyan-900/40 border-4 border-cyan-400 shadow-[0_0_100px_rgba(34,211,238,0.6)] scale-125' :
                                appState === AppState.IDLE ? 'bg-slate-800 scale-90' :
                                    appState === AppState.LISTENING_WAKE_WORD ? 'bg-amber-900/20 border-2 border-amber-500/50 scale-100 shadow-[0_0_40px_rgba(245,158,11,0.1)]' :
                                        appState === AppState.ACTIVE_LISTENING ? 'bg-cyan-900/20 border-2 border-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.2)] scale-110' :
                                            appState === AppState.SPEAKING ? 'bg-indigo-900/20 border-2 border-indigo-400 shadow-[0_0_50px_rgba(129,140,248,0.2)] scale-105' :
                                                'bg-red-900/20 border-2 border-red-500'
                                }`}>
                                <div className={`w-32 h-32 rounded-full border border-white/5 flex items-center justify-center relative`}>
                                    {(appState === AppState.ACTIVE_LISTENING || appState === AppState.LISTENING_WAKE_WORD || isAccepted) && (
                                        <div className={`absolute inset-0 rounded-full border-2 ${isAccepted ? 'border-cyan-400' : appState === AppState.LISTENING_WAKE_WORD ? 'border-amber-500/20' : 'border-cyan-500/20'} ${isAccepted ? 'scale-150 opacity-0' : 'animate-ping'}`}></div>
                                    )}
                                    <i className={`fas ${isAccepted ? 'fa-check text-cyan-400' :
                                        appState === AppState.IDLE ? 'fa-power-off text-slate-600' :
                                            appState === AppState.LISTENING_WAKE_WORD ? 'fa-ear-listen text-amber-500' :
                                                appState === AppState.ACTIVE_LISTENING ? 'fa-waveform text-cyan-400' :
                                                    appState === AppState.SPEAKING ? 'fa-volume-high text-indigo-400' :
                                                        'fa-triangle-exclamation text-red-500'
                                        } text-5xl transition-all duration-300`}></i>
                                </div>
                            </div>
                        </div>
                        <div className="mt-10 text-center z-10 min-h-[140px] flex flex-col items-center justify-start">
                            {isAccepted ? (
                                <div className="flex flex-col items-center">
                                    <h2 className="text-3xl font-black tracking-widest text-cyan-400 mb-1 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">WAKE WORD ACCEPTED</h2>
                                    <p className="text-cyan-500/70 text-[10px] font-mono uppercase tracking-[0.3em]">SECURE SESSION INITIALIZED</p>
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-2xl font-light tracking-widest text-white mb-2 uppercase">
                                        {appState === AppState.IDLE && "SYSTEM OFFLINE"}
                                        {appState === AppState.LISTENING_WAKE_WORD && "AWAITING WAKE WORD"}
                                        {appState === AppState.ACTIVE_LISTENING && "LISTENING..."}
                                        {appState === AppState.SPEAKING && "TRANSMITTING..."}
                                        {appState === AppState.ERROR && "SYSTEM ERROR"}
                                    </h2>
                                    <div className="flex flex-col items-center">
                                        <p className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-4">
                                            {appState === AppState.LISTENING_WAKE_WORD ? 'SAY CLEARLY: "HEY QPLUS"' :
                                                appState === AppState.IDLE ? 'INITIALIZE CORE SYSTEMS' : 'BI-DIRECTIONAL STREAM ACTIVE'}
                                        </p>
                                        {appState === AppState.LISTENING_WAKE_WORD && (
                                            <div className="bg-slate-950/80 border border-slate-800 px-6 py-4 rounded-xl text-amber-400 font-mono text-sm shadow-2xl min-w-[280px]">
                                                <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800/50">
                                                    <span className="text-slate-600 text-[9px] uppercase tracking-wider font-bold">Speech Engine Status</span>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${recognitionStatus === 'LISTENING...' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                                        {recognitionStatus}
                                                    </span>
                                                </div>
                                                <div className="min-h-[1.5rem] italic text-slate-300 leading-tight">
                                                    "{wakeWordBuffer || "Speak now to trigger..."}"
                                                </div>
                                                {wakeWordBuffer && (
                                                    <div className="mt-2 pt-2 border-t border-slate-800/50 flex gap-2">
                                                        <div className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></div>
                                                        <span className="text-[8px] text-slate-600 uppercase tracking-widest font-mono">Real-time phonetic stream</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between items-end">
                        <div className="flex gap-4 font-mono text-[9px] text-slate-600">
                            <div className="flex flex-col"><span>SRATE_IN</span><span className="text-slate-400">16000HZ</span></div>
                            <div className="flex flex-col"><span>BUFFER</span><span className="text-slate-400">4096B</span></div>
                            <div className="flex flex-col"><span>ENCODE</span><span className="text-slate-400">PCM16</span></div>
                        </div>

                        {/* --- MODIFIED BUTTON --- */}
                        <button
                            onClick={() => appState === AppState.IDLE && setIsBooted(true)}
                            disabled={appState !== AppState.IDLE}
                            className={`px-10 py-3 rounded-xl font-bold font-mono text-xs tracking-widest transition-all ${appState === AppState.IDLE
                                ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.3)] active:scale-95'
                                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                }`}
                        >
                            {appState === AppState.IDLE ? 'BOOT UP' : 'SYSTEM READY'}
                        </button>
                    </div>
                </div>
                <div className="w-full md:w-80 flex flex-col gap-4 z-10">
                    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 h-40">
                        <div className="flex justify-between mb-3">
                            <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-wider">Stream Telemetry</span>
                            <i className="fas fa-chart-line text-slate-700 text-[10px]"></i>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'Latency', val: '42ms', color: 'text-green-500' },
                                { label: 'PacketLoss', val: '0.00%', color: 'text-green-500' },
                                { label: 'FreqRange', val: '12khz', color: 'text-cyan-500' },
                                { label: 'Confidence', val: '98.4%', color: 'text-cyan-500' }
                            ].map(stat => (
                                <div key={stat.label} className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                                    <div className="text-[8px] text-slate-600 uppercase font-mono">{stat.label}</div>
                                    <div className={`text-[11px] font-mono ${stat.color}`}>{stat.val}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
                        <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/30">
                            <span className="text-[10px] font-mono uppercase text-slate-500 tracking-tighter">Event Logs</span>
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-800"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-800"></div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth scrollbar-hide">
                            {transcripts.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
                                    <i className="fas fa-terminal text-2xl mb-2"></i>
                                    <p className="text-[8px] font-mono uppercase">Listening for handshake...</p>
                                </div>
                            )}
                            {transcripts.map((t, i) => (
                                <div key={i} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[95%] p-2 rounded-lg text-[11px] font-mono leading-relaxed border ${t.role === 'user'
                                        ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-100 rounded-tr-none'
                                        : 'bg-slate-800/50 border-slate-700 text-slate-300 rounded-tl-none'
                                        }`}>
                                        <span className="opacity-50 mr-1">{t.role === 'user' ? '>' : '#'}</span>
                                        {t.text || "..."}
                                        {!t.isFinal && <span className="inline-block w-1.5 h-3 bg-cyan-500 ml-1 animate-pulse align-middle"></span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
            {error && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-900/80 border border-red-500/50 rounded-lg text-red-200 text-[10px] font-mono flex items-center gap-2">
                    <i className="fas fa-circle-exclamation text-red-500"></i>
                    {error}
                </div>
            )}
            {/* --- END OF UNCHANGED JSX --- */}
        </div>
    );
};

export default VoiceAssistant;