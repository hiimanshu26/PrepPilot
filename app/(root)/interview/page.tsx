"use client";

import { useEffect, useState } from "react";
import { auth } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";

export default function InterviewSetupPage() {
    const [user, setUser] = useState<User | null>(null);

    const [role, setRole] = useState("Software Engineer");
    const [level, setLevel] = useState("Fresher");
    const [interviewType, setInterviewType] = useState("HR");
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
                    role,
                    level,
                    interviewType,
                    numQuestions: 5,
                    idToken,
                }),
            });

            const data = await res.json();
            if (!data?.success) throw new Error(data?.error || "Failed");

            window.location.href = `/interview/${data.sessionId}`;
        } catch (e: any) {
            alert(e?.message || "Failed to start interview");
        } finally {
            setLoading(false);
        }
    };

    if (!user) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <h1 className="text-3xl font-semibold">Start a Mock Interview</h1>
                <p className="opacity-70 mt-2">Please log in to continue.</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-3xl font-semibold">Start a Mock Interview</h1>
                <a className="underline opacity-80" href="/past-interviews">
                    Past Interviews
                </a>
            </div>

            <p className="opacity-70 mt-2">Choose what you want to practice — PrepPilot will generate questions.</p>

            <div className="mt-6 grid gap-4">
                <div className="grid gap-2">
                    <label className="text-sm opacity-70">Role</label>
                    <input className="p-3 rounded-xl border" value={role} onChange={(e) => setRole(e.target.value)} />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm opacity-70">Level</label>
                    <select className="p-3 rounded-xl border" value={level} onChange={(e) => setLevel(e.target.value)}>
                        <option>Fresher</option>
                        <option>0-2 Years</option>
                        <option>2-5 Years</option>
                        <option>5+ Years</option>
                    </select>
                </div>

                <div className="grid gap-2">
                    <label className="text-sm opacity-70">Interview Type</label>
                    <select className="p-3 rounded-xl border" value={interviewType} onChange={(e) => setInterviewType(e.target.value)}>
                        <option>HR</option>
                        <option>Technical</option>
                        <option>Behavioral</option>
                        <option>Managerial</option>
                    </select>
                </div>

                <button className="px-4 py-3 rounded-xl border" onClick={start} disabled={loading}>
                    {loading ? "Starting..." : "Start Interview"}
                </button>
            </div>
        </div>
    );
}
