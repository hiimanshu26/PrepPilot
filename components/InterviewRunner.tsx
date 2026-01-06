"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auth, db } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";
import { deleteDoc, doc } from "firebase/firestore";

type FeedbackShape = {
    strengths: string[];
    improvements: string[];
    betterAnswerSample: string[];
};

type SummaryShape = {
    score: number;
    topStrengths: string[];
    topImprovements: string[];
    oneLineVerdict: string;
};

type Turn = {
    question: string;
    answer: string;
    skipped?: boolean;
    feedback?: FeedbackShape;
};

type Meta = {
    role: string;
    level: string;
    interviewType: string;
};

type Props = {
    interviewId: string;
    questions: string[];
    meta: Meta;
};

declare global {
    interface Window {
        webkitSpeechRecognition?: any;
        SpeechRecognition?: any;
    }
}

type Phase = "thinking" | "startWindow" | "answering";

export default function InterviewRunner({ interviewId, questions, meta }: Props) {
    const [user, setUser] = useState<User | null>(null);

    const [index, setIndex] = useState(0);
    const [listening, setListening] = useState(false);

    // Answer inputs
    const [answerMode, setAnswerMode] = useState<"Voice" | "Typing" | "Mixed">("Mixed");
    const [codeMode, setCodeMode] = useState(false);
    const [transcript, setTranscript] = useState("");

    // Report
    const [turns, setTurns] = useState<Turn[]>([]);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportReady, setReportReady] = useState(false);
    const [summary, setSummary] = useState<SummaryShape | null>(null);

    // Save control
    const [saveEnabled, setSaveEnabled] = useState(false); // default OFF
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "discarded" | "error">("idle");

    // Client mount + voice support
    const [hasMounted, setHasMounted] = useState(false);

    // Auto-speak ON by default
    const [autoSpeak, setAutoSpeak] = useState(true);
    const spokenOnceRef = useRef<Set<number>>(new Set());

    // Speech recognition
    const recognitionRef = useRef<any>(null);

    // Timer states
    const [phase, setPhase] = useState<Phase>("thinking");
    const [timeLeft, setTimeLeft] = useState(60);

    const timerRef = useRef<number | null>(null);

    const currentQuestion = questions[index] || "";
    const isDone = index >= questions.length;

    useEffect(() => {
        setHasMounted(true);
    }, []);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    const canUseVoice = useMemo(() => {
        if (typeof window === "undefined") return false;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        return !!SR;
    }, []);

    const micSupported = hasMounted ? canUseVoice : false;

    const clearTimer = () => {
        if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const startThinkingTimer = () => {
        clearTimer();
        setPhase("thinking");
        setTimeLeft(60);

        timerRef.current = window.setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) return 0;
                return t - 1;
            });
        }, 1000);
    };

    const startWindowTimer = () => {
        clearTimer();
        setPhase("startWindow");
        setTimeLeft(5);

        timerRef.current = window.setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) return 0;
                return t - 1;
            });
        }, 1000);
    };

    const speak = (text: string) => {
        if (typeof window === "undefined") return;
        if (!("speechSynthesis" in window)) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "en-IN";
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
    };

    // Setup Speech Recognition (client only)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-IN";

        recognition.onresult = (event: any) => {
            let newFinal = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) newFinal += res[0].transcript;
            }

            const cleaned = newFinal.trim();
            if (!cleaned) return;

            // Voice command: "skip"
            const low = cleaned.toLowerCase().replace(/[.?!,]/g, "").trim();
            if (low === "skip") {
                handleSkip("voice");
                return;
            }

            // Append only new final chunks (prevents repetition)
            setTranscript((prev) => {
                const sep = prev.trim().length ? " " : "";
                return (prev + sep + cleaned).trim();
            });
        };

        recognition.onend = () => setListening(false);
        recognitionRef.current = recognition;

        return () => {
            try {
                recognition.stop();
            } catch {}
            recognitionRef.current = null;
        };
    }, []);

    // Auto-speak each question ONCE by default
    useEffect(() => {
        if (!hasMounted) return;
        if (!autoSpeak) return;
        if (!currentQuestion) return;
        if (spokenOnceRef.current.has(index)) return;

        spokenOnceRef.current.add(index);
        const t = window.setTimeout(() => speak(currentQuestion), 250);
        return () => window.clearTimeout(t);
    }, [hasMounted, autoSpeak, index, currentQuestion]);

    // Whenever question changes: reset inputs + start thinking timer
    useEffect(() => {
        if (isDone) {
            clearTimer();
            return;
        }
        setTranscript("");
        setListening(false);
        setCodeMode(false);
        startThinkingTimer();

        return () => {
            // cleanup old timers when question changes
            clearTimer();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index]);

    // Phase transitions
    useEffect(() => {
        if (isDone) return;

        if (phase === "thinking" && timeLeft === 0) {
            startWindowTimer();
        }

        if (phase === "startWindow" && timeLeft === 0) {
            // if user didn't start speaking, auto-skip
            if (!listening && !transcript.trim()) {
                handleSkip("auto");
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, timeLeft]);

    const startListening = () => {
        if (!recognitionRef.current) return;

        // user can start early → move to answering
        clearTimer();
        setPhase("answering");

        setListening(true);

        try {
            recognitionRef.current.stop();
        } catch {}
        recognitionRef.current.start();
    };

    const stopListening = () => {
        if (!recognitionRef.current) return;
        try {
            recognitionRef.current.stop();
        } catch {}
        setListening(false);
    };

    const endInterviewNow = () => {
        try {
            recognitionRef.current?.stop();
        } catch {}
        clearTimer();
        setListening(false);
        setTranscript("");
        setIndex(questions.length); // jump to completion
    };

    const handleSkip = (source: "manual" | "voice" | "auto") => {
        // store a skipped turn
        setTurns((prev) => [
            ...prev,
            { question: currentQuestion, answer: "[SKIPPED]", skipped: true },
        ]);

        setTranscript("");
        setListening(false);
        clearTimer();

        setIndex((prev) => prev + 1);
    };

    const submitAnswer = () => {
        const answer = transcript.trim();
        if (!answer) return;

        setTurns((prev) => [...prev, { question: currentQuestion, answer }]);
        setTranscript("");
        setListening(false);
        clearTimer();

        setIndex((prev) => prev + 1);
    };

    const generateReport = async () => {
        if (!turns.length) {
            alert("No answers captured. Please answer at least one question.");
            return;
        }

        setReportLoading(true);
        setSaveStatus("idle");

        try {
            // Per-question feedback
            const updated: Turn[] = [];
            const perQuestionFeedback: FeedbackShape[] = [];

            for (let i = 0; i < turns.length; i++) {
                const t = turns[i];

                // If skipped, we still give a gentle feedback or skip feedback
                if (t.skipped) {
                    const fb: FeedbackShape = {
                        strengths: [],
                        improvements: ["You skipped this question. Try a 2–3 line structured answer next time."],
                        betterAnswerSample: ["Start with 1 line context", "Add 1 example", "End with result/learning"],
                    };
                    updated.push({ ...t, feedback: fb });
                    perQuestionFeedback.push(fb);
                    continue;
                }

                const res = await fetch("/api/interview/evaluate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ question: t.question, answer: t.answer }),
                });

                const data = await res.json();
                let fb: any = data?.feedback;

                // In case API returns feedback as a string JSON
                if (typeof fb === "string") {
                    try {
                        fb = JSON.parse(fb);
                    } catch {
                        fb = null;
                    }
                }

                const safeFb: FeedbackShape = fb && Array.isArray(fb.strengths)
                    ? fb
                    : { strengths: [], improvements: [], betterAnswerSample: [] };

                updated.push({ ...t, feedback: safeFb });
                perQuestionFeedback.push(safeFb);
            }

            setTurns(updated);

            // Overall summary
            const summaryRes = await fetch("/api/interview/summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role: meta.role,
                    level: meta.level,
                    interviewType: meta.interviewType,
                    turns: updated.map((t) => ({ question: t.question, answer: t.answer })),
                }),
            });

            const summaryData = await summaryRes.json();
            const overall: SummaryShape = summaryData?.summary;
            setSummary(overall);

            setReportReady(true);

            // Save decision
            if (saveEnabled) {
                if (!user) {
                    alert("Please log in to save your report.");
                } else {
                    setSaveStatus("saving");
                    const idToken = await user.getIdToken();

                    const saveRes = await fetch("/api/interview/complete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            sessionId: interviewId,
                            turns: updated.map((t) => ({ question: t.question, answer: t.answer })),
                            perQuestionFeedback,
                            summary: overall,
                            idToken,
                        }),
                    });

                    const saveData = await saveRes.json();
                    if (!saveData?.success) throw new Error(saveData?.error || "Save failed");
                    setSaveStatus("saved");
                }
            } else {
                // If not saving: delete the in_progress session to keep DB clean
                try {
                    await deleteDoc(doc(db, "interviews", interviewId));
                    setSaveStatus("discarded");
                } catch {
                    // ignore if rules/admin blocks; at least it won't show up since we list only completed
                    setSaveStatus("discarded");
                }
            }
        } catch (e) {
            console.error(e);
            setSaveStatus("error");
            alert("Report generation failed. Check console.");
        } finally {
            setReportLoading(false);
        }
    };

    const scoreBarWidth = summary ? Math.max(0, Math.min(100, summary.score)) : 0;

    return (
        <div className="flex flex-col gap-5 pp-fade-in">
            {/* Top row: status + End Interview */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm opacity-70">
                    {isDone ? "Interview ended" : `In progress • Q${index + 1}/${questions.length}`}
                </div>

                {!isDone && (
                    <button className="px-4 py-2 rounded-xl border" onClick={endInterviewNow}>
                        End Interview
                    </button>
                )}
            </div>

            {/* Browser capability notice (hydration-safe) */}
            {hasMounted && !micSupported && (
                <div className="p-3 rounded-2xl border text-sm opacity-80">
                    Voice transcription isn’t supported in this browser. Use Chrome Desktop for best results.
                </div>
            )}

            {/* Controls */}
            <div className="pp-card p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm opacity-70">
                    Auto-speak:{" "}
                    <button className="underline" onClick={() => setAutoSpeak((p) => !p)}>
                        {autoSpeak ? "ON" : "OFF"}
                    </button>
                </div>

                <div className="text-sm opacity-70">
                    Answer mode:{" "}
                    <select
                        className="p-2 rounded-xl border bg-transparent"
                        value={answerMode}
                        onChange={(e) => setAnswerMode(e.target.value as any)}
                    >
                        <option>Mixed</option>
                        <option>Voice</option>
                        <option>Typing</option>
                    </select>
                </div>

                {!isDone && (
                    <button className="px-4 py-2 rounded-xl border" onClick={() => speak(currentQuestion)}>
                        Repeat Question
                    </button>
                )}
            </div>

            {/* Interview card */}
            {!isDone ? (
                <div className="pp-card p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="text-sm opacity-70">
                            Question {index + 1} of {questions.length}
                        </div>

                        <div className="text-sm opacity-80">
                            {phase === "thinking" && <>Thinking time: <span className="font-semibold">{timeLeft}s</span></>}
                            {phase === "startWindow" && <>Start speaking in: <span className="font-semibold">{timeLeft}s</span></>}
                            {phase === "answering" && <>Answering</>}
                        </div>
                    </div>

                    <h2 className="text-2xl font-semibold mt-3">{currentQuestion}</h2>

                    <div className="flex gap-2 mt-5 flex-wrap">
                        <button
                            className="px-4 py-2 rounded-xl border"
                            onClick={listening ? stopListening : startListening}
                            disabled={!micSupported || answerMode === "Typing"}
                            title={answerMode === "Typing" ? "Switch to Mixed/Voice to use mic" : ""}
                        >
                            {listening ? "Stop Mic" : "Start Mic"}
                        </button>

                        <button
                            className="px-4 py-2 rounded-xl border"
                            onClick={() => handleSkip("manual")}
                            title="Skip this question"
                        >
                            Skip
                        </button>

                        <button
                            className="px-4 py-2 rounded-xl border"
                            onClick={submitAnswer}
                            disabled={!transcript.trim()}
                            title={!transcript.trim() ? "Type or speak to enable Submit" : ""}
                        >
                            Submit Answer
                        </button>

                        <button
                            className="px-4 py-2 rounded-xl border"
                            onClick={() => setCodeMode((p) => !p)}
                            title="Use code formatting for your answer"
                        >
                            {codeMode ? "Code Mode: ON" : "Code Mode: OFF"}
                        </button>
                    </div>

                    <div className="mt-5">
                        <div className="text-sm opacity-70">
                            Your answer (editable):
                            <span className="opacity-70"> — you can fix transcript before submitting</span>
                        </div>

                        <textarea
                            className={`w-full mt-2 p-4 rounded-2xl border bg-transparent min-h-28 ${
                                codeMode ? "font-mono text-sm" : ""
                            }`}
                            value={transcript}
                            onChange={(e) => setTranscript(e.target.value)}
                            placeholder={answerMode === "Voice" ? "Click Start Mic and speak…" : "Type your answer here…"}
                        />

                        <div className="flex gap-2 mt-3 flex-wrap">
                            <button className="px-3 py-2 rounded-xl border" onClick={() => setTranscript("")}>
                                Clear
                            </button>
                            <div className="text-sm opacity-70">
                                Tip: You can say <span className="font-semibold">“skip”</span> while mic is on to skip.
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="pp-card p-5">
                    <h2 className="text-2xl font-semibold">Interview Completed ✅</h2>
                    <p className="text-sm opacity-70 mt-2">
                        Feedback will be generated once at the end — per question + overall summary.
                    </p>

                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                        <label className="text-sm opacity-80 flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={saveEnabled}
                                onChange={(e) => setSaveEnabled(e.target.checked)}
                            />
                            Save this interview to Past Interviews
                        </label>
                    </div>

                    <button className="px-4 py-2 rounded-xl border mt-4" onClick={generateReport} disabled={reportLoading}>
                        {reportLoading ? "Generating..." : "Generate Final Report"}
                    </button>

                    {saveStatus !== "idle" && (
                        <div className="text-sm opacity-70 mt-3">
                            {saveStatus === "saving" && "Saving..."}
                            {saveStatus === "saved" && "Saved ✅ You can view it in Past Interviews."}
                            {saveStatus === "discarded" && "Not saved (discarded)."}
                            {saveStatus === "error" && "Something went wrong. Check console."}
                        </div>
                    )}
                </div>
            )}

            {/* Overall summary (B) */}
            {summary && (
                <div className="pp-card p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <h3 className="text-xl font-semibold">Overall Summary</h3>
                        <div className="text-sm opacity-80">
                            Score: <span className="font-semibold">{summary.score}/100</span>
                        </div>
                    </div>

                    {/* Score bar */}
                    <div className="mt-4">
                        <div className="h-3 rounded-full border overflow-hidden">
                            <div style={{ width: `${scoreBarWidth}%` }} className="h-full bg-white/80" />
                        </div>
                        <p className="opacity-80 mt-3">{summary.oneLineVerdict}</p>
                    </div>

                    <div className="mt-5 grid gap-4">
                        <div className="p-4 rounded-2xl border">
                            <div className="font-medium">✅ Top Strengths</div>
                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                {(summary.topStrengths || []).map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="p-4 rounded-2xl border">
                            <div className="font-medium">🛠 Top 3 Improvements</div>
                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                {(summary.topImprovements || []).map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>


                        {/* Mini Action Plan */}
                        <div className="p-4 rounded-2xl border">
                            <div className="font-medium">📌 Quick Action Plan</div>
                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                <li>Practice 2 answers using STAR (Situation, Task, Action, Result)</li>
                                <li>Prepare a 30–45 second “Tell me about yourself” pitch</li>
                                <li>Record one answer and refine clarity + structure</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Per-question report */}
            {reportReady && (
                <div className="pp-card p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <h3 className="text-xl font-semibold">Final Interview Report</h3>
                        <a className="underline opacity-80" href="/past-interviews">
                            Past Interviews
                        </a>
                    </div>

                    <div className="mt-4 flex flex-col gap-4">
                        {turns.map((t, i) => (
                            <div key={i} className="p-5 rounded-2xl border">
                                <div className="text-sm opacity-70">Question {i + 1}</div>
                                <div className="font-semibold mt-1">{t.question}</div>

                                <div className="mt-4">
                                    <div className="text-sm opacity-70">Your Answer</div>
                                    <div className="mt-1 whitespace-pre-wrap">{t.answer}</div>
                                </div>

                                {t.feedback && (
                                    <div className="mt-5 grid gap-4">
                                        <div className="p-4 rounded-2xl border">
                                            <div className="font-medium">✅ Strengths</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(t.feedback.strengths || []).map((s, idx) => (
                                                    <li key={idx}>{s}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="p-4 rounded-2xl border">
                                            <div className="font-medium">🛠 Improvements</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(t.feedback.improvements || []).map((s, idx) => (
                                                    <li key={idx}>{s}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="p-4 rounded-2xl border">
                                            <div className="font-medium">✨ Better Sample</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(t.feedback.betterAnswerSample || []).map((s, idx) => (
                                                    <li key={idx}>{s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
