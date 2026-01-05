"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";

type InterviewItem = {
    id: string;
    role: string;
    level: string;
    interviewType: string;
    createdAt?: string;
    completedAt?: string;
    summary?: { score?: number };
};

export default function PastInterviewsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [items, setItems] = useState<InterviewItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    useEffect(() => {
        const load = async () => {
            if (!user) {
                setItems([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            const q = query(
                collection(db, "interviews"),
                where("userId", "==", user.uid),
                where("status", "==", "completed"),
                orderBy("completedAt", "desc")
            );

            const snap = await getDocs(q);
            const list: InterviewItem[] = snap.docs.map((d) => d.data() as any);
            setItems(list);
            setLoading(false);
        };

        load();
    }, [user]);

    if (!user) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <h1 className="text-3xl font-semibold">Past Interviews</h1>
                <p className="opacity-70 mt-2">Please log in to view your interview history.</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <h1 className="text-3xl font-semibold">Past Interviews</h1>
                <a className="underline opacity-80" href="/interview">Start New Interview</a>
            </div>

            {loading ? (
                <p className="opacity-70 mt-4">Loading...</p>
            ) : items.length === 0 ? (
                <p className="opacity-70 mt-4">No completed interviews yet.</p>
            ) : (
                <div className="mt-6 grid gap-4">
                    {items.map((it) => (
                        <a key={it.id} href={`/past-interviews/${it.id}`} className="p-5 rounded-2xl border block">
                            <div className="flex items-center justify-between gap-4">
                                <div className="font-semibold">{it.role} • {it.level}</div>
                                <div className="text-sm opacity-70">Score: {it.summary?.score ?? "—"}</div>
                            </div>
                            <div className="text-sm opacity-70 mt-1">{it.interviewType} • Completed: {it.completedAt?.slice(0, 10)}</div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
