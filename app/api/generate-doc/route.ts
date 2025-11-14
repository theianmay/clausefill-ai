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

    // Word often splits placeholders across <w:t> tags within a paragraph
    // Strategy: For each paragraph, extract all text, do replacement, rebuild with single <w:t>
    let modifiedXml = documentXml;
    
    Object.entries(answers as Record<string, string>).forEach(([placeholder, value]) => {
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedPlaceholder, "g");
      
      // Process each paragraph block
      modifiedXml = modifiedXml.replace(
        /(<w:p\b[^>]*>)([\s\S]*?)(<\/w:p>)/g,
        (fullMatch: string, openTag: string, content: string, closeTag: string) => {
          // Extract all text from <w:t> tags in this paragraph
          const textMatches = content.match(/<w:t\b[^>]*>.*?<\/w:t>/g);
          if (!textMatches) return fullMatch;
          
          let plainText = "";
          textMatches.forEach((tag: string) => {
            const textContent = tag.replace(/<w:t\b[^>]*>(.*?)<\/w:t>/, "$1");
            plainText += textContent;
          });
          
          // Check if this paragraph contains our placeholder
          if (!regex.test(plainText)) {
            return fullMatch; // No match, return unchanged
          }
          
          console.log(`Found "${placeholder}" in paragraph, replacing with "${value}"`);
          
          // Replace placeholder in the plain text
          const replacedText = plainText.replace(regex, value);
          
          // Escape XML special characters in the REPLACED text
          const escapedText = replacedText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          
          // Strategy: Keep the first <w:r> tag with all its formatting,
          // but replace ALL <w:t> content with our single replaced text
          let firstRun = true;
          const modifiedContent = content.replace(
            /(<w:r\b[^>]*>)([\s\S]*?)(<\/w:r>)/g,
            (rMatch: string, rOpen: string, rContent: string, rClose: string) => {
              if (firstRun) {
                firstRun = false;
                // Keep formatting properties but replace text content
                const cleanedContent = rContent.replace(/<w:t\b[^>]*>.*?<\/w:t>/g, "");
                // Add our single <w:t> with the fully replaced paragraph text
                return rOpen + cleanedContent + `<w:t>${escapedText}</w:t>` + rClose;
              }
              // Remove subsequent runs that contained parts of the placeholder
              return "";
            }
          );
          
          return openTag + modifiedContent + closeTag;
        }
      );
    });

    console.log("Replacement complete");

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
