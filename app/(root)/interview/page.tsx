"use client";

import { useEffect, useState } from "react";
import { auth } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";

export default function InterviewSetupPage() {
    const [user, setUser] = useState<User | null>(null);

    const [role, setRole] = useState("Software Engineer");
    const [level, setLevel] = useState("Fresher");
    const [interviewType, setInterviewType] = useState("HR");

    // Suggestions A + E
    const [goal, setGoal] = useState("Campus placement");
    const [difficulty, setDifficulty] = useState("Medium");
    const [numQuestions, setNumQuestions] = useState(5);
    const [questionStyle, setQuestionStyle] = useState("Mixed");
    const [personality, setPersonality] = useState("Neutral");

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    const start = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const idToken = await user.getIdToken();

            const res = await fetch("/api/interview/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idToken,
                    role,
                    level,
                    interviewType,
                    goal,
                    difficulty,
                    numQuestions,
                    questionStyle,
                    personality,
                }),
            });

            const data = await res.json();
            if (!data?.success) throw new Error(data?.error || "Failed");

            window.location.href = `/interview/${data.sessionId}`;
        } catch (e: any) {
            alert(e?.message || "Failed to start interview");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!user) {
        return (
            <div className="p-6 max-w-2xl mx-auto pp-fade-in">
                <div className="pp-card p-6">
                    <h1 className="text-3xl font-semibold">Start a Mock Interview</h1>
                    <p className="opacity-70 mt-2">Please sign in to continue.</p>

                    <div className="mt-5 flex gap-3 flex-wrap">
                        <a className="pp-btn" href="/sign-in">Sign In</a>
                        <a className="pp-btn" href="/sign-up">Create Account</a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-2xl mx-auto pp-fade-in">
            <div className="pp-card p-6">
                <h1 className="text-3xl font-semibold">Start a Mock Interview</h1>
                <p className="opacity-70 mt-2">
                    Choose your setup — PrepPilot will generate questions and coach you at the end.
                </p>

                <div className="mt-6 grid gap-4">
                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">Role</label>
                        <input
                            className="p-3 rounded-xl border bg-transparent"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">Level</label>
                        <select
                            className="p-3 rounded-xl border bg-transparent"
                            value={level}
                            onChange={(e) => setLevel(e.target.value)}
                        >
                            <option>Fresher</option>
                            <option>0-2 Years</option>
                            <option>2-5 Years</option>
                            <option>5+ Years</option>
                        </select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">Interview Type</label>
                        <select
                            className="p-3 rounded-xl border bg-transparent"
                            value={interviewType}
                            onChange={(e) => setInterviewType(e.target.value)}
                        >
                            <option>HR</option>
                            <option>Technical</option>
                            <option>Behavioral</option>
                            <option>Managerial</option>
                        </select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">Goal</label>
                        <select
                            className="p-3 rounded-xl border bg-transparent"
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                        >
                            <option>Campus placement</option>
                            <option>Internship</option>
                            <option>Switch job</option>
                        </select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">Difficulty</label>
                        <select
                            className="p-3 rounded-xl border bg-transparent"
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                        >
                            <option>Easy</option>
                            <option>Medium</option>
                            <option>Hard</option>
                        </select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">No. of Questions</label>
                        <select
                            className="p-3 rounded-xl border bg-transparent"
                            value={numQuestions}
                            onChange={(e) => setNumQuestions(Number(e.target.value))}
                        >
                            <option value={5}>5</option>
                            <option value={8}>8</option>
                            <option value={10}>10</option>
                        </select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">Question Style</label>
                        <select
                            className="p-3 rounded-xl border bg-transparent"
                            value={questionStyle}
                            onChange={(e) => setQuestionStyle(e.target.value)}
                        >
                            <option>Short</option>
                            <option>Deep</option>
                            <option>Mixed</option>
                        </select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm opacity-70">Interviewer Personality (optional)</label>
                        <select
                            className="p-3 rounded-xl border bg-transparent"
                            value={personality}
                            onChange={(e) => setPersonality(e.target.value)}
                        >
                            <option>Calm</option>
                            <option>Neutral</option>
                            <option>Strict</option>
                        </select>
                    </div>

                    <button className="px-4 py-3 rounded-xl border" onClick={start} disabled={loading}>
                        {loading ? "Starting..." : "Start Interview"}
                    </button>
                </div>
            </div>
        </div>
    );
}
