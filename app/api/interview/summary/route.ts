import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export async function POST(req: Request) {
    const { role, level, interviewType, turns } = await req.json();

    if (!Array.isArray(turns) || turns.length === 0) {
        return Response.json({ success: false, error: "Missing turns" }, { status: 400 });
    }

    const transcript = turns
        .map((t: any, i: number) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
        .join("\n\n");

    try {
        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
You are PrepPilot. Create an overall interview summary.

Return JSON ONLY:
{
  "score": 0-100,
  "topStrengths": ["...","...","..."],
  "topImprovements": ["...","...","..."],
  "oneLineVerdict": "..."
}

Context:
Interview Type: ${interviewType}
Role: ${role}
Level: ${level}

Transcript:
${transcript}

Rules:
- Kind + practical
- Improvements actionable
- No markdown
`.trim(),
        });

        let parsed: any = null;
        try {
            parsed = JSON.parse(text.trim());
        } catch {
            const match = text.trim().match(/\{[\s\S]*\}/);
            parsed = match ? JSON.parse(match[0]) : null;
        }

        if (!parsed) {
            return Response.json({ success: false, error: "Summary parse failed" }, { status: 500 });
        }

        return Response.json({ success: true, summary: parsed }, { status: 200 });
    } catch (e) {
        console.error(e);
        return Response.json({ success: false, error: "Summary failed" }, { status: 500 });
    }
}
