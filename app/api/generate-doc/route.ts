import { NextResponse } from "next/server";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

export async function POST(request: Request) {
  try {
    const { originalFileBase64, answers, originalFilename } = await request.json();

    if (!originalFileBase64 || typeof originalFileBase64 !== "string") {
      return NextResponse.json(
        { error: "Original file is required" },
        { status: 400 }
      );
    }

    // Convert base64 back to buffer
    const buffer = Buffer.from(originalFileBase64, "base64");

    // Load the docx file as binary content
    const zip = new PizZip(buffer);
    
    // Prepare data for replacement
    // Convert placeholder keys to template-friendly format
    const templateData: Record<string, string> = {};
    Object.entries(answers as Record<string, string>).forEach(([placeholder, value]) => {
      // Remove brackets and special chars to create clean keys
      let cleanKey = placeholder
        .replace(/^\$?\[|\]$/g, "") // Remove [ ] and $
        .replace(/^\{|\}$/g, "") // Remove { }
        .replace(/_{3,}/g, "") // Remove underscores
        .trim()
        .replace(/\s+/g, "_"); // Replace spaces with underscores

      templateData[cleanKey] = value;
      
      // Also keep original placeholder as key for direct replacement
      templateData[placeholder] = value;
    });

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Use render() with data directly (new API)
    try {
      doc.render(templateData);
    } catch (error) {
      console.error("Error rendering template:", error);
      // If rendering fails, try simple text replacement as fallback
      return NextResponse.json(
        { error: "Unable to fill placeholders. The document format may not be compatible." },
        { status: 500 }
      );
    }

    // Generate the filled document
    const filledBuffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    }) as Buffer;

    // Return as downloadable file
    const filename = originalFilename || "document.docx";
    const nameWithoutExt = filename.replace(/\.docx$/i, "");
    
    return new NextResponse(Buffer.from(filledBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nameWithoutExt}-clausefill-ai-v1.docx"`,
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
