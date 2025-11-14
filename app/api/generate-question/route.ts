import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkRateLimit, getRateLimitConfig } from "@/app/lib/rate-limiter";

// Initialize OpenAI client with default or user-provided key
const defaultApiKey = process.env.OPENAI_API_KEY;

function getOpenAIClient(userApiKey?: string): OpenAI | null {
  const apiKey = userApiKey || defaultApiKey;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

function getClientIP(request: Request): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIp) {
    return realIp;
  }
  
  // Fallback to a generic identifier
  return "unknown";
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

    // Rate limiting: Only apply when using default API key (not user's key)
    if (!userApiKey && defaultApiKey) {
      const clientIP = getClientIP(request);
      const rateLimit = checkRateLimit(clientIP);
      
      if (!rateLimit.allowed) {
        const resetDate = new Date(rateLimit.resetTime);
        const config = getRateLimitConfig();
        console.log(`Rate limit exceeded for IP: ${clientIP}`);
        
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            message: `You've reached the maximum of ${config.maxRequests} AI questions per hour. Please try again after ${resetDate.toLocaleTimeString()}, or provide your own OpenAI API key.`,
            resetTime: rateLimit.resetTime,
            fallbackQuestion: generateDeterministicQuestion(placeholder),
          },
          { 
            status: 429,
            headers: {
              "X-RateLimit-Limit": config.maxRequests.toString(),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": rateLimit.resetTime.toString(),
            }
          }
        );
      }
      
      console.log(`Rate limit check passed for IP: ${clientIP}, remaining: ${rateLimit.remaining}`);
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
              "You are a helpful assistant for legal document filling. Generate a clear, professional, and conversational question to ask the user for the value of a placeholder in their legal document. Keep questions concise (under 20 words). Be direct and friendly. Do not include the placeholder syntax in your question.\n\nImportant: Pay attention to placeholder formatting:\n- Placeholders starting with $ (like $[___]) are typically dollar amounts\n- Placeholders with underscores (___) are typically amounts or blank fields\n- Placeholders in [brackets] are typically names, dates, or text values",
          },
          {
            role: "user",
            content: `Generate a question to ask for this placeholder: "${placeholder}"\n\nDocument context (first 500 chars): ${documentContext?.substring(0, 500) || "Legal document"}\n\nNote: If the placeholder starts with $ or contains only underscores, it's likely a monetary amount.`,
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
