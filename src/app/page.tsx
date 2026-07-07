"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  UploadCloud, 
  CheckCircle, 
  AlertCircle, 
  RotateCcw, 
  Info, 
  Sparkles, 
  Clock, 
  Activity, 
  FileText, 
  Volume2, 
  Lock, 
  BookOpen, 
  Award, 
  ArrowRight, 
  Check,
  Languages,
  ChevronRight,
  TrendingUp,
  FileCheck,
  Trash2
} from "lucide-react";

// API Endpoint configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://livospeak-backend.onrender.com";

interface WordDetail {
  word: string;
  start: number;
  end: number;
  confidence: number;
  is_mistake: boolean;
}

interface MistakeDetail {
  word: string;
  issue: string;
  expected_pronunciation: string;
  why_it_matters: string;
  practice: string[];
}

export default function Home() {
  // App views: 'landing' | 'upload' | 'loading' | 'dashboard'
  const [step, setStep] = useState<"landing" | "upload" | "loading" | "dashboard">("landing");
  const [loadingMessage, setLoadingMessage] = useState("Initializing file upload...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Recording state
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "stopped">("idle");
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Analysis result
  const [result, setResult] = useState<any>(null);
  const [selectedWord, setSelectedWord] = useState<any>(null);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const [practiceChecked, setPracticeChecked] = useState<Record<string, boolean>>({});

  // Audio Playback references
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const wordPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History state
  const [history, setHistory] = useState<any[]>([]);

  // Load history list from backend
  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };
  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the detail card
    if (!confirm("Are you sure you want to delete this speaking record from your history?")) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/history/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchHistory();
      } else {
        alert("Failed to delete record.");
      }
    } catch (err) {
      console.error("Error deleting history item:", err);
      alert("Could not connect to server to delete record.");
    }
  };
  useEffect(() => {
    fetchHistory();
  }, []);

  const selectHistoryItem = async (id: string) => {
    setStep("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/history/${id}`);
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        
        // Auto select first mistake if available
        if (data.mistakes && data.mistakes.length > 0) {
          const firstMistake = data.mistakes[0];
          const wordInfo = data.words.find((w: any) => w.word.toLowerCase().replace(/[.,!?;:"]/g, "") === firstMistake.word.toLowerCase());
          setSelectedWord(wordInfo ? { ...wordInfo, ...firstMistake } : firstMistake);
        } else if (data.words && data.words.length > 0) {
          setSelectedWord(data.words[0]);
        }

        // Initialize practice checkboxes
        const checks: Record<string, boolean> = {};
        data.practice_plan.practice_words.forEach((w: string) => {
          checks[`word-${w}`] = false;
        });
        data.practice_plan.practice_sentences.forEach((s: string, idx: number) => {
          checks[`sentence-${idx}`] = false;
        });
        data.practice_plan.tongue_twisters.forEach((t: string, idx: number) => {
          checks[`twister-${idx}`] = false;
        });
        setPracticeChecked(checks);

        // Clear audio file & URL since we are viewing historical run
        setAudioFile(null);
        setAudioUrl(null);
        setStep("dashboard");
      } else {
        setErrorMessage("Failed to load historical record details.");
        setStep("landing");
      }
    } catch (err) {
      console.error("Error fetching history detail:", err);
      setErrorMessage("Could not connect to server to fetch historical record.");
      setStep("landing");
    }
  };

  // Dynamic loading messages list
  const loadingMessages = [
    "Uploading audio payload to secure container...",
    "Validating audio format, size, and duration via FFmpeg...",
    "Converting audio speech-to-text with Groq Whisper...",
    "Extracting phonetic timestamps and confidence scores...",
    "Orchestrating LLM speech analysis...",
    "Generating structural IPA pronunciation patterns...",
    "Assembling customized coaching advice and 5-minute practice plans..."
  ];

  // Rotate loading messages
  useEffect(() => {
    let msgIndex = 0;
    let interval: NodeJS.Timeout;

    if (step === "loading") {
      setLoadingMessage(loadingMessages[0]);
      interval = setInterval(() => {
        msgIndex = (msgIndex + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[msgIndex]);
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step]);

  // Clean up audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (wordPlayTimeoutRef.current) {
        clearTimeout(wordPlayTimeoutRef.current);
      }
    };
  }, [audioUrl]);

  // Recording Timer effect
  useEffect(() => {
    if (recordingState === "recording") {
      recordingTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= 60) {
            // Force stop at 60 seconds
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [recordingState]);

  // Start Mic Recording
  const startRecording = async () => {
    setErrorMessage(null);
    audioChunksRef.current = [];
    setRecordDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Determine supported MIME type
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("webm") ? "webm" : "ogg";
        const file = new File([audioBlob], `mic_recording.${ext}`, { type: mimeType });
        
        setAudioFile(file);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // Terminate mic stream tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250); // Slice chunks every 250ms
      setRecordingState("recording");
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      setErrorMessage("Could not access microphone. Please check site permissions.");
    }
  };

  // Stop Mic Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      mediaRecorderRef.current.stop();
      setRecordingState("stopped");
    }
  };

  // Handle Drag & Drop / File Upload
  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    const validExtensions = [".mp3", ".wav", ".m4a", ".webm", ".ogg"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!validExtensions.includes(ext)) {
      setErrorMessage("Unsupported file type. Please upload MP3, WAV, or M4A.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("File exceeds 15MB size limit.");
      return;
    }

    // Verify audio duration in browser
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.addEventListener("loadedmetadata", () => {
      const duration = audio.duration;
      if (duration < 1.0 || duration > 60.0) {
        setErrorMessage(`Audio duration must be between 1 and 60 seconds. (Your file: ${duration.toFixed(1)}s)`);
        setAudioFile(null);
        setAudioUrl(null);
      } else {
        setAudioFile(file);
        setAudioUrl(URL.createObjectURL(file));
      }
    });
  };

  // Process & Upload to Backend
  const analyzeAudioPayload = async () => {
    if (!audioFile) return;

    setStep("loading");
    setUploadProgress(15);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", audioFile);

    try {
      setUploadProgress(45);
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      setUploadProgress(85);

      if (!response.ok) {
        const errorData = await response.json();
        setErrorMessage(errorData.detail || "Audio analysis failed.");
        setStep("upload");
        return;
      }

      const data = await response.json();
      setResult(data);
      
      // Auto select first mistake if available
      if (data.mistakes && data.mistakes.length > 0) {
        const firstMistake = data.mistakes[0];
        // Match it with the corresponding word from word list
        const wordInfo = data.words.find((w: any) => w.word.toLowerCase().replace(/[.,!?;:"]/g, "") === firstMistake.word.toLowerCase());
        setSelectedWord(wordInfo ? { ...wordInfo, ...firstMistake } : firstMistake);
      } else if (data.words && data.words.length > 0) {
        setSelectedWord(data.words[0]);
      }

      // Initialize practice checkboxes
      const checks: Record<string, boolean> = {};
      data.practice_plan.practice_words.forEach((w: string) => {
        checks[`word-${w}`] = false;
      });
      data.practice_plan.practice_sentences.forEach((s: string, idx: number) => {
        checks[`sentence-${idx}`] = false;
      });
      data.practice_plan.tongue_twisters.forEach((t: string, idx: number) => {
        checks[`twister-${idx}`] = false;
      });
      setPracticeChecked(checks);

      setUploadProgress(100);
      setStep("dashboard");
      fetchHistory();
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMessage(err.message || "Something went wrong during speech processing. Please check backend connection.");
      setStep("upload");
    }
  };

  // Play full audio
  const toggleFullAudio = () => {
    if (!audioPlaybackRef.current) return;

    if (isAudioPlaying) {
      audioPlaybackRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      // Clear any word play timeout
      if (wordPlayTimeoutRef.current) {
        clearTimeout(wordPlayTimeoutRef.current);
      }
      audioPlaybackRef.current.play();
      setIsAudioPlaying(true);
    }
  };

  // Play exact segment of a word (Client-side slicing)
  const playWordAudioSegment = (word: WordDetail, index: number) => {
    if (!audioPlaybackRef.current) return;
    
    // Clear existing timeout
    if (wordPlayTimeoutRef.current) {
      clearTimeout(wordPlayTimeoutRef.current);
    }

    const duration = (word.end - word.start) * 1000;
    
    // Set active playing state
    audioPlaybackRef.current.pause();
    audioPlaybackRef.current.currentTime = Math.max(0, word.start - 0.05); // slight padding
    audioPlaybackRef.current.play();
    
    setIsAudioPlaying(true);
    setActiveWordIndex(index);
    setPlayingWordId(`${word.word}-${index}`);

    wordPlayTimeoutRef.current = setTimeout(() => {
      if (audioPlaybackRef.current) {
        audioPlaybackRef.current.pause();
        setIsAudioPlaying(false);
        setActiveWordIndex(null);
        setPlayingWordId(null);
      }
    }, duration + 150); // slight tail padding
  };

  // Select a word token in the transcript
  const handleWordClick = (word: WordDetail, index: number) => {
    // Find if this word matches any mistake object from backend
    const cleanWord = word.word.toLowerCase().replace(/[.,!?;:"]/g, "");
    const matchedMistake = result.mistakes.find(
      (m: MistakeDetail) => m.word.toLowerCase() === cleanWord
    );

    if (matchedMistake) {
      setSelectedWord({ ...word, ...matchedMistake });
    } else {
      setSelectedWord(word);
    }

    playWordAudioSegment(word, index);
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/5";
    if (score >= 70) return "text-indigo-400 border-indigo-500/30 bg-indigo-500/5";
    return "text-rose-400 border-rose-500/30 bg-rose-500/5";
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 85) return "stroke-emerald-400";
    if (score >= 70) return "stroke-indigo-500";
    return "stroke-rose-500";
  };

  const handleReset = () => {
    setAudioFile(null);
    setAudioUrl(null);
    setResult(null);
    setSelectedWord(null);
    setRecordDuration(0);
    setRecordingState("idle");
    setStep("upload");
  };

  return (
    <div className="flex-1 bg-[#09090b] text-zinc-100 flex flex-col relative overflow-hidden">
      {/* Background Ambience Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none animate-pulse-glow" style={{ animationDelay: "-2s" }} />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between border-b border-zinc-800/80 z-10">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setStep("landing")}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Languages className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-violet-400 to-indigo-200 bg-clip-text text-transparent">LivoSpeak AI</span>
            <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">MVP 1.0</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {history && history.length > 0 && (
            <button 
              onClick={() => {
                setStep("landing");
                setTimeout(() => {
                  document.getElementById("history-section")?.scrollIntoView({ behavior: "smooth" });
                }, 100);
              }}
              className="text-zinc-400 hover:text-zinc-200 transition flex items-center gap-1.5 text-xs font-semibold mr-2 border-r border-zinc-800 pr-4"
            >
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              History ({history.length})
            </button>
          )}
          <div className="hidden md:flex items-center gap-2 text-zinc-400">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span>DPDP Compliant & Privacy First</span>
          </div>
          {step === "dashboard" && (
            <button 
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition flex items-center gap-2 border border-zinc-700/60"
            >
              <RotateCcw className="w-4 h-4" />
              Practice Again
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col justify-center z-10">
        
        {/* STEP 1: Landing Page */}
        {step === "landing" && (
          <div className="max-w-4xl mx-auto text-center py-8 md:py-16 space-y-10">
            {/* Tagline / Alert */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/5 border border-violet-500/20 text-violet-300 text-xs font-semibold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
              Empowered English Speaking
            </div>

            {/* Hero Heading */}
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
                Evaluate & Perfect Your <br />
                <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-indigo-300 bg-clip-text text-transparent">
                  English Pronunciation
                </span>
              </h1>
              <p className="max-w-2xl mx-auto text-zinc-400 text-base md:text-lg font-light leading-relaxed">
                Record or upload 1–60 seconds of speech. Our AI analyzes your articulation, fluency, and clarity, providing an interactive transcript with word-by-word feedback and a custom practice plan.
              </p>
            </div>

            {/* Call to Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => setStep("upload")}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold transition duration-300 shadow-xl shadow-violet-500/10 flex items-center justify-center gap-2 hover:scale-[1.02]"
              >
                <span>Launch Speech Coach</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <a 
                href="#features" 
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold border border-zinc-800 transition duration-300 flex items-center justify-center"
              >
                How It Works
              </a>
            </div>

            {/* Core Feature Grid */}
            <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 text-left">
              <div className="glass-panel glass-panel-hover p-6 rounded-2xl transition duration-300">
                <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 flex items-center justify-center mb-4">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg text-zinc-200 mb-2">Word-Level Accuracy</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Pinpoint exact mispronounced words with Whisper confidence scores. Tap any word to play its precise audio slice.
                </p>
              </div>

              <div className="glass-panel glass-panel-hover p-6 rounded-2xl transition duration-300">
                <div className="w-12 h-12 rounded-xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 flex items-center justify-center mb-4">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg text-zinc-200 mb-2">IPA & "Explain Why"</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Don't just get scored. Understand the linguistics with syllable breakdowns, IPA transcription, and concrete advice on why it matters.
                </p>
              </div>

              <div className="glass-panel glass-panel-hover p-6 rounded-2xl transition duration-300">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg text-zinc-200 mb-2">5-Minute Practice Plan</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Walk away with an actionable study list: recommended practice words, contextual sentences, tongue twisters, and daily exercises.
                </p>
              </div>
            </div>

            {/* Privacy Compliance Banner */}
            <div className="max-w-2xl mx-auto p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-start gap-3 text-left text-xs text-zinc-400">
              <Lock className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-zinc-200 block mb-0.5">Privacy Notice (DPDP Compliant)</span>
                We value your speech privacy. Your audio recording is parsed in-memory, transferred securely over HTTPS, and immediately deleted from backend servers after processing. No audio files or personal data are stored permanently.
              </div>
            </div>

            {/* Previous Analyses (MongoDB History) */}
            {history && history.length > 0 && (
              <div id="history-section" className="w-full max-w-4xl mx-auto pt-12 space-y-6 text-left border-t border-zinc-800/60">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-zinc-200 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-violet-400" />
                      Previous Speaking Sessions
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Click on any past session to load its pronunciation dashboard.</p>
                  </div>
                  <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded font-mono font-semibold shrink-0">
                    MongoDB History Connected
                  </span>
                </div>

                {/* Creative Analytics Dashboard Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-2">
                  <div className="glass-panel p-4 rounded-xl border border-zinc-800/80 flex flex-col justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Overall Fluency & Pacing</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-black text-white">
                        {Math.round(history.reduce((sum, item) => sum + (item.speech_rate?.wpm || 0), 0) / history.length)}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">Avg WPM</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 mt-2 block">
                      Target speaking range is 110–145 WPM.
                    </span>
                  </div>

                  <div className="glass-panel p-4 rounded-xl border border-zinc-800/80 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-2 right-2">
                      <Award className="w-4 h-4 text-violet-400" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Average Coaching Score</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-black text-violet-400">
                        {Math.round(history.reduce((sum, item) => sum + (item.scores?.overall || 0), 0) / history.length)}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">/ 99 Pts</span>
                    </div>
                    <span className="text-[11px] text-zinc-300 font-semibold mt-2 block">
                      {(() => {
                        const avg = Math.round(history.reduce((sum, item) => sum + (item.scores?.overall || 0), 0) / history.length);
                        if (avg >= 85) return "🏆 Expert Articulation";
                        if (avg >= 70) return "💪 Intermediate Fluency";
                        return "📈 Developing Pronunciation";
                      })()}
                    </span>
                  </div>

                  <div className="glass-panel p-4 rounded-xl border border-zinc-800/80 flex flex-col justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Speaking Progress</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-black text-white">{history.length}</span>
                      <span className="text-xs text-zinc-400 font-medium">Practice Runs</span>
                    </div>
                    <div className="mt-2">
                      {history.length > 1 ? (
                        (() => {
                          const diff = (history[0]?.scores?.overall || 0) - (history[history.length - 1]?.scores?.overall || 0);
                          if (diff > 0) {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                                <TrendingUp className="w-3 h-3 animate-bounce" />
                                +{diff} Pts overall improvement!
                              </span>
                            );
                          } else if (diff < 0) {
                            return (
                              <span className="text-[11px] text-zinc-400">
                                Practice regularly to raise your scores!
                              </span>
                            );
                          } else {
                            return (
                              <span className="text-[11px] text-zinc-400">
                                Consistent progress tracked.
                              </span>
                            );
                          }
                        })()
                      ) : (
                        <span className="text-[11px] text-zinc-500">Record another session to trace progress.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.map((item) => (
                    <div 
                      key={item.id} 
                      onClick={() => selectHistoryItem(item.id)}
                      className="glass-panel glass-panel-hover p-5 rounded-2xl cursor-pointer transition border border-zinc-800/80 flex flex-col justify-between space-y-3 hover:scale-[1.01] hover:border-violet-500/30"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 min-w-0">
                          <span className="text-[10px] text-zinc-500 font-medium font-mono block">
                            {item.timestamp ? new Date(item.timestamp).toLocaleString(undefined, {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                            }) : "Recent Session"}
                          </span>
                          <p className="text-xs text-zinc-400 line-clamp-2 italic pr-2">
                            "{item.transcript}"
                          </p>
                        </div>
                        {item.scores && (
                          <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold shrink-0 text-center flex flex-col items-center justify-center min-w-[50px] ${getScoreColor(item.scores.overall)}`}>
                            <span className="text-lg tracking-tighter leading-none">{item.scores.overall}</span>
                            <span className="text-[8px] uppercase tracking-wider text-zinc-400 font-extrabold mt-0.5">Pts</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/40">
                        <div className="flex gap-3">
                          <span>Speed: <strong className="text-zinc-300">{item.speech_rate?.wpm || 0} WPM</strong></span>
                          <span>Length: <strong className="text-zinc-300">{item.duration?.toFixed(1) || 0}s</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => deleteHistoryItem(item.id, e)}
                            className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition flex items-center justify-center"
                            title="Delete Session History"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-violet-400 font-semibold flex items-center gap-0.5 hover:text-violet-300 text-xs">
                            View details <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Audio Upload / Record Page */}
        {step === "upload" && (
          <div className="max-w-3xl mx-auto w-full space-y-8">
            <button 
              onClick={() => setStep("landing")}
              className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
            >
              &larr; Back to home
            </button>

            <div className="text-center space-y-3 flex flex-col items-center">
              <h2 className="text-3xl font-extrabold tracking-tight">Record or Upload Your Speech</h2>
              <p className="text-zinc-400 text-sm">Provide an English speech sample between 1 and 60 seconds long.</p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                <Lock className="w-3.5 h-3.5" />
                Do not worry, we do not store your audio!
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Option A: Microphone Recorder */}
              <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden border border-zinc-800/80">
                <div className="absolute top-0 right-0 p-3">
                  <span className="text-[10px] uppercase font-bold text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full border border-violet-400/20">Mic Record</span>
                </div>

                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center relative">
                  {recordingState === "recording" && (
                    <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
                  )}
                  <Mic className={`w-8 h-8 ${recordingState === "recording" ? "text-rose-500" : "text-zinc-400"}`} />
                </div>

                {recordingState === "idle" && (
                  <div className="space-y-4 w-full">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-zinc-200">Browser Microphone</h4>
                      <p className="text-zinc-400 text-xs px-4">Speak clearly at a moderate pace. Try talking about your hobbies or read a short text.</p>
                    </div>
                    <button 
                      onClick={startRecording}
                      className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition duration-200 shadow-lg shadow-violet-600/15 w-full flex items-center justify-center gap-2"
                    >
                      <Mic className="w-4 h-4" />
                      Start Recording
                    </button>
                  </div>
                )}

                {recordingState === "recording" && (
                  <div className="space-y-5 w-full">
                    <div className="space-y-1">
                      {/* Timer Display */}
                      <div className="text-3xl font-mono font-black text-rose-500">
                        00:{recordDuration.toString().padStart(2, "0")}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {recordDuration < 30 
                          ? `Keep speaking! Need at least 30s (${30 - recordDuration}s remaining)`
                          : "Optimal length! Stop recording whenever you are done (max 45s)"}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                      <div 
                        className={`h-full transition-all duration-1000 ${recordDuration >= 30 ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ width: `${(recordDuration / 45) * 100}%` }}
                      />
                    </div>

                    <button 
                      onClick={stopRecording}
                      className="px-6 py-3 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold transition duration-200 w-full flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Square className="w-4 h-4 fill-zinc-950 text-zinc-950" />
                      Stop Recording
                    </button>
                  </div>
                )}

                {recordingState === "stopped" && (
                  <div className="space-y-4 w-full">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-4 h-4" />
                        Recording Saved
                      </h4>
                      <p className="text-zinc-400 text-xs">Length: {recordDuration} seconds</p>
                    </div>

                    {audioUrl && (
                      <audio src={audioUrl} controls className="w-full h-10 border border-zinc-800 rounded bg-zinc-950" />
                    )}

                    <div className="flex gap-3">
                      <button 
                        onClick={startRecording}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition text-xs border border-zinc-700/60"
                      >
                        Re-record
                      </button>
                      <button 
                        onClick={analyzeAudioPayload}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold transition text-xs shadow-lg shadow-violet-500/10 flex items-center justify-center gap-1"
                      >
                        Analyze Speech &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Option B: Audio File Uploader */}
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileChange(e.dataTransfer.files[0]);
                  }
                }}
                className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center space-y-6 relative border border-zinc-800/80 cursor-pointer hover:border-violet-500/30 transition duration-300"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="absolute top-0 right-0 p-3">
                  <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-full border border-indigo-400/20">File Upload</span>
                </div>

                <input 
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".mp3,.wav,.m4a,.webm,.ogg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                />

                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <UploadCloud className="w-8 h-8 text-zinc-400" />
                </div>

                {!audioFile ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-semibold text-zinc-200">Drag & Drop Audio</h4>
                      <p className="text-zinc-400 text-xs px-2">Supported formats: <strong className="text-zinc-300">MP3, WAV, M4A</strong>.</p>
                      <p className="text-zinc-500 text-[10px]">Audio must be strictly between 1 and 60 seconds.</p>
                    </div>
                    <span className="inline-block text-xs font-semibold text-violet-400 hover:text-violet-300 underline">
                      Browse Files
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4 w-full" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-1 text-center">
                      <h4 className="font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                        <FileCheck className="w-4 h-4" />
                        File Selected
                      </h4>
                      <p className="text-zinc-300 text-xs font-mono truncate max-w-[200px] mx-auto">{audioFile.name}</p>
                      <p className="text-zinc-500 text-[10px]">{(audioFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>

                    {audioUrl && (
                      <audio src={audioUrl} controls className="w-full h-10 border border-zinc-800 rounded bg-zinc-950" />
                    )}

                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          setAudioFile(null);
                          setAudioUrl(null);
                        }}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition text-xs border border-zinc-700/60"
                      >
                        Remove
                      </button>
                      <button 
                        onClick={analyzeAudioPayload}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold transition text-xs shadow-lg shadow-violet-500/10 flex items-center justify-center gap-1"
                      >
                        Analyze Speech &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Validation Error:</span> {errorMessage}
                </div>
              </div>
            )}

            {/* Bottom Security Banner */}
            <div className="text-center text-xs text-zinc-500 flex items-center justify-center gap-2 pt-4">
              <Lock className="w-3.5 h-3.5 text-zinc-600" />
              <span>Compliant with DPDP rules: files processed in memory and cleaned automatically.</span>
            </div>
          </div>
        )}

        {/* STEP 3: Loading Page */}
        {step === "loading" && (
          <div className="max-w-md mx-auto text-center py-16 space-y-8">
            <div className="relative w-24 h-24 mx-auto">
              {/* Outer spinning ring */}
              <div className="absolute inset-0 rounded-full border-4 border-zinc-800 border-t-violet-500 animate-spin" />
              {/* Inner glowing pulse */}
              <div className="absolute inset-4 rounded-full bg-violet-600/20 animate-pulse flex items-center justify-center">
                <Languages className="w-8 h-8 text-violet-400 animate-bounce" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold">Analyzing Your Pronunciation...</h3>
              <p className="text-zinc-400 text-sm font-medium animate-pulse h-10 px-4">
                {loadingMessage}
              </p>
            </div>

            {/* Progress Bar simulation */}
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800/80">
              <div 
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            
            <p className="text-[10px] text-zinc-500 italic">This usually takes around 10-15 seconds. Thank you for your patience.</p>
          </div>
        )}

        {/* STEP 4: Results Dashboard */}
        {step === "dashboard" && result && (
          <div className="space-y-8">
            
            {/* Top Row: Overall Score & Metadata Header */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Overall Score Circle (lg: col-span-1) */}
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800/80 flex flex-col items-center justify-center text-center space-y-4 relative">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-zinc-400">Overall Score</h3>
                
                {/* SVG Progress Circle */}
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full transform -rotate-95" viewBox="0 0 100 100">
                    {/* Background Circle */}
                    <circle 
                      cx="50" cy="50" r="40" 
                      className="stroke-zinc-800 fill-none" 
                      strokeWidth="8"
                    />
                    {/* Foreground Score Ring */}
                    <circle 
                      cx="50" cy="50" r="40" 
                      className={`fill-none transition-all duration-1000 ${getScoreRingColor(result.scores.overall)}`}
                      strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - result.scores.overall / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  {/* Floating Centered Score */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black tracking-tight">{result.scores.overall}</span>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Points</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getScoreColor(result.scores.overall)}`}>
                    {result.scores.overall >= 85 ? "Excellent Speaker" : result.scores.overall >= 70 ? "Competent" : "Needs Practice"}
                  </span>
                  <p className="text-[10px] text-zinc-500 pt-1">Audio duration: {result.duration.toFixed(1)}s</p>
                </div>
              </div>

              {/* Sub-Category Scores (lg: col-span-3) */}
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800/80 lg:col-span-3 flex flex-col justify-between space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                  <h3 className="font-extrabold text-sm tracking-tight text-zinc-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-violet-400" />
                    Speech Analytics Breakdown
                  </h3>
                  
                  {/* Speech Rate metrics badge */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500">Speaking Rate:</span>
                    <span className="font-bold text-zinc-200">{result.speech_rate.wpm} WPM</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      result.speech_rate.label === "Normal" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}>
                      {result.speech_rate.label} Speed
                    </span>
                  </div>
                </div>

                {/* Score bar meters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {/* Pronunciation */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Pronunciation Accuracy
                        <span title="Measures phoneme accuracy compared to standardized models.">
                          <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                        </span>
                      </span>
                      <span className="text-zinc-200">{result.scores.pronunciation}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                      <div className="h-full bg-violet-500" style={{ width: `${result.scores.pronunciation}%` }} />
                    </div>
                  </div>

                  {/* Fluency */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Speech Fluency
                        <span title="Evaluates pacing, hesitation periods, and long silent gaps.">
                          <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                        </span>
                      </span>
                      <span className="text-zinc-200">{result.scores.fluency}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                      <div className="h-full bg-fuchsia-500" style={{ width: `${result.scores.fluency}%` }} />
                    </div>
                  </div>

                  {/* Clarity */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Speech Clarity
                        <span title="Intelligibility score based on vocalization precision.">
                          <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                        </span>
                      </span>
                      <span className="text-zinc-200">{result.scores.clarity}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                      <div className="h-full bg-indigo-500" style={{ width: `${result.scores.clarity}%` }} />
                    </div>
                  </div>

                  {/* Whisper confidence */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        AI Model Confidence
                        <span title="The mean confidence level of the transcription model.">
                          <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                        </span>
                      </span>
                      <span className="text-zinc-200">{result.scores.confidence}%</span>
                    </div>
                    <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                      <div className="h-full bg-emerald-500" style={{ width: `${result.scores.confidence}%` }} />
                    </div>
                  </div>
                </div>

                {/* Local playback controls */}
                <div className="bg-zinc-900/60 rounded-xl p-3.5 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="text-xs text-zinc-400 font-medium">Listen back to your recording and click words in transcript below to inspect details:</span>
                  </div>
                  {audioUrl && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <audio 
                        ref={audioPlaybackRef} 
                        src={audioUrl} 
                        onEnded={() => setIsAudioPlaying(false)}
                        onPause={() => setIsAudioPlaying(false)}
                        onPlay={() => setIsAudioPlaying(true)}
                        className="hidden" 
                      />
                      <button 
                        onClick={toggleFullAudio}
                        className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow shadow-violet-600/10 w-full sm:w-auto justify-center"
                      >
                        {isAudioPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5 fill-white text-white" />
                            Pause Full Recording
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-white text-white" />
                            Play Full Recording
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Middle Row: Interactive Transcript & "Explain Why" Detail Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Interactive Transcript (lg: col-span-2) */}
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800/80 lg:col-span-2 flex flex-col space-y-4">
                <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
                  <h3 className="font-extrabold text-sm tracking-tight text-zinc-300 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-violet-400" />
                    Interactive Speech Transcript
                  </h3>
                  <span className="text-[10px] text-zinc-500 font-medium italic">Click any word to hear yourself say it</span>
                </div>

                <div className="p-5 bg-zinc-950/40 rounded-xl border border-zinc-900 leading-relaxed text-zinc-300 text-base md:text-lg min-h-[160px] max-h-[280px] overflow-y-auto font-light selection:bg-violet-500/20">
                  {result.words.map((w: WordDetail, idx: number) => {
                    const isSelected = selectedWord && selectedWord.word === w.word && selectedWord.start === w.start;
                    const isPlaying = playingWordId === `${w.word}-${idx}`;
                    
                    return (
                      <span key={idx} className="inline-block mr-1.5 my-1">
                        <button
                          onClick={() => handleWordClick(w, idx)}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-all duration-150 relative ${
                            isPlaying
                              ? "bg-violet-500 text-white font-medium scale-105"
                              : isSelected
                              ? "bg-zinc-800 text-violet-300 border border-zinc-700"
                              : w.is_mistake
                              ? "wavy-underline text-rose-300 hover:bg-rose-500/10"
                              : "hover:bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {w.word}
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* Score legend */}
                <div className="flex flex-wrap items-center gap-4 pt-2 text-[10px] text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-rose-500 inline-block" /> Flagged pronunciation issues</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Selected word timing</span>
                </div>
              </div>

              {/* Explain Why details (lg: col-span-1) */}
              <div className="glass-panel p-6 rounded-2xl border border-violet-500/10 flex flex-col justify-between min-h-[300px] relative">
                {/* Accent glow on card border */}
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-500 to-indigo-400" />
                
                {selectedWord ? (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
                      <h4 className="font-extrabold text-xs uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Explain Why Pronunciation
                      </h4>
                      {typeof selectedWord.start === "number" && typeof selectedWord.end === "number" && (
                        <span className="text-[10px] bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50 font-mono">
                          {selectedWord.start.toFixed(1)}s - {selectedWord.end.toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {/* Word in big */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-black tracking-tight text-white">
                          {selectedWord.word.replace(/[.,!?;:"]/g, "")}
                        </span>
                        
                        {/* Word playback snippet */}
                        {typeof selectedWord.start === "number" && (
                          <button
                            onClick={() => {
                              // Find index of selected word to match playing state
                              const idx = result.words.findIndex((w: any) => w.word === selectedWord.word && w.start === selectedWord.start);
                              playWordAudioSegment(selectedWord, idx !== -1 ? idx : 0);
                            }}
                            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 border border-zinc-700/60 transition"
                            title="Listen to your pronunciation"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {selectedWord.expected_pronunciation ? (
                        <div className="text-sm font-mono text-zinc-400 font-bold bg-zinc-950 px-2.5 py-1 rounded w-fit border border-zinc-900">
                          {selectedWord.expected_pronunciation}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 italic">
                          Whisper model confidence: {(selectedWord.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>

                    {/* Explanations conditional rendering */}
                    {selectedWord.issue ? (
                      <div className="space-y-3.5 text-xs text-zinc-300 pt-2">
                        <div>
                          <span className="text-zinc-500 font-bold block mb-1">PROMPT ISSUE</span>
                          <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium block">
                            {selectedWord.issue}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 font-bold block mb-1">WHY IT MATTERS</span>
                          <p className="leading-relaxed text-zinc-400">{selectedWord.why_it_matters}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500 font-bold block mb-1">PRACTICE CLIPS</span>
                          <ul className="space-y-1 font-medium">
                            {selectedWord.practice?.map((item: string, idx: number) => (
                              <li key={idx} className="flex items-center gap-1.5 text-zinc-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                                "{item}"
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-400 space-y-4 pt-4">
                        <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-lg text-center">
                          This word was pronounced clearly and registered normal confidence scores. No major pronunciation issues flagged!
                        </div>
                        <div className="space-y-1">
                          <span className="text-zinc-500 font-bold block">CONFIDENCE METRIC</span>
                          <p className="leading-relaxed text-zinc-500">The transcription model correctly deciphered this term easily. Aim to speak other words with the same crisp clarity.</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                    <Info className="w-8 h-8 text-zinc-700" />
                    <p className="text-sm">Click any word in the transcript to open phonetic analysis & explanations.</p>
                  </div>
                )}

                <div className="text-[10px] text-zinc-600 mt-4 border-t border-zinc-800/60 pt-2">
                  LivoSpeak AI English Phonetic Analysis &copy; 2026
                </div>
              </div>
            </div>

            {/* Bottom Section: Coaching Feedback & 5-Minute Practice Plan */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* AI Coach Feedback Panel */}
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800/80 flex flex-col space-y-6">
                <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
                  <h3 className="font-extrabold text-sm tracking-tight text-zinc-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
                    Personalized AI Speaking Coach
                  </h3>
                  <span className="text-[10px] uppercase font-bold text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded border border-violet-400/20">Analysis</span>
                </div>

                <div className="space-y-5 text-sm">
                  {/* Strengths */}
                  <div className="space-y-1.5 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                    <span className="text-emerald-400 font-bold text-xs flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      KEY STRENGTHS
                    </span>
                    <p className="text-zinc-300 font-light leading-relaxed">{result.coaching.strengths}</p>
                  </div>

                  {/* Weaknesses */}
                  <div className="space-y-1.5 p-4 rounded-xl bg-rose-500/5 border border-rose-500/10">
                    <span className="text-rose-400 font-bold text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      AREAS TO IMPROVE
                    </span>
                    <p className="text-zinc-300 font-light leading-relaxed">{result.coaching.weaknesses}</p>
                  </div>

                  {/* Actionable Advice */}
                  <div className="space-y-1.5 p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
                    <span className="text-violet-400 font-bold text-xs flex items-center gap-1.5">
                      <Info className="w-4 h-4 shrink-0" />
                      CORE ACTIONABLE ADVICE
                    </span>
                    <p className="text-zinc-300 font-light leading-relaxed">{result.coaching.advice}</p>
                  </div>
                </div>
              </div>

              {/* 5-Minute Practice Plan Checklists */}
              <div className="glass-panel p-6 rounded-2xl border border-zinc-800/80 flex flex-col justify-between">
                <div className="space-y-5">
                  <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
                    <h3 className="font-extrabold text-sm tracking-tight text-zinc-300 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-violet-400" />
                      Five-Minute Daily Practice Plan
                    </h3>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-bold uppercase">Daily</span>
                  </div>

                  {/* Interactive Checklist */}
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                    
                    {/* Warm up routines */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase block">Step 1: Preparation & Routine Exercises</span>
                      <ul className="space-y-2">
                        {result.practice_plan.five_minute_plan.map((stepStr: string, idx: number) => {
                          const id = `step-${idx}`;
                          return (
                            <li key={idx} className="flex items-start gap-2.5 p-2 rounded bg-zinc-950/40 border border-zinc-900 text-xs">
                              <button 
                                onClick={() => setPracticeChecked(prev => ({ ...prev, [id]: !prev[id] }))}
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition ${
                                  practiceChecked[id] ? "bg-violet-600 border-violet-500 text-white" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                                }`}
                              >
                                {practiceChecked[id] && <Check className="w-3 h-3 stroke-[3]" />}
                              </button>
                              <span className={`leading-relaxed text-zinc-300 font-light ${practiceChecked[id] ? "line-through text-zinc-500" : ""}`}>
                                {stepStr}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* Practice words */}
                    {result.practice_plan.practice_words.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase block">Step 2: Core Vocabulary Drill</span>
                        <div className="flex flex-wrap gap-2">
                          {result.practice_plan.practice_words.map((w: string, idx: number) => {
                            const id = `word-${w}`;
                            const isChecked = practiceChecked[id];
                            return (
                              <button
                                key={idx}
                                onClick={() => setPracticeChecked(prev => ({ ...prev, [id]: !prev[id] }))}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 ${
                                  isChecked 
                                    ? "bg-violet-600/10 border-violet-500/40 text-violet-400 line-through" 
                                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? "bg-violet-400" : "bg-zinc-500"}`} />
                                {w}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Contextual Practice Sentences */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase block">Step 3: Speaking Sentences Aloud</span>
                      <ul className="space-y-2">
                        {result.practice_plan.practice_sentences.map((sentence: string, idx: number) => {
                          const id = `sentence-${idx}`;
                          const isChecked = practiceChecked[id];
                          return (
                            <li key={idx} className="flex items-start gap-2.5 p-2 rounded bg-zinc-950/40 border border-zinc-900 text-xs">
                              <button 
                                onClick={() => setPracticeChecked(prev => ({ ...prev, [id]: !prev[id] }))}
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition ${
                                  isChecked ? "bg-violet-600 border-violet-500 text-white" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                              </button>
                              <span className={`leading-relaxed text-zinc-300 font-light ${isChecked ? "line-through text-zinc-500" : ""}`}>
                                "{sentence}"
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* Tongue Twisters */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase block">Step 4: Tongue Twisters (Fluency & Clarity)</span>
                      <ul className="space-y-2">
                        {result.practice_plan.tongue_twisters.map((twister: string, idx: number) => {
                          const id = `twister-${idx}`;
                          const isChecked = practiceChecked[id];
                          return (
                            <li key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-violet-950/20 border border-violet-900/30 text-xs">
                              <button 
                                onClick={() => setPracticeChecked(prev => ({ ...prev, [id]: !prev[id] }))}
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition ${
                                  isChecked ? "bg-violet-600 border-violet-500 text-white" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                              </button>
                              <span className={`leading-relaxed text-violet-200 font-medium italic ${isChecked ? "line-through text-zinc-500" : ""}`}>
                                "{twister}"
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                  <span>Tracked locally in-session only.</span>
                  <span>Keep practicing to build muscle memory!</span>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-zinc-850 bg-zinc-950/40 py-6 px-6 mt-12 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>
            &copy; 2026 LivoSpeak AI. Developed by K Poorna Teja Reddy.
          </div>
          <div className="flex gap-4">
            <span className="hover:text-zinc-400 cursor-pointer" onClick={() => setStep("landing")}>Home</span>
            <span className="hover:text-zinc-400 cursor-pointer" onClick={() => setStep("upload")}>Uploader</span>
            <span>Security: SSL Encryption</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
