# LivoSpeak AI — Pronunciation Coaching Frontend Web App

This is the Next.js frontend application for **LivoSpeak AI** — a premium, clean dark-mode speech coaching platform that provides real-time pronunciation feedback, interactive transcripts, and aggregate progress statistics.

---

## ✨ Features

*   **🎙️ Live Microphone Recorder & Uploader**: Record audio directly in-browser or upload WAV/WebM/MP3 clips. Supports timers and visual waveforms.
*   **📊 Interactive Analytics Dashboard**: Renders comprehensive visual metrics for **Pronunciation**, **Fluency**, **Clarity**, and **Overall Speech Quality**.
*   **🔤 Interactive Transcripts**: Displays your spoken words side-by-side with color-coded confidence levels. Click on any word to hear standard pronunciation or view its phonetics (IPA).
*   **💡 AI-Generated Practice Modules**: Provides personalized syllable breakdowns, tongue twisters, and 5-minute daily practice plans tailored to your specific pronunciation mistakes.
*   **📈 MongoDB Progress Metrics**: Automatically aggregates historical speaking runs to show average WPM, expert articulation level badges, and speech progress improvement indicators.
*   **🔒 Privacy-First Compliance**: Integrates lock-badges and explicit deletion features, allowing users to wipe individual records from the MongoDB backend (in compliance with India's DPDP Act 2023).

---

## 🛠️ Tech Stack

*   **Framework**: Next.js 15+ (App Router)
*   **Styling**: Tailwind CSS & Vanilla CSS (with glassmorphic overlay configurations)
*   **Icons**: Lucide React
*   **Compilation Engine**: Turbopack

---

## 📦 Installation & Setup

1.  **Navigate to the frontend directory**:
    ```bash
    cd frontend
    ```

2.  **Install project dependencies**:
    ```bash
    npm install
    ```

3.  **Configure environment variables**:
    Create a file named `.env.local` (or configure your shell environment):
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:8000
    ```

---

## 🚦 Script Commands

To run the application in the development environment:

```bash
npm run dev
```

To build a production-optimized package:

```bash
npm run build
```

To run the built production package locally:

```bash
npm start
```

To run lint checks on TypeScript and TSX:

```bash
npm run lint
```
