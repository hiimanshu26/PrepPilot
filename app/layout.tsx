import type { Metadata } from "next";
import { Mona_Sans } from "next/font/google";

import "./globals.css";
import { Toaster } from "sonner";

import type { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";

const monaSans = Mona_Sans({
    variable: "--font-mona-sans",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "PrepPilot",
    description: "AI-powered platform for preparing for mock interviews",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className="dark">
        <body className={`${monaSans.className} antialiased pattern`}>
        <div className="pp-shell">
            <AppHeader />
            <main className="pp-main">{children}</main>
        </div>

        <Toaster />
        </body>
        </html>
    );
}
