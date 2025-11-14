import { NextResponse } from "next/server";
import mammoth from "mammoth";

function extractPlaceholders(text: string): string[] {
  // Enhanced regex to match common placeholder patterns:
  // - [Company Name], $[Amount], {variable}
  // - Standalone underscores: ___ (3+)
  // - Empty brackets: [ ], [  ]
  // - Common indicators: [TBD], [INSERT], [FILL IN]
  const placeholderRegex = /\$?\[[^\]]*\]|\{[^}]+\}|_{3,}|\[TBD\]|\[INSERT\]|\[FILL IN\]/gi;
  const matches = text.match(placeholderRegex) ?? [];
  const unique = new Set<string>();

  matches.forEach((match) => {
    const trimmed = match.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  });

  return Array.from(unique);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "A .docx file is required" },
      { status: 400 },
    );
  }

  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json(
      { error: "Only .docx files are supported" },
      { status: 400 },
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ buffer }),
      mammoth.extractRawText({ buffer }),
    ]);

    const templateHtml = htmlResult.value ?? "";
    const templateText = textResult.value ?? "";
    const placeholders = extractPlaceholders(templateText);

    return NextResponse.json({ templateHtml, templateText, placeholders });
  } catch (error) {
    console.error("Failed to parse document", error);
    return NextResponse.json(
      { error: "Unable to parse document. Please try a different file." },
      { status: 500 },
    );
  }
}
