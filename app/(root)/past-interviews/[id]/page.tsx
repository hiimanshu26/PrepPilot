"use client";

import React, { useEffect, useState } from "react";
import { auth, db } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";
import { deleteDoc, doc, getDoc } from "firebase/firestore";

export default function PastInterviewDetailPage({
                                                    params,
                                                }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = React.use(params);

    const [user, setUser] = useState<User | null>(null);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    useEffect(() => {
        const load = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            setLoading(true);
            const ref = doc(db, "interviews", id);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                setData(null);
                setLoading(false);
                return;
            }

            const d = snap.data() as any;
            if (d.userId !== user.uid) {
                setData({ forbidden: true });
                setLoading(false);
                return;
            }

            setData(d);
            setLoading(false);
        };

        load();
    }, [user, id]);

    const doDelete = async () => {
        if (!confirm("Delete this interview report? This cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, "interviews", id));
            window.location.href = "/past-interviews";
        } catch (e) {
            console.error(e);
            alert("Delete failed. Check Firestore rules.");
        }
    };

    if (!user) {
        return (
            <div className="p-6 max-w-3xl mx-auto pp-fade-in">
                <div className="pp-card p-6">
                    <h1 className="text-2xl font-semibold">Interview Report</h1>
                    <p className="opacity-70 mt-2">Please log in to view this report.</p>
                </div>
            </div>
        );
    }

    if (loading) return <div className="p-6 max-w-3xl mx-auto">Loading...</div>;
    if (!data) return <div className="p-6 max-w-3xl mx-auto">Not found.</div>;
    if (data.forbidden) return <div className="p-6 max-w-3xl mx-auto">Forbidden.</div>;

    return (
        <div className="p-6 max-w-3xl mx-auto pp-fade-in">
            <div className="pp-card p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h1 className="text-2xl font-semibold">Interview Report</h1>
                    <div className="flex gap-3">
                        <a className="underline opacity-80" href="/past-interviews">
                            Back
                        </a>
                        <button className="px-3 py-2 rounded-xl border" onClick={doDelete} title="Delete">
                            🗑 Delete
                        </button>
                    </div>
                </div>

                <div className="mt-4 p-5 rounded-2xl border">
                    <div className="font-semibold">
                        {data.role} • {data.level}
                    </div>
                    <div className="text-sm opacity-70 mt-1">{data.interviewType}</div>
                    <div className="text-sm opacity-70 mt-1">
                        Score: {data.summary?.score ?? "—"}/100
                    </div>
                    <div className="opacity-80 mt-3">{data.summary?.oneLineVerdict}</div>

                    <div className="mt-4 grid gap-4">
                        <div>
                            <div className="font-medium">✅ Top Strengths</div>
                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                {(data.summary?.topStrengths || []).map((s: string, i: number) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <div className="font-medium">🛠 Top 3 Improvements</div>
                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                {(data.summary?.topImprovements || []).map((s: string, i: number) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-6 grid gap-4">
                    {(data.turns || []).map((t: any, i: number) => {
                        const fb = (data.perQuestionFeedback || [])[i];
                        return (
                            <div key={i} className="p-5 rounded-2xl border">
                                <div className="text-sm opacity-70">Question {i + 1}</div>
                                <div className="font-semibold mt-1">{t.question}</div>

                                <div className="mt-4">
                                    <div className="text-sm opacity-70">Your Answer</div>
                                    <div className="mt-1 whitespace-pre-wrap">{t.answer}</div>
                                </div>

                                {fb && (
                                    <div className="mt-5 grid gap-4">
                                        <div>
                                            <div className="font-medium">✅ Strengths</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(fb.strengths || []).map((s: string, idx: number) => (
                                                    <li key={idx}>{s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <div className="font-medium">🛠 Improve</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(fb.improvements || []).map((s: string, idx: number) => (
                                                    <li key={idx}>{s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <div className="font-medium">✨ Better Sample</div>
                                            <ul className="list-disc pl-6 mt-2 opacity-90">
                                                {(fb.betterAnswerSample || []).map((s: string, idx: number) => (
                                                    <li key={idx}>{s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
