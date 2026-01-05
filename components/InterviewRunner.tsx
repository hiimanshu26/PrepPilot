"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";

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

export default function InterviewRunner({ interviewId, questions, meta }: Props) {
    const [user, setUser] = useState<User | null>(null);

    const [index, setIndex] = useState(0);
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState("");

    const [turns, setTurns] = useState<Turn[]>([]);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportReady, setReportReady] = useState(false);

    const [summary, setSummary] = useState<SummaryShape | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    // hydration-safe client mount flag for browser capability UI
    const [hasMounted, setHasMounted] = useState(false);

    // Auto-speak ON by default
    const [autoSpeak, setAutoSpeak] = useState(true);
    const spokenOnceRef = useRef<Set<number>>(new Set());

    const recognitionRef = useRef<any>(null);

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

    // Setup Speech Recognition (client only)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-IN";

        // FIX repetition: append only new final chunks
        recognition.onresult = (event: any) => {
            let newFinal = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) newFinal += res[0].transcript;
            }

            if (newFinal.trim()) {
                setTranscript((prev) => {
                    const sep = prev.trim().length ? " " : "";
                    return (prev + sep + newFinal.trim()).trim();
                });
            }
        };

        recognition.onend = () => setListening(false);
        recognitionRef.current = recognition;

        return () => {
            try { recognition.stop(); } catch {}
            recognitionRef.current = null;
        };
    }, []);

    const speak = (text: string) => {
        if (typeof window === "undefined") return;
        if (!("speechSynthesis" in window)) return;

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "en-IN";

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
    };

    // ✅ Auto-speak each question ONCE by default
    useEffect(() => {
        if (!hasMounted) return;
        if (!autoSpeak) return;
        if (!currentQuestion) return;
        if (spokenOnceRef.current.has(index)) return;

        // Speak once when question appears
        spokenOnceRef.current.add(index);

        const t = setTimeout(() => speak(currentQuestion), 300);
        return () => clearTimeout(t);
    }, [hasMounted, autoSpeak, index, currentQuestion]);

    const startListening = () => {
        if (!recognitionRef.current) return;

        setTranscript("");
        setListening(true);

        // Prevent duplicated recognition sessions
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current.start();
    };

    const stopListening = () => {
        if (!recognitionRef.current) return;
        try { recognitionRef.current.stop(); } catch {}
        setListening(false);
    };

    // During interview: store answers only
    const submitAnswer = () => {
        const answer = transcript.trim();
        if (!answer) return;

        setTurns((prev) => [...prev, { question: currentQuestion, answer }]);
        setTranscript("");
        setIndex((prev) => prev + 1);
    };

    const generateFinalReportAndSave = async () => {
        if (!user) {
            alert("Please log in to generate and save your report.");
            return;
        }

        setReportLoading(true);
        setSaveStatus("idle");

        try {
            const idToken = await user.getIdToken();

            // 1) Per-question feedback
            const updated: Turn[] = [];
            const perQuestionFeedback: FeedbackShape[] = [];

            for (let i = 0; i < turns.length; i++) {
                const t = turns[i];

                const res = await fetch("/api/interview/evaluate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ question: t.question, answer: t.answer }),
                });

                const data = await res.json();
                const fb: FeedbackShape = data?.feedback || {
                    strengths: [],
                    improvements: [],
                    betterAnswerSample: [],
                };

                updated.push({ ...t, feedback: fb });
                perQuestionFeedback.push(fb);
            }

            setTurns(updated);

            // 2) Overall summary
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

            // 3) Save to Firestore (server route)
            setSaveStatus("saving");

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
            setReportReady(true);
        } catch (e) {
            console.error(e);
            setSaveStatus("error");
            alert("Report generation/saving failed. Check console/server logs.");
        } finally {
            setReportLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            {hasMounted && !canUseVoice && (
                <div className="p-3 rounded-2xl border text-sm opacity-80">
                    Voice transcription isn’t supported in this browser. Use Chrome Desktop for best results.
                </div>
            )}

            {/* Controls */}
            <div className="p-4 rounded-2xl border flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm opacity-70">
                    Auto-speak:{" "}
                    <button className="underline" onClick={() => setAutoSpeak((p) => !p)}>
                        {autoSpeak ? "ON" : "OFF"}
                    </button>
                </div>

                {!isDone && (
                    <button className="px-4 py-2 rounded-xl border" onClick={() => speak(currentQuestion)}>
                        Repeat Question
                    </button>
                )}
            </div>

            {!user && (
                <div className="p-3 rounded-2xl border text-sm opacity-80">
                    You can practice without login, but you must log in to save the report and view Past Interviews.
                </div>
            )}

            {/* Interview Card */}
            {!isDone ? (
                <div className="p-5 rounded-2xl border">
                    <div className="text-sm opacity-70">
                        Question {index + 1} of {questions.length}
                    </div>

                    <h2 className="text-2xl font-semibold mt-2">{currentQuestion}</h2>

                    <div className="flex gap-2 mt-5 flex-wrap">
                        <button
                            className="px-4 py-2 rounded-xl border"
                            onClick={listening ? stopListening : startListening}
                            disabled={!micSupported}
                        >
                            {listening ? "Stop Mic" : "Start Mic"}
                        </button>

                        <button
                            className="px-4 py-2 rounded-xl border"
                            onClick={submitAnswer}
                            disabled={!transcript.trim()}
                            title={!transcript.trim() ? "Speak first to enable Submit" : ""}
                        >
                            Submit Answer
                        </button>
                    </div>

                    <div className="mt-5">
                        <div className="text-sm opacity-70">Your transcript:</div>
                        <div className="min-h-16 p-4 rounded-2xl border mt-2 whitespace-pre-wrap">
                            {transcript || "Start speaking…"}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-5 rounded-2xl border">
                    <h2 className="text-2xl font-semibold">Interview Completed ✅</h2>
                    <p className="text-sm opacity-70 mt-2">
                        Feedback will be generated only once at the end (per question + overall score).
                    </p>

                    <button
                        className="px-4 py-2 rounded-xl border mt-4"
                        onClick={generateFinalReportAndSave}
                        disabled={reportLoading}
                    >
                        {reportLoading ? "Generating & Saving..." : "Generate Final Report"}
                    </button>

                    {saveStatus !== "idle" && (
                        <div className="text-sm opacity-70 mt-3">
                            Save status:{" "}
                            {saveStatus === "saving"
                                ? "Saving..."
                                : saveStatus === "saved"
                                    ? "Saved ✅"
                                    : "Failed ❌"}
                        </div>
                    )}
                </div>
            )}

            {/* Overall Summary */}
            {summary && (
                <div className="p-5 rounded-2xl border">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <h3 className="text-xl font-semibold">Overall Summary</h3>
                        <div className="text-sm opacity-80">
                            Score: <span className="font-semibold">{summary.score}/100</span>
                        </div>
                    </div>

                    <p className="opacity-80 mt-2">{summary.oneLineVerdict}</p>

                    <div className="mt-4 grid gap-4">
                        <div>
                            <div className="font-medium">✅ Top Strengths</div>
                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                {(summary.topStrengths || []).map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                        </div>

                        <div>
                            <div className="font-medium">🛠 Top 3 Improvements</div>
                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                {(summary.topImprovements || []).map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Final Report */}
            {reportReady && (
                <div className="p-5 rounded-2xl border">
                    <h3 className="text-xl font-semibold">Final Interview Report</h3>

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
                                        <div>
                                            <div className="font-medium">✅ Strengths</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(t.feedback.strengths || []).map((s, idx) => <li key={idx}>{s}</li>)}
                                            </ul>
                                        </div>

                                        <div>
                                            <div className="font-medium">🛠 Improve</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(t.feedback.improvements || []).map((s, idx) => <li key={idx}>{s}</li>)}
                                            </ul>
                                        </div>

                                        <div>
                                            <div className="font-medium">✨ Better Sample</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(t.feedback.betterAnswerSample || []).map((s, idx) => <li key={idx}>{s}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-5">
                        <a className="underline opacity-80" href="/past-interviews">
                            View Past Interviews
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
