"use client";

import { useCallback, useMemo, useRef, useState } from "react";

// Enhanced regex to match common placeholder patterns:
// - [Company Name], $[Amount], {variable}
// - Standalone underscores: ___ (3+)
// - Empty brackets: [ ], [  ]
// - Common indicators: [TBD], [INSERT], [FILL IN]
const PLACEHOLDER_REGEX = /\$?\[[^\]]*\]|\{[^}]+\}|_{3,}|\[TBD\]|\[INSERT\]|\[FILL IN\]/gi;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB limit for Vercel serverless

const sampleTemplateText = `SAFE Agreement

This SAFE agreement (the "Agreement") is made on [Date of Safe] between [Company Name], a Delaware corporation (the "Company"), and [Investor Name] (the "Investor").

The Investor agrees to invest $[Investment Amount] in exchange for the right to certain shares representing {equity_percent} of the Company.

The Company will use the funds to pursue its business plan in the [Company Focus Area].`;

const sampleTemplateHtml = `
  <h2>Sample SAFE Agreement</h2>
  <p>
    This SAFE agreement (the <em>"Agreement"</em>) is made on <strong>[Date of Safe]</strong>
    between <strong>[Company Name]</strong>, a Delaware corporation (the
    <em>"Company"</em>), and <strong>[Investor Name]</strong> (the <em>"Investor"</em>).
  </p>
  <p>
    The Investor agrees to invest <strong>$[Investment Amount]</strong> in exchange for
    the right to certain shares representing <strong>{equity_percent}</strong> of the Company.
  </p>
  <p>
    The Company will use the funds to pursue its business plan in the
    <strong>[Company Focus Area]</strong>.
  </p>
`;

