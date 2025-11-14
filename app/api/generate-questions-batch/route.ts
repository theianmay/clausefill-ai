import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkRateLimit, getRateLimitConfig } from "@/app/lib/rate-limiter";

const defaultApiKey = process.env.OPENAI_API_KEY;

function getOpenAIClient(userApiKey?: string): OpenAI | null {
  const apiKey = userApiKey || defaultApiKey;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp;
  return "unknown";
}

interface PlaceholderGroup {
  placeholder: string;
  type: "company" | "person" | "date" | "amount" | "address" | "email" | "phone" | "other";
  question: string;
}

// Analyze placeholder to determine its type
function analyzePlaceholder(placeholder: string): PlaceholderGroup["type"] {
  const lower = placeholder.toLowerCase();
  
  // Amount detection
  if (placeholder.startsWith("$") || /amount|price|cost|fee|payment|salary|compensation/i.test(lower)) {
    return "amount";
  }
  
  // Company detection
  if (/company|corporation|corp|llc|inc|organization|employer/i.test(lower)) {
    return "company";
  }
  
  // Person detection
  if (/name|employee|investor|founder|officer|director|signatory|recipient/i.test(lower)) {
    return "person";
  }
  
  // Date detection
  if (/date|day|month|year|effective|expiration|deadline/i.test(lower)) {
    return "date";
  }
  
  // Address detection
  if (/address|street|city|state|zip|location/i.test(lower)) {
    return "address";
  }
  
  // Email detection
  if (/email|e-mail/i.test(lower)) {
    return "email";
  }
  
  // Phone detection
  if (/phone|telephone|mobile|cell/i.test(lower)) {
    return "phone";
  }
  
  return "other";
}

// Generate deterministic fallback questions
function generateFallbackQuestions(placeholders: string[]): PlaceholderGroup[] {
  return placeholders.map(placeholder => {
    const type = analyzePlaceholder(placeholder);
    let question = "";
    
    const cleanPlaceholder = placeholder
      .replace(/^\$?\[/, "")
      .replace(/\]$/, "")
      .replace(/^\{/, "")
      .replace(/\}$/, "")
      .replace(/_{3,}/, "")
      .trim() || "this value";
    
    switch (type) {
      case "amount":
        question = `What is the dollar amount for ${cleanPlaceholder}?`;
        break;
      case "company":
        question = `What is the company name for ${cleanPlaceholder}?`;
        break;
      case "person":
        question = `What is the person's name for ${cleanPlaceholder}?`;
        break;
      case "date":
        question = `What is the date for ${cleanPlaceholder}?`;
        break;
      case "address":
        question = `What is the address for ${cleanPlaceholder}?`;
        break;
      case "email":
        question = `What is the email address for ${cleanPlaceholder}?`;
        break;
      case "phone":
        question = `What is the phone number for ${cleanPlaceholder}?`;
        break;
      default:
        question = `What is the ${cleanPlaceholder}?`;
    }
    
    return { placeholder, type, question };
  });
}

export async function POST(request: Request) {
  try {
    const { placeholders, documentContext, userApiKey } = await request.json();

    if (!placeholders || !Array.isArray(placeholders) || placeholders.length === 0) {
      return NextResponse.json(
        { error: "Placeholders array is required" },
        { status: 400 }
      );
    }

    // Rate limiting: Only apply when using default API key
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
            message: `You've reached the maximum of ${config.maxRequests} AI questions per hour.`,
            resetTime: rateLimit.resetTime,
            fallbackQuestions: generateFallbackQuestions(placeholders),
          },
          { status: 429 }
        );
      }
      
      console.log(`Batch rate limit check passed for IP: ${clientIP}, remaining: ${rateLimit.remaining}`);
    }

    const openai = getOpenAIClient(userApiKey);

    // If no OpenAI API key, use deterministic fallback
    if (!openai) {
      console.log("No OpenAI API key found, using deterministic question generation");
      return NextResponse.json({
        questions: generateFallbackQuestions(placeholders),
        source: "deterministic",
      });
    }

    // Generate AI-enhanced questions in batch
    try {
      // Analyze placeholders first
      const analyzedPlaceholders = placeholders.map(p => ({
        placeholder: p,
        type: analyzePlaceholder(p),
      }));

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert assistant for legal document filling. Your task is to generate clear, professional, conversational questions for each placeholder in a legal document.

RULES:
1. Keep each question under 15 words
2. Be direct and friendly
3. Don't include placeholder syntax in questions
4. Recognize placeholder patterns:
   - $ prefix or "amount/price/cost" = monetary value
   - "company/corp/organization" = company name
   - "name/employee/investor" = person's name
   - "date/day/month/year" = date value
   - Underscores (___) = blank field to fill

OUTPUT FORMAT:
Return a JSON array with one object per placeholder:
[
  {"placeholder": "[Company Name]", "question": "What is the company's legal name?"},
  {"placeholder": "$[Amount]", "question": "What is the investment amount in dollars?"}
]

Be contextually aware - if multiple similar placeholders exist (like [Company Name] and [COMPANY]), they likely need the same value.`,
          },
          {
            role: "user",
            content: `Generate questions for these placeholders from a legal document:

${analyzedPlaceholders.map((p, i) => `${i + 1}. "${p.placeholder}" (type: ${p.type})`).join("\n")}

Document context: ${documentContext?.substring(0, 800) || "Legal agreement"}

Return ONLY the JSON array, no other text.`,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent output
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const aiResponse = completion.choices[0]?.message?.content?.trim();
      
      if (!aiResponse) {
        throw new Error("Empty response from OpenAI");
      }

      console.log("Raw AI response:", aiResponse.substring(0, 200) + "...");

      // Parse AI response
      let parsed;
      try {
        parsed = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error("Failed to parse AI response:", aiResponse);
        console.error("Parse error:", parseError);
        throw new Error("Invalid JSON response from AI");
      }
      
      console.log("Parsed response type:", typeof parsed);
      console.log("Parsed response keys:", Object.keys(parsed));
      
      // Extract questions array - handle different response formats
      let questions: PlaceholderGroup[];
      
      if (Array.isArray(parsed)) {
        questions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else if (typeof parsed === 'object') {
        // Try to extract from any array property
        const arrayProp = Object.values(parsed).find(v => Array.isArray(v));
        if (arrayProp && Array.isArray(arrayProp)) {
          questions = arrayProp as PlaceholderGroup[];
        } else {
          throw new Error("No questions array found in response");
        }
      } else {
        throw new Error("Unexpected response format");
      }
      
      // Validate we have questions
      if (!questions || questions.length === 0) {
        throw new Error("No questions generated");
      }

      console.log(`AI batch generated ${questions.length} questions`);

      return NextResponse.json({
        questions,
        source: "ai",
      });
    } catch (aiError) {
      console.error("OpenAI API error, falling back to deterministic:", aiError);
      return NextResponse.json({
        questions: generateFallbackQuestions(placeholders),
        source: "deterministic-fallback",
      });
    }
  } catch (error) {
    console.error("Error in generate-questions-batch endpoint:", error);
    return NextResponse.json(
      { error: "Failed to generate questions" },
      { status: 500 }
    );
  }
}
