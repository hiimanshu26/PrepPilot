"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, orderBy, query, where } from "firebase/firestore";

type InterviewItem = {
    id: string;
    userId: string;
    role: string;
    level: string;
    interviewType: string;
    createdAt?: string;
    completedAt?: string;
    status?: string;
    summary?: { score?: number };
};

export default function PastInterviewsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [items, setItems] = useState<InterviewItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("All");

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    const load = async (u: User) => {
        setLoading(true);

        // Avoid composite-index dependency:
        // Fetch user docs ordered by createdAt, then filter status === completed in code.
        const q = query(
            collection(db, "interviews"),
            where("userId", "==", u.uid),
            orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const list: InterviewItem[] = snap.docs.map((d) => d.data() as any);
        setItems(list.filter((x) => x.status === "completed"));
        setLoading(false);
    };

    useEffect(() => {
        if (!user) {
            setItems([]);
            setLoading(false);
            return;
        }
        load(user);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        return items.filter((it) => {
            const matchSearch =
                !s ||
                it.role?.toLowerCase().includes(s) ||
                it.level?.toLowerCase().includes(s) ||
                it.interviewType?.toLowerCase().includes(s);

            const matchType = typeFilter === "All" ? true : it.interviewType === typeFilter;

            return matchSearch && matchType;
        });
    }, [items, search, typeFilter]);

    const doDelete = async (id: string) => {
        if (!confirm("Delete this interview report? This cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, "interviews", id));
            setItems((prev) => prev.filter((x) => x.id !== id));
        } catch (e) {
            console.error(e);
            alert("Delete failed. Check Firestore rules / console.");
        }
    };

    if (!user) {
        return (
            <div className="p-6 max-w-3xl mx-auto pp-fade-in">
                <div className="pp-card p-6">
                    <h1 className="text-3xl font-semibold">Past Interviews</h1>
                    <p className="opacity-70 mt-2">Please sign in to view your interview history.</p>

                    <div className="mt-5 flex gap-3 flex-wrap">
                        <a className="pp-btn" href="/sign-in">Sign In</a>
                        <a className="pp-btn" href="/sign-up">Create Account</a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-3xl mx-auto pp-fade-in">
            <div className="pp-card p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h1 className="text-3xl font-semibold">Past Interviews</h1>
                    <a className="underline opacity-80" href="/interview">
                        Start New Interview
                    </a>
                </div>

                <div className="mt-5 grid gap-3">
                    <input
                        className="p-3 rounded-xl border bg-transparent"
                        placeholder="Search by role, type, level..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        className="p-3 rounded-xl border bg-transparent"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                    >
                        <option>All</option>
                        <option>HR</option>
                        <option>Technical</option>
                        <option>Behavioral</option>
                        <option>Managerial</option>
                    </select>
                </div>

                {loading ? (
                    <p className="opacity-70 mt-4">Loading...</p>
                ) : filtered.length === 0 ? (
                    <p className="opacity-70 mt-4">No completed interviews found.</p>
                ) : (
                    <div className="mt-6 grid gap-4">
                        {filtered.map((it) => (
                            <div key={it.id} className="p-5 rounded-2xl border">
                                <div className="flex items-start justify-between gap-4">
                                    <a href={`/past-interviews/${it.id}`} className="block">
                                        <div className="font-semibold">
                                            {it.role} • {it.level}
                                        </div>
                                        <div className="text-sm opacity-70 mt-1">
                                            {it.interviewType} • {it.completedAt?.slice(0, 10) || it.createdAt?.slice(0, 10)}
                                        </div>
                                    </a>

                                    <div className="flex items-center gap-3">
                                        <div className="text-sm opacity-80">
                                            Score: <span className="font-semibold">{it.summary?.score ?? "—"}</span>
                                        </div>
                                        <button className="px-3 py-2 rounded-xl border" onClick={() => doDelete(it.id)} title="Delete">
                                            🗑
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