const formatBytes = (value: number) => {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
};

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [documentMeta, setDocumentMeta] = useState<{ name: string; size: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const placeholderBadge = useMemo(() => {
    if (!placeholders.length) return "No placeholders detected yet";
    return `${placeholders.length} placeholder${placeholders.length === 1 ? "" : "s"}`;
  }, [placeholders.length]);

  const extractPlaceholders = useCallback((text: string) => {
    const matches = text.match(PLACEHOLDER_REGEX) ?? [];
    return Array.from(new Set(matches.map((match) => match.trim())));
  }, []);

  const highlightedHtml = useMemo(() => {
    if (!templateHtml) return "";
    
    let highlighted = templateHtml;
    
    // Replace each placeholder with a highlighted version
    placeholders.forEach((placeholder) => {
      const isFilled = answers[placeholder] !== undefined;
      const displayValue = isFilled ? answers[placeholder] : placeholder;
      const bgColor = isFilled ? "bg-emerald-100" : "bg-amber-100";
      const textColor = isFilled ? "text-emerald-900" : "text-amber-900";
      
      // Escape special regex characters in placeholder
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedPlaceholder, "g");
      
      highlighted = highlighted.replace(
        regex,
        `<mark class="px-1 py-0.5 rounded ${bgColor} ${textColor} font-medium">${displayValue}</mark>`
      );
    });
    
    return highlighted;
  }, [templateHtml, placeholders, answers]);

  const generateQuestion = useCallback((placeholder: string) => {
    // Convert placeholder to a natural question
    // e.g., "[Company Name]" -> "What is the Company Name?"
    let cleanedPlaceholder = placeholder
      .replace(/^\$?\[|\]$/g, "") // Remove brackets
      .replace(/^\{|\}$/g, "") // Remove curly braces
      .replace(/_+/g, "") // Remove underscores
      .trim();

    if (!cleanedPlaceholder) {
      cleanedPlaceholder = "this value";
    }

    return `What is the ${cleanedPlaceholder}?`;
  }, []);

  const handleParsedDocument = useCallback(
    (name: string, html: string, text: string) => {
      setTemplateHtml(html);
      setTemplateText(text);
      const extractedPlaceholders = extractPlaceholders(text);
      setPlaceholders(extractedPlaceholders);
      setDocumentMeta({ name, size: formatBytes(text.length * 2) });
      setLastUpdated(new Date().toLocaleTimeString());
      setAnswers({});
      setCurrentPlaceholderIndex(0);

      // Start conversation if placeholders exist
      if (extractedPlaceholders.length > 0) {
        setMessages([
          {
            role: "assistant",
            content: `Great! I found ${extractedPlaceholders.length} placeholder${extractedPlaceholders.length === 1 ? "" : "s"} in your document. Let's fill them in one by one.`,
          },
          {
            role: "assistant",
            content: generateQuestion(extractedPlaceholders[0]),
          },
        ]);
      } else {
        setMessages([
          {
            role: "assistant",
            content: "I didn't find any placeholders in this document. Placeholders should be formatted like [Company Name], $[Amount], {variable}, ___, or [ ]. You can upload a different document or download this one as-is.",
          },
        ]);
      }
    },
    [extractPlaceholders, generateQuestion],
  );

  const parseDocument = useCallback(
    async (file: File) => {
      setIsParsing(true);
      setUploadError(null);
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/parse-document", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to parse document");
        }

        handleParsedDocument(file.name, data.templateHtml ?? "", data.templateText ?? "");
      } catch (error) {
        console.error(error);
        setUploadError(error instanceof Error ? error.message : "Unexpected error");
      } finally {
        setIsParsing(false);
      }
    },
    [handleParsedDocument],
  );

  const handleFile = useCallback(
    (file?: File) => {
      if (!file) return;

      const isDocx =
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx");

      if (!isDocx) {
        setUploadError("Only .docx files are supported");
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError("File is too large (max 4 MB)");
        return;
      }

      setDocumentMeta({ name: file.name, size: formatBytes(file.size) });
      void parseDocument(file);
    },
    [parseDocument],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      const file = event.dataTransfer.files?.[0];
      handleFile(file);
    },
    [handleFile],
  );

  const applySampleDocument = useCallback(() => {
    handleParsedDocument("Sample SAFE Template.docx", sampleTemplateHtml, sampleTemplateText);
    setUploadError(null);
  }, [handleParsedDocument]);

  const handleSubmitAnswer = useCallback(() => {
    if (!userInput.trim() || currentPlaceholderIndex >= placeholders.length) return;

    const currentPlaceholder = placeholders[currentPlaceholderIndex];
    const newAnswers = { ...answers, [currentPlaceholder]: userInput.trim() };

    // Add user message
    const newMessages = [
      ...messages,
      { role: "user" as const, content: userInput.trim() },
    ];

    setAnswers(newAnswers);
    setUserInput("");

    // Move to next placeholder
    const nextIndex = currentPlaceholderIndex + 1;
    setCurrentPlaceholderIndex(nextIndex);

    if (nextIndex < placeholders.length) {
      // Ask next question
      newMessages.push({
        role: "assistant",
        content: generateQuestion(placeholders[nextIndex]),
      });
    } else {
      // All done
      newMessages.push({
        role: "assistant",
        content: "Perfect! All placeholders have been filled. You can now review the completed document and download it.",
      });
    }

    setMessages(newMessages);
  }, [userInput, currentPlaceholderIndex, placeholders, answers, messages, generateQuestion]);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/generate-doc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateText,
          answers,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate document");
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `completed-document-${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed", error);
      alert("Failed to download document. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [templateText, answers]);

  return (
    <div className="min-h-screen bg-slate-50 py-12 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <span>Project status</span>
            <span className="text-emerald-600">Phase 5: Polished & Ready</span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Clausefill-AI</h1>
              <p className="mt-2 max-w-3xl text-base text-slate-600">
                Turn legal templates into guided conversations. Upload your .docx document, and I'll detect placeholders, 
                ask you questions to fill them in, then generate a completed document ready to download.
              </p>
            </div>
            {documentMeta && (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Current document</p>
                <p>{documentMeta.name}</p>
                <p className="text-xs text-slate-500">Updated {lastUpdated || "just now"}</p>
              </div>
            )}
          </div>
        </header>

        <section className={`grid gap-8 ${templateHtml ? "lg:grid-cols-[minmax(0,320px),1fr,minmax(0,380px)]" : "lg:grid-cols-[minmax(0,360px),1fr]"}`}>
          <div className="space-y-6">
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Document uploader
              </p>
              <label
                htmlFor="document-upload"
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
                className={`mt-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition
                  ${
                    isDragActive
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }
                `}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="mb-4 h-12 w-12"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-base font-medium text-slate-900">Drag &amp; drop your .docx</p>
                <p className="text-sm text-slate-500">or click to choose a file up to 4&nbsp;MB</p>
                <input
                  ref={fileInputRef}
                  id="document-upload"
                  type="file"
                  accept=".docx"
                  className="sr-only"
                  onChange={handleInputChange}
                />
              </label>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <p>Supported format: .docx (Word)</p>
                <button
                  type="button"
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse files
                </button>
              </div>
              {uploadError && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {uploadError}
                </p>
              )}
              {isParsing && (
                <p className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                  Parsing document…
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Quick start
              </p>
              <p className="mt-2 text-sm text-slate-600">No .docx handy? Load a ready-made SAFE sample to try it out.</p>
              <button
                type="button"
                onClick={applySampleDocument}
                className="mt-4 w-full rounded-2xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                Use sample document
              </button>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">Supported placeholder formats:</p>
                <ul className="space-y-0.5 ml-3">
                  <li>• Square brackets: <code className="bg-white px-1 rounded">[Company Name]</code></li>
                  <li>• With dollar sign: <code className="bg-white px-1 rounded">$[Amount]</code></li>
                  <li>• Curly braces: <code className="bg-white px-1 rounded">{`{variable}`}</code></li>
                  <li>• Underscores: <code className="bg-white px-1 rounded">___</code></li>
                  <li>• Empty brackets: <code className="bg-white px-1 rounded">[ ]</code></li>
                </ul>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Parse summary
              </p>
              <dl className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <dt>Document</dt>
                  <dd className="font-medium text-slate-900">{documentMeta?.name ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Size</dt>
                  <dd className="font-medium text-slate-900">{documentMeta?.size ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Placeholders</dt>
                  <dd className="font-medium text-slate-900">{placeholderBadge}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Detected placeholders
              </p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {placeholders.length ? (
                  <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50">
                    {placeholders.map((placeholder) => {
                      const isFilled = answers[placeholder] !== undefined;
                      return (
                        <li key={placeholder} className="flex items-center justify-between px-4 py-2">
                          <span className="font-mono text-xs text-slate-500">{placeholder}</span>
                          <span className={isFilled ? "text-emerald-600" : "text-amber-600"}>
                            {isFilled ? "Filled" : "Pending"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-slate-500">Placeholder keys will appear after parsing.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Document preview
                </p>
                <p className="text-sm text-slate-500">Rendered directly from the parsed HTML</p>
              </div>
              {templateText && (
                <p className="text-xs text-slate-400">{templateText.split(" ").length} words</p>
              )}
            </div>
            <div className="mt-6 h-[560px] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-6 text-base leading-relaxed text-slate-800">
              {highlightedHtml ? (
                <article className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                  <p className="text-base font-medium">Upload a document to see it here</p>
                  <p className="mt-2 text-sm">Your parsed, scrollable preview will appear in this panel.</p>
                </div>
              )}
            </div>
          </div>

          {templateHtml && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col h-[calc(100vh-200px)] max-h-[800px]">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Conversational Fill
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {currentPlaceholderIndex < placeholders.length
                      ? `${currentPlaceholderIndex + 1} of ${placeholders.length}`
                      : "Complete"}
                  </p>
                </div>
                <div className="text-xs text-slate-400">
                  {Object.keys(answers).length}/{placeholders.length} filled
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              {currentPlaceholderIndex < placeholders.length && (
                <div className="border-t border-slate-200 pt-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSubmitAnswer();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="Type your answer..."
                      autoFocus
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      aria-label="Answer input"
                    />
                    <button
                      type="submit"
                      disabled={!userInput.trim()}
                      className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Send
                    </button>
                  </form>
                </div>
              )}

              {((currentPlaceholderIndex >= placeholders.length && placeholders.length > 0) || 
                (placeholders.length === 0 && templateHtml)) && (
                <div className="border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDownloading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </>
                    ) : (
                      placeholders.length === 0 ? "Download Document" : "Download Completed Document"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="mt-12 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          <div className="space-y-2">
            <p>
              <strong className="text-slate-700">How it works:</strong> Upload a .docx template → 
              Placeholders are detected → Answer questions conversationally → Download completed document
            </p>
            <p className="text-xs">
              All processing happens in your browser session. No data is stored or shared.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
