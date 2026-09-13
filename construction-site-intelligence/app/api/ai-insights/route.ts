import OpenAI from "openai";
import { NextResponse } from "next/server";

// Generates a short narrative insight (cost / project / progress) from a
// JSON summary of the CURRENT project's real Supabase data. This is a real
// LLM call when OPENAI_API_KEY is configured; if it fails or is missing,
// the route returns an error and the client falls back to a clearly
// labeled rule-based summary instead of pretending this ran.
const INSTRUCTIONS: Record<string, string> = {
  cost:
    "You are a construction project cost analyst. You are given a JSON summary " +
    "of a construction project's real cost records (by category, estimated vs " +
    "actual). Identify the highest spending categories, any budget concerns, " +
    "cost trends only if multiple dated entries are present, and areas with " +
    "high cost. Do not invent numbers that are not in the JSON. Keep it to " +
    "4-6 short bullet points.",
  project:
    "You are a construction site intelligence analyst. You are given a JSON " +
    "summary of a construction project's real site observations, incidents, " +
    "materials, and recurring issues. Identify recurring problems, high-risk " +
    "areas, safety concerns, and material concerns. Do not invent data not " +
    "present in the JSON. Keep it to 4-6 short bullet points.",
  progress:
    "You are a construction progress analyst. You are given a JSON summary of " +
    "a construction project's daily progress reports and current progress " +
    "percentage. Summarize the current progress and note any delay indicators " +
    "ONLY if the data clearly supports it (e.g. multiple reports mentioning " +
    "delays). If there isn't enough historical data to assess a trend, say so " +
    "explicitly instead of guessing. Keep it to 3-5 short bullet points.",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const insightType = body.insightType as string;
    const context = body.context;

    if (!INSTRUCTIONS[insightType]) {
      return NextResponse.json(
        { error: "Unknown insight type." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: INSTRUCTIONS[insightType],
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Project data summary (JSON):\n${JSON.stringify(context)}`,
            },
          ],
        },
      ],
    });

    return NextResponse.json({ result: response.output_text });
  } catch (error: any) {
    console.error("AI insights error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "AI insight generation failed." },
      { status: 500 }
    );
  }
}
