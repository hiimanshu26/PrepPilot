import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { db, auth as adminAuth } from "@/firebase/admin";

export async function POST(req: Request) {
    const body = await req.json();
    const { role, level, interviewType, numQuestions = 5, idToken } = body || {};

    if (!role || !level || !interviewType || !idToken) {
        return Response.json(
            { success: false, error: "Missing role/level/interviewType/idToken" },
            { status: 400 }
        );
    }

    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        const userId = decoded.uid;

        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
You are PrepPilot. Generate ${numQuestions} interview questions.

Return JSON ONLY:
{
  "questions": ["...", "..."]
}

Interview Type: ${interviewType}
Role: ${role}
Level: ${level}

Rules:
- Short, clear questions
- No numbering, no markdown
- Practical, India job market friendly
`.trim(),
        });

        let parsed: any = null;
        try {
            parsed = JSON.parse(text.trim());
        } catch {
            const match = text.trim().match(/\{[\s\S]*\}/);
            parsed = match ? JSON.parse(match[0]) : null;
        }

        const questions: string[] = Array.isArray(parsed?.questions) ? parsed.questions : [];
        if (!questions.length) {
            return Response.json(
                { success: false, error: "Failed to generate questions" },
                { status: 500 }
            );
        }

        const ref = db.collection("interviews").doc();
        await ref.set({
            id: ref.id,
            userId,
            role,
            level,
            interviewType,
            questions,
            status: "in_progress",
            createdAt: new Date().toISOString(),
            completedAt: null,
            turns: [],
            perQuestionFeedback: [],
            summary: null,
        });

        return Response.json({ success: true, sessionId: ref.id }, { status: 200 });
    } catch (e) {
        console.error(e);
        return Response.json({ success: false, error: "Create failed" }, { status: 500 });
    }
}
