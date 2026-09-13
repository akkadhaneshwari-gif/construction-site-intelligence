import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

// Logs every photo-AI analysis run (real GPT-5 Vision call OR the
// rule-based demo fallback) into the ai_observations table. This is what
// backs the dashboard's "AI Observations" count so it reflects real
// analysis activity instead of a hardcoded/duplicated number.
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { data, error } = await createClient()
      .from("ai_observations")
      .insert([
        {
          project_id: body.project_id ?? null,
          area: body.area || "Unspecified",
          issue_type: body.issue_type || "Other",
          severity: body.severity || "Medium",
          ai_mode: body.ai_mode || "rule-based-demo",
          raw_result: body.raw_result || body.description || "",
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    // Non-fatal by design: the caller (analyzePhoto) fires this in the
    // background and should not block the user's workflow if logging fails
    // (e.g. before the migration has been run).
    return NextResponse.json(
      { error: error?.message || "Failed to log AI observation." },
      { status: 500 }
    );
  }
}
