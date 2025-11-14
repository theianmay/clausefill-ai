import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";

export async function POST(request: Request) {
  try {
    const { templateText, answers } = await request.json();

    if (!templateText || typeof templateText !== "string") {
      return NextResponse.json(
        { error: "Template text is required" },
        { status: 400 }
      );
    }

    // Replace placeholders with answers
    let filledText = templateText;
    Object.entries(answers as Record<string, string>).forEach(([placeholder, value]) => {
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedPlaceholder, "g");
      filledText = filledText.replace(regex, value);
    });

    // Split text into paragraphs
    const paragraphs = filledText.split("\n").map((line) => {
      return new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: 24, // 12pt font
          }),
        ],
        spacing: {
          after: 200, // spacing after paragraph
        },
      });
    });

    // Create document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Return as downloadable file
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="completed-document-${Date.now()}.docx"`,
      },
    });
  } catch (error) {
    console.error("Failed to generate document", error);
    return NextResponse.json(
      { error: "Unable to generate document. Please try again." },
      { status: 500 }
    );
  }
}
