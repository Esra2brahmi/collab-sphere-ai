import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { title, description } = await request.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const prompt = `Given this task: "${title}"${description ? ` - ${description}` : ''}, suggest 3-5 logical subtasks that would help break down this work. 

Format as JSON array:
[
  {
    "title": "Subtask title",
    "description": "Brief description of what needs to be done",
    "estimatedHours": 2
  }
]

Keep subtasks specific, actionable, and realistic in scope.`;

    // Call Groq directly to generate suggestions
    const completion = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: "You are a helpful assistant that returns valid JSON only when asked to output JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
      top_p: 0.9,
    });

    const text = completion.choices?.[0]?.message?.content || "";

    let suggestions: any[] = [];
    try {
      suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) suggestions = [];
    } catch {
      // Try to extract JSON array if model wrapped it
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          suggestions = Array.isArray(parsed) ? parsed : [];
        } catch {
          suggestions = [];
        }
      }
    }

    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    console.error("AI Subtasks error:", error);
    return NextResponse.json(
      { error: "Failed to generate AI suggestions" },
      { status: 500 }
    );
  }
}
