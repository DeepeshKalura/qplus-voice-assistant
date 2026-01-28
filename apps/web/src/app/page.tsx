import { VoiceBot } from '@/components/VoiceBot';
import { VoiceBotProvider } from '@/components/VoiceBotProvider';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white overflow-hidden relative selection:bg-blue-500/30">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute -top-1/2 -left-1/2 w-[1000px] h-[1000px] bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-[1000px] h-[1000px] bg-purple-500/20 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 container mx-auto px-4 h-screen flex flex-col items-center justify-center">
        <div className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 mb-4 tracking-tight">
            QPlus Voice
          </h1>
          <p className="text-lg text-gray-400 font-light">
            Advanced Real-Time Voice Assistant
          </p>
        </div>

        <VoiceBotProvider>
          <VoiceBot />
        </VoiceBotProvider>

        <div className="mt-8 text-xs text-gray-500 font-mono">
          Powered by LiveKit • Groq Llama 3.1 • Whisper V3
        </div>
      </div>
    </main>
  );
}