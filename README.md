# QPlus Voice Assistant

> **Technical Assessment Submission: Real-Time Audio**
> **Role:** Systems Engineer @ Quantum Strides

## 1. Overview
QPlus is a lightweight, serverless (client-side) voice assistant designed for low-latency (<1.2s) interaction. It listens for the wake word "Hey Qplus", streams audio to Gemini Flash 2.0 (via WebSocket), and plays back synthesized response audio in real-time.

**Key Features:**
- **Zero-Latency Architecture:** Pure client-side DSP for wake word detection.
- **Real-Time Streaming:** Bi-directional binary WebSocket interaction with Gemini Flash 2.0.
- **Resilient State Management:** robust handling of connection drops, race conditions, and audio context states.
- **Visual Feedback:** Real-time audio frequency visualization and state indicators.

## 2. Prerequisites
- **Node.js** 18+
- **pnpm** (preferred) or npm
- **Google Gemini API Key** (with access to Gemini 2.0 Flash)

## 3. Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/DeepeshKalura/qplus-voice-assistant
    cd qplus-voice-assistant
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Environment Configuration:**
    Create a `.env` file in the root directory:
    ```env
    NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
    ```

4.  **Run Development Server:**
    ```bash
    pnpm dev
    ```

5.  **Access the Application:**
    Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge (required for Web Speech API support).

## 4. Usage Guide
1.  Click **"BOOT UP"** to initialize the audio context (requires user gesture).
2.  Grant **Microphone Permissions** when prompted.
3.  Say **"Hey Qplus"** clearly.
4.  The system will beep/visualize "ACCEPTED" and start listening.
5.  Ask a question (e.g., *"What is QPlus?"*).
6.  The assistant will respond audibly.

## 5. Architecture
See [HLD.md](./HLD.md) for the detailed High-Level Design and Architecture Diagram.

## 6. Technology Stack
-   **Framework:** Next.js 15 (App Router)
-   **Language:** TypeScript
-   **Styling:** Tailwind CSS
-   **LLM / Speech:** Google Gemini 2.0 Flash (Multimodal Live API)
-   **Client DSP:** Web Speech API (Wake Word) + Web Audio API (Visualization/Processing)

## 7. Latency Optimization Strategy
-   **16kHz Downsampling:** Reduces upload bandwidth by sending only necessary audio data.
-   **Optimistic UI:** Immediate visual feedback upon wake word detection (~0ms perceived latency).
-   **Stream Accumulation:** Audio chunks are played immediately as they arrive, rather than waiting for the full buffer.
-   **Local Wake Word:** No network request needed to trigger the "Listening" state.

---
*Built with ❤️ for Quantum Strides*
