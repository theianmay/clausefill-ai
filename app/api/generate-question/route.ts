import { NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize OpenAI client with default or user-provided key
const defaultApiKey = process.env.OPENAI_API_KEY;

function getOpenAIClient(userApiKey?: string): OpenAI | null {
  const apiKey = userApiKey || defaultApiKey;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

// Fallback function for deterministic question generation
function generateDeterministicQuestion(placeholder: string): string {
  // Clean up the placeholder for display
  let cleanedPlaceholder = placeholder
    .replace(/^\$?\[/, "")
    .replace(/\]$/, "")
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .replace(/_{3,}/, "blank field")
    .trim();

  // Handle empty or very short placeholders
  if (!cleanedPlaceholder || cleanedPlaceholder.length < 2) {
    cleanedPlaceholder = "this value";
  }

  return `What is the ${cleanedPlaceholder}?`;
}

export async function POST(request: Request) {
  try {
    const { placeholder, documentContext, userApiKey } = await request.json();

    if (!placeholder) {
      return NextResponse.json(
        { error: "Placeholder is required" },
        { status: 400 }
      );
    }

    // Get OpenAI client (user key or default)
    const openai = getOpenAIClient(userApiKey);

    // If no OpenAI API key, use deterministic fallback
    if (!openai) {
      console.log("No OpenAI API key found, using deterministic question generation");
      return NextResponse.json({
        question: generateDeterministicQuestion(placeholder),
        source: "deterministic",
      });
    }

    // Generate AI-enhanced question
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Cost-efficient model
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant for legal document filling. Generate a clear, professional, and conversational question to ask the user for the value of a placeholder in their legal document. Keep questions concise (under 20 words). Be direct and friendly. Do not include the placeholder syntax in your question.",
          },
          {
            role: "user",
            content: `Generate a question to ask for this placeholder: "${placeholder}"\n\nDocument context (first 500 chars): ${documentContext?.substring(0, 500) || "Legal document"}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      const aiQuestion = completion.choices[0]?.message?.content?.trim();

      if (!aiQuestion) {
        throw new Error("Empty response from OpenAI");
      }

      console.log(`AI question generated for "${placeholder}": ${aiQuestion}`);

      return NextResponse.json({
        question: aiQuestion,
        source: "ai",
      });
    } catch (aiError) {
      // If AI fails, fall back to deterministic
      console.error("OpenAI API error, falling back to deterministic:", aiError);
      return NextResponse.json({
        question: generateDeterministicQuestion(placeholder),
        source: "deterministic-fallback",
      });
    }
  } catch (error) {
    console.error("Error in generate-question endpoint:", error);
    return NextResponse.json(
      { error: "Failed to generate question" },
      { status: 500 }
    );
  }
}
