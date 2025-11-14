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
    
    // Get the document.xml content for manual replacement
    const documentXml = zip.file("word/document.xml")?.asText();
    
    if (!documentXml) {
      return NextResponse.json(
        { error: "Invalid document format" },
        { status: 400 }
      );
    }

    // Perform manual text replacement for all placeholder formats
    let modifiedXml = documentXml;
    Object.entries(answers as Record<string, string>).forEach(([placeholder, value]) => {
      // Escape special XML characters in the value
      const escapedValue = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      
      // Replace the placeholder (it might be split across XML tags)
      // We need to handle cases where Word splits the text across multiple runs
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedPlaceholder, "g");
      modifiedXml = modifiedXml.replace(regex, escapedValue);
    });

    // Update the zip with modified content
    zip.file("word/document.xml", modifiedXml);

    console.log("Replaced placeholders:", Object.keys(answers));

    // Generate the filled document
    const filledBuffer = zip.generate({
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
