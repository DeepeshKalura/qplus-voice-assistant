'use client';

import React, { useEffect, useRef } from 'react';
import { useVoiceBot } from './VoiceBotProvider';

export function VoiceBot() {
    const { state, send } = useVoiceBot();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const status = state.value;
    const isListening = status === 'listening';
    const isSpeaking = status === 'speaking';
    const isConnecting = status === 'connecting';
    const isError = status === 'error';

    // Simple visualizer
    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        let animId: number;
        const draw = () => {
            ctx.clearRect(0, 0, 300, 100);

            if (isListening || isSpeaking) {
                // Draw some bars
                ctx.fillStyle = isListening ? '#10b981' : '#3b82f6';
                for (let i = 0; i < 5; i++) {
                    const h = Math.random() * 50 + 20;
                    ctx.fillRect(50 + i * 40, 50 - h / 2, 20, h);
                }
            } else {
                // Idle
                ctx.fillStyle = '#6b7280';
                ctx.beginPath();
                ctx.arc(150, 50, 10, 0, Math.PI * 2);
                ctx.fill();
            }

            animId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animId);
    }, [isListening, isSpeaking]);

    return (
        <div className="flex flex-col items-center justify-center p-8 bg-black/50 rounded-2xl backdrop-blur-md border border-white/10 w-full max-w-md">
            <div className="mb-6 relative">
                <canvas
                    ref={canvasRef}
                    width={300}
                    height={100}
                    className="rounded-lg bg-black/20"
                />
                <div className={`absolute top-2 right-2 flex items-center gap-2 px-2 py-1 rounded-full text-xs font-bold ${isError ? 'bg-red-500/20 text-red-400' :
                        isConnecting ? 'bg-yellow-500/20 text-yellow-400' :
                            isListening ? 'bg-emerald-500/20 text-emerald-400' :
                                'bg-white/10 text-gray-400'
                    }`}>
                    <div className={`w-2 h-2 rounded-full ${isError ? 'bg-red-500' :
                            isConnecting ? 'bg-yellow-500 animate-pulse' :
                                isListening ? 'bg-emerald-500 animate-pulse' :
                                    'bg-gray-500'
                        }`} />
                    {typeof status === 'string' ? status.toUpperCase() : 'UNKNOWN'}
                </div>
            </div>

            <div className="flex gap-4 w-full">
                {status === 'idle' || isError ? (
                    <button
                        onClick={() => send({ type: 'CONNECT' })}
                        className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 active:scale-95"
                    >
                        {isError ? 'Retry Connection' : 'Start Session'}
                    </button>
                ) : (
                    <button
                        onClick={() => send({ type: 'DISCONNECT' })}
                        className="flex-1 py-3 px-6 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-red-500/20 active:scale-95"
                    >
                        End Session
                    </button>
                )}
            </div>

            {state.context.error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm w-full text-center">
                    {state.context.error}
                </div>
            )}

            {state.context.transcript.length > 0 && (
                <div className="mt-6 w-full max-h-48 overflow-y-auto space-y-2 p-2 rounded-lg bg-white/5 border border-white/5">
                    {state.context.transcript.slice(-3).map((line: string, i: number) => (
                        <p key={i} className="text-gray-300 text-sm font-mono border-l-2 border-blue-500/50 pl-2">
                            {line}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}
