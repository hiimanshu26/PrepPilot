import { generateText } from "ai";
import { google } from "@ai-sdk/google";

type FeedbackShape = {
    strengths: string[];
    improvements: string[];
    betterAnswerSample: string[];
};

export async function POST(req: Request) {
    const { question, answer } = await req.json();

    if (!question || !answer) {
        return Response.json(
            { success: false, error: "Missing question/answer" },
            { status: 400 }
        );
    }

    try {
        const { text } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `
You are PrepPilot, a kind and practical interview coach.

Given the interview question and candidate answer, return a concise JSON response ONLY (no markdown, no extra text) in this exact shape:

{
  "strengths": ["...","..."],
  "improvements": ["...","..."],
  "betterAnswerSample": ["...","...","..."]
}

Rules:
- Keep strengths: 2 bullet points max
- Keep improvements: 2 bullet points max
- betterAnswerSample: 3–6 bullet lines, crisp and professional
- No harsh tone, no shaming

Question: ${question}
Candidate Answer: ${answer}
      `.trim(),
        });

        const raw = (text || "").trim();

        let parsed: FeedbackShape;

        // Try parsing direct JSON
        try {
            parsed = JSON.parse(raw);
        } catch {
            // Sometimes the model wraps JSON in extra text. Extract first JSON object.
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0]);
                } catch {
                    parsed = {
                        strengths: [],
                        improvements: ["Could not parse structured feedback."],
                        betterAnswerSample: [raw],
                    };
                }
            } else {
                parsed = {
                    strengths: [],
                    improvements: ["Could not parse structured feedback."],
                    betterAnswerSample: [raw],
                };
            }
        }

        // Normalize values
        parsed = {
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
            improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
            betterAnswerSample: Array.isArray(parsed.betterAnswerSample)
                ? parsed.betterAnswerSample
                : [],
        };

        return Response.json({ success: true, feedback: parsed }, { status: 200 });
    } catch (err) {
        console.error(err);
        return Response.json(
            { success: false, error: "Failed to generate feedback" },
            { status: 500 }
        );
    }
}
