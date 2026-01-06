"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase/client";

export default function AppHeader() {
    const router = useRouter();

    const doSignOut = async () => {
        try {
            // 1) Clear server session cookie
            await fetch("/api/auth/logout", { method: "POST" });

            // 2) Clear Firebase client session
            await signOut(auth);

            // 3) Go to sign-in
            router.replace("/sign-in");
        } catch (e) {
            console.error(e);
            alert("Logout failed. Check console.");
        }
    };

    return (
        <header className="pp-header">
            <div className="pp-header-inner">
                <Link href="/" className="pp-brand">
                    PrepPilot
                </Link>

                <nav className="pp-nav">
                    <Link className="pp-link" href="/interview">Interview</Link>
                    <Link className="pp-link" href="/past-interviews">Past Interviews</Link>
                </nav>

                <div className="pp-actions">
                    <button className="pp-btn" onClick={doSignOut}>
                        Sign Out
                    </button>
                </div>
            </div>
        </header>
    );
}
