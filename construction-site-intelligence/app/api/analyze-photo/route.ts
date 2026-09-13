import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Photo is required." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions:
        "You are a construction site safety and progress inspection AI. " +
        "Analyze the uploaded construction site image carefully. " +
        "Identify only issues visibly supported by the image. " +
        "Check PPE, unsafe conditions, construction materials, material storage, housekeeping, structural issues and visible progress. " +
        "Do not invent problems. Give a concise report with detected issue, evidence, risk level and recommended action.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze this construction site photo.",
            },
            {
              type: "input_image",
              image_url: dataUrl,
              detail: "auto",
            },
          ],
        },
      ],
    });

    return NextResponse.json({
      result: response.output_text,
    });
 } catch (error: any) {
  console.error("Photo AI error:", error?.message || error);

  return NextResponse.json(
    { error: error?.message || "Photo analysis failed." },
    { status: 500 }
  );
}
}