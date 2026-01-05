import { db, auth as adminAuth } from "@/firebase/admin";

export async function POST(req: Request) {
    const { sessionId, turns, perQuestionFeedback, summary, idToken } = await req.json();

    if (!sessionId || !Array.isArray(turns) || !summary || !idToken) {
        return Response.json({ success: false, error: "Missing data" }, { status: 400 });
    }

    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        const userId = decoded.uid;

        const ref = db.collection("interviews").doc(sessionId);
        const snap = await ref.get();

        if (!snap.exists) {
            return Response.json({ success: false, error: "Interview not found" }, { status: 404 });
        }

        const data = snap.data() as any;
        if (data.userId !== userId) {
            return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
        }

        await ref.update({
            status: "completed",
            completedAt: new Date().toISOString(),
            turns,
            perQuestionFeedback: perQuestionFeedback || [],
            summary,
        });

        return Response.json({ success: true }, { status: 200 });
    } catch (e) {
        console.error(e);
        return Response.json({ success: false, error: "Save failed" }, { status: 500 });
    }
}
