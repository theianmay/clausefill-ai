"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [originalFileBuffer, setOriginalFileBuffer] = useState<ArrayBuffer | null>(null);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [documentMeta, setDocumentMeta] = useState<{ name: string; size: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [questionCache, setQuestionCache] = useState<Record<string, string>>({});

  const placeholderBadge = useMemo(() => {
    if (!placeholders.length) return "No placeholders detected yet";
    return `${placeholders.length} placeholder${placeholders.length === 1 ? "" : "s"}`;
  }, [placeholders.length]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // Generate all questions at once (batch)
  const generateAllQuestions = useCallback(async (placeholderList: string[]): Promise<Record<string, string>> => {
    try {
      const response = await fetch("/api/generate-questions-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeholders: placeholderList,
          documentContext: templateText,
          userApiKey: userApiKey || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate questions");
      }

      const data = await response.json();
      const cache: Record<string, string> = {};
      
      // Handle both array and object responses
      const questionsList = Array.isArray(data.questions) 
        ? data.questions 
        : Array.isArray(data) 
          ? data 
          : [];
      
      if (questionsList.length === 0) {
        throw new Error("No questions returned from API");
      }
      
      questionsList.forEach((q: { placeholder: string; question: string }) => {
        cache[q.placeholder] = q.question;
      });
      
      console.log(`Generated ${Object.keys(cache).length} questions in batch`);
      return cache;
    } catch (error) {
      console.error("Error generating batch questions:", error);
      // Fallback to simple questions
      const cache: Record<string, string> = {};
      placeholderList.forEach(p => {
        const clean = p.replace(/^\$?\[|\]$/g, "").replace(/^\{|\}$/g, "").replace(/_+/g, "").trim() || "this value";
        cache[p] = `What is the ${clean}?`;
      });
      return cache;
    }
  }, [templateText, userApiKey]);

  const generateQuestion = useCallback(async (placeholder: string): Promise<string> => {
    // Check cache first
    if (questionCache[placeholder]) {
      return questionCache[placeholder];
    }
    
    // Fallback to individual generation if not in cache
    try {
      // Call AI endpoint to generate contextual question
      const response = await fetch("/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeholder,
          documentContext: templateText,
          userApiKey: userApiKey || undefined,
        }),
      });

      if (!response.ok) {
        // Handle rate limit error
        if (response.status === 429) {
          const data = await response.json();
          console.warn("Rate limit exceeded:", data.message);
          // Use fallback question from response or generate one
          if (data.fallbackQuestion) {
            return data.fallbackQuestion;
          }
        }
        throw new Error("Failed to generate question");
      }

      const data = await response.json();
      return data.question;
    } catch (error) {
      console.error("Error generating question, using fallback:", error);
      
      // Fallback to deterministic question
      let cleanedPlaceholder = placeholder
        .replace(/^\$?\[|\]$/g, "")
        .replace(/^\{|\}$/g, "")
        .replace(/_+/g, "")
        .trim();

      if (!cleanedPlaceholder) {
        cleanedPlaceholder = "this value";
      }

      return `What is the ${cleanedPlaceholder}?`;
    }
  }, [templateText, userApiKey]);

  const handleParsedDocument = useCallback(
    async (name: string, html: string, text: string) => {
      setTemplateHtml(html);
      setTemplateText(text);
      setPlaceholders(extractPlaceholders(text));
      setDocumentMeta({ name, size: formatBytes(text.length * 2) });
      setLastUpdated(new Date().toLocaleTimeString());

      const extractedPlaceholders = extractPlaceholders(text);
      if (extractedPlaceholders.length > 0) {
        // Generate ALL questions at once (batch)
        setIsTyping(true);
        
        // Generate questions in background
        const questionsPromise = generateAllQuestions(extractedPlaceholders);
        
        setTimeout(async () => {
          setMessages([
            {
              role: "assistant",
              content: `Great! I found ${extractedPlaceholders.length} placeholder${extractedPlaceholders.length === 1 ? "" : "s"} in your document. Let's fill them in one by one.`,
            },
          ]);
          setIsTyping(false);
          
          // Wait for questions to be generated
          const generatedQuestions = await questionsPromise;
          setQuestionCache(generatedQuestions);
          
          // Show typing indicator again, then first question
          setTimeout(() => {
            setIsTyping(true);
            setTimeout(() => {
              setMessages([
                {
                  role: "assistant",
                  content: `Great! I found ${extractedPlaceholders.length} placeholder${extractedPlaceholders.length === 1 ? "" : "s"} in your document. Let's fill them in one by one.`,
                },
                {
                  role: "assistant",
                  content: generatedQuestions[extractedPlaceholders[0]] || `What is the ${extractedPlaceholders[0]}?`,
                },
              ]);
              setIsTyping(false);
            }, 500);
          }, 100);
        }, 500);
      } else {
        // Show typing indicator for no placeholders message
        setIsTyping(true);
        setTimeout(() => {
          setMessages([
            {
              role: "assistant",
              content: "⚠️ No placeholders detected in this document.\n\nFor best results, format placeholders like:\n• [Company Name]\n• $[Amount]\n• {variable}\n• ___ (3+ underscores)\n• [ ] (empty brackets)\n\nYou can:\n1. Upload a different document with placeholders\n2. Download this document as-is\n3. Edit your document to add placeholders and re-upload",
            },
          ]);
          setIsTyping(false);
        }, 500);
      }
    },
    [extractPlaceholders, generateAllQuestions],
  );

  const parseDocument = useCallback(
    async (file: File) => {
      setIsParsing(true);
      setUploadError(null);
      
      // Store original file buffer for formatting preservation
      const arrayBuffer = await file.arrayBuffer();
      setOriginalFileBuffer(arrayBuffer);
      
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
        const errorMessage = error instanceof Error ? error.message : "Unexpected error";
        setUploadError(`${errorMessage}. Please ensure your file is a valid .docx document and try again. If the problem persists, try opening and re-saving the document in Microsoft Word.`);
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

  const handleReset = useCallback(() => {
    // Clear all state
    setTemplateHtml("");
    setTemplateText("");
    setOriginalFileBuffer(null);
    setPlaceholders([]);
    setAnswers({});
    setDocumentMeta(null);
    setLastUpdated("");
    setMessages([]);
    setCurrentPlaceholderIndex(0);
    setUserInput("");
    setUploadError(null);
    setIsParsing(false);
    setIsDownloading(false);
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleSubmitAnswer = useCallback(() => {
    if (!userInput.trim() || currentPlaceholderIndex >= placeholders.length) return;

    const currentPlaceholder = placeholders[currentPlaceholderIndex];
    const isSkip = userInput.trim().toLowerCase() === "skip";
    
    // Add user message and show typing indicator
    setMessages([
      ...messages,
      { role: "user" as const, content: userInput.trim() },
    ]);
    setUserInput("");
    setIsTyping(true);

    // Simulate thinking delay, then generate AI question
    setTimeout(async () => {
      const newMessages = [...messages, { role: "user" as const, content: userInput.trim() }];

      let newAnswers = answers;
      if (!isSkip) {
        // Only save answer if not skipping
        newAnswers = { ...answers, [currentPlaceholder]: userInput.trim() };
        setAnswers(newAnswers);
      } else {
        // Acknowledge skip
        newMessages.push({
          role: "assistant",
          content: `Skipped "${currentPlaceholder}". Moving to the next one.`,
        });
      }

      // Move to next placeholder
      const nextIndex = currentPlaceholderIndex + 1;
      setCurrentPlaceholderIndex(nextIndex);

      if (nextIndex < placeholders.length) {
        // Generate AI question for next placeholder
        const nextQuestion = await generateQuestion(placeholders[nextIndex]);
        newMessages.push({
          role: "assistant",
          content: nextQuestion,
        });
      } else {
        // All done
        const filledCount = Object.keys(newAnswers).length;
        newMessages.push({
          role: "assistant",
          content: `Done! I've filled ${filledCount} of ${placeholders.length} placeholders. You can now review the completed document and download it.`,
        });
      }

      setMessages(newMessages);
      setIsTyping(false);
    }, 500);
  }, [userInput, currentPlaceholderIndex, placeholders, answers, messages, generateQuestion]);

  const handleSkipPlaceholder = useCallback(async (placeholderToSkip: string) => {
    const indexToSkip = placeholders.indexOf(placeholderToSkip);
    if (indexToSkip === -1 || indexToSkip !== currentPlaceholderIndex) return;

    // Show typing indicator
    setIsTyping(true);

    // Add system message about skip
    const newMessages = [
      ...messages,
      {
        role: "assistant" as const,
        content: `Skipped "${placeholderToSkip}". Moving to the next one.`,
      },
    ];

    // Move to next placeholder
    const nextIndex = currentPlaceholderIndex + 1;
    setCurrentPlaceholderIndex(nextIndex);

    if (nextIndex < placeholders.length) {
      // Generate AI question for next placeholder
      const nextQuestion = await generateQuestion(placeholders[nextIndex]);
      newMessages.push({
        role: "assistant",
        content: nextQuestion,
      });
    } else {
      // All done
      const filledCount = Object.keys(answers).length;
      newMessages.push({
        role: "assistant",
        content: `Done! I've filled ${filledCount} of ${placeholders.length} placeholders. You can now review the completed document and download it.`,
      });
    }

    setMessages(newMessages);
    setIsTyping(false);
  }, [placeholders, currentPlaceholderIndex, messages, answers, generateQuestion]);

  const handleDownload = useCallback(async () => {
    if (!originalFileBuffer) {
      alert("Original document not available. Please upload a document first.");
      return;
    }

    setIsDownloading(true);
    try {
      // Convert ArrayBuffer to base64
      const base64 = btoa(
        new Uint8Array(originalFileBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      const response = await fetch("/api/generate-doc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originalFileBase64: base64,
          answers,
          originalFilename: documentMeta?.name || "document.docx",
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
      
      // Generate filename with full suffix
      const originalName = documentMeta?.name || "document.docx";
      const nameWithoutExt = originalName.replace(/\.docx$/i, "");
      a.download = `${nameWithoutExt}-clausefill-ai-v1.docx`;
      
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
  }, [originalFileBuffer, answers, documentMeta]);

  return (
    <div className="min-h-screen py-12" style={{ background: "var(--md-sys-color-background)", color: "var(--md-sys-color-on-background)" }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide" style={{ background: "var(--md-sys-color-surface-container)", color: "var(--md-sys-color-on-surface-variant)" }}>
              <span>Project status</span>
              <span className="flex items-center gap-1" style={{ color: "var(--md-sys-color-success)" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: "var(--md-sys-color-success)" }}></span>
                Live
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Optional OpenAI API Key Input */}
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="OpenAI API Key (optional)"
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  className="rounded-full px-4 py-2 text-sm w-48 transition"
                  style={{ 
                    background: "var(--md-sys-color-surface-container-high)", 
                    color: "var(--md-sys-color-on-surface)",
                    border: "1px solid var(--md-sys-color-outline-variant)"
                  }}
                  title="Add your OpenAI API key for AI-enhanced questions, or leave empty to use default"
                />
              </div>
              {templateHtml && (
                <button
                  onClick={handleReset}
                  className="rounded-full px-4 py-2 text-sm font-semibold transition flex items-center gap-2"
                  style={{ background: "var(--md-sys-color-error-container)", color: "var(--md-sys-color-on-error-container)" }}
                  aria-label="Reset and start over"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </button>
              )}
              <ThemeToggle />
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight" style={{ color: "var(--md-sys-color-on-background)" }}>Clausefill-AI</h1>
              <p className="mt-2 max-w-3xl text-base" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                <strong>Fill legal documents faster with AI-guided conversations.</strong> Upload your .docx template, 
                answer questions in a chat, and download a perfectly formatted completed document.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" style={{ color: "var(--md-sys-color-primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Preserves formatting</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" style={{ color: "var(--md-sys-color-primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>No data stored</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" style={{ color: "var(--md-sys-color-primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Works in browser</span>
                </div>
              </div>
            </div>
            {documentMeta && (
              <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--md-sys-color-surface-container-high)", border: "1px solid var(--md-sys-color-outline-variant)", color: "var(--md-sys-color-on-surface-variant)" }}>
                <p className="font-medium" style={{ color: "var(--md-sys-color-on-surface)" }}>Current document</p>
                <p>{documentMeta.name}</p>
                <p className="text-xs" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>Updated {lastUpdated || "just now"}</p>
              </div>
            )}
          </div>
        </header>

        {/* Instructions Panel */}
        <div className="rounded-3xl border overflow-hidden" style={{ background: "var(--md-sys-color-surface-container)", borderColor: "var(--md-sys-color-outline-variant)" }}>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between p-6 text-left transition"
          >
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--md-sys-color-on-surface)" }}>
                📖 How to Use Clausefill-AI
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                Click to {showInstructions ? "hide" : "view"} step-by-step instructions
              </p>
            </div>
            <svg
              className={`w-6 h-6 transition-transform ${showInstructions ? "rotate-180" : ""}`}
              style={{ color: "var(--md-sys-color-on-surface-variant)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showInstructions && (
            <div className="px-6 pb-6 space-y-4 border-t" style={{ borderColor: "var(--md-sys-color-outline-variant)", color: "var(--md-sys-color-on-surface-variant)" }}>
              <div className="grid md:grid-cols-3 gap-6 mt-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)" }}>1</div>
                    <h3 className="font-semibold" style={{ color: "var(--md-sys-color-on-surface)" }}>Upload Document</h3>
                  </div>
                  <p className="text-sm">Upload your .docx legal template. Make sure placeholders are formatted like [Company Name] or {`{variable}`}.</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)" }}>2</div>
                    <h3 className="font-semibold" style={{ color: "var(--md-sys-color-on-surface)" }}>Answer Questions</h3>
                  </div>
                  <p className="text-sm">I'll ask you questions for each placeholder. Type your answers in the chat. You can type "skip" to skip any placeholder.</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)" }}>3</div>
                    <h3 className="font-semibold" style={{ color: "var(--md-sys-color-on-surface)" }}>Download</h3>
                  </div>
                  <p className="text-sm">Review the filled document in the preview, then download your completed document with all formatting preserved.</p>
                </div>
              </div>
              
              <div className="mt-6 p-4 rounded-xl" style={{ background: "var(--md-sys-color-surface-container-high)" }}>
                <h4 className="font-semibold mb-2" style={{ color: "var(--md-sys-color-on-surface)" }}>✨ Supported Placeholder Formats:</h4>
                <div className="grid sm:grid-cols-2 gap-2 text-sm">
                  <div>• <code className="px-2 py-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>[Company Name]</code></div>
                  <div>• <code className="px-2 py-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>$[Amount]</code></div>
                  <div>• <code className="px-2 py-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>{`{variable}`}</code></div>
                  <div>• <code className="px-2 py-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>___</code> (3+ underscores)</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <section className={`grid gap-8 ${templateHtml ? "lg:grid-cols-[minmax(0,320px),1fr,minmax(0,380px)]" : "lg:grid-cols-[minmax(0,360px),1fr]"}`}>
          <div className="space-y-6">
            <div className="rounded-3xl border border-dashed p-6 shadow-sm" style={{ background: "var(--md-sys-color-surface-container)", borderColor: "var(--md-sys-color-outline-variant)" }}>
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
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
                className="mt-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition"
                style={{
                  background: isDragActive ? "var(--md-sys-color-primary-container)" : "var(--md-sys-color-surface-container-high)",
                  borderColor: isDragActive ? "var(--md-sys-color-primary)" : "var(--md-sys-color-outline)",
                  color: isDragActive ? "var(--md-sys-color-on-primary-container)" : "var(--md-sys-color-on-surface-variant)"
                }}
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
                <p className="text-base font-medium" style={{ color: "var(--md-sys-color-on-surface)" }}>Drag &amp; drop your .docx</p>
                <p className="text-sm" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>or click to choose a file up to 4&nbsp;MB</p>
                <input
                  ref={fileInputRef}
                  id="document-upload"
                  type="file"
                  accept=".docx"
                  className="sr-only"
                  onChange={handleInputChange}
                />
              </label>
              <div className="mt-4 space-y-2 text-sm" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                <div className="flex items-center justify-between">
                  <p>Supported format: .docx (Word)</p>
                  <button
                    type="button"
                    className="text-sm font-semibold transition"
                    style={{ color: "var(--md-sys-color-primary)" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse files
                  </button>
                </div>
                <p className="text-xs">
                  Have a PDF? Convert it to .docx first using{" "}
                  <a 
                    href="https://www.adobe.com/acrobat/online/pdf-to-word.html" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline transition hover:opacity-70"
                    style={{ color: "var(--md-sys-color-primary)" }}
                  >
                    Adobe's free converter
                  </a>
                  {" "}or similar tool.
                </p>
              </div>
              {uploadError && (
                <p className="mt-4 rounded-xl border px-3 py-2 text-sm" style={{ background: "var(--md-sys-color-error-container)", borderColor: "var(--md-sys-color-error)", color: "var(--md-sys-color-on-error-container)" }}>
                  {uploadError}
                </p>
              )}
              {isParsing && (
                <p className="mt-4 rounded-xl border px-3 py-2 text-sm" style={{ background: "var(--md-sys-color-primary-container)", borderColor: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary-container)" }}>
                  Parsing document…
                </p>
              )}
            </div>

            <div className="rounded-3xl border p-6 shadow-sm" style={{ background: "var(--md-sys-color-surface-container)", borderColor: "var(--md-sys-color-outline-variant)" }}>
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                Quick start
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                {templateHtml ? "Want to start over with a different document?" : "No .docx handy? Load a ready-made SAFE sample to try it out."}
              </p>
              {!templateHtml ? (
                <button
                  type="button"
                  onClick={applySampleDocument}
                  className="mt-4 w-full rounded-2xl border py-3 text-sm font-semibold transition"
                  style={{ background: "var(--md-sys-color-primary-container)", borderColor: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary-container)" }}
                >
                  Use sample document
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-4 w-full rounded-2xl border py-3 text-sm font-semibold transition flex items-center justify-center gap-2"
                  style={{ background: "var(--md-sys-color-error-container)", borderColor: "var(--md-sys-color-error)", color: "var(--md-sys-color-on-error-container)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset & Start Over
                </button>
              )}
              <div className="mt-4 rounded-xl p-3 text-xs" style={{ background: "var(--md-sys-color-surface-container-high)", color: "var(--md-sys-color-on-surface-variant)" }}>
                <p className="font-semibold mb-1" style={{ color: "var(--md-sys-color-on-surface)" }}>Supported placeholder formats:</p>
                <ul className="space-y-0.5 ml-3">
                  <li>• Square brackets: <code className="px-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>[Company Name]</code></li>
                  <li>• With dollar sign: <code className="px-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>$[Amount]</code></li>
                  <li>• Curly braces: <code className="px-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>{`{variable}`}</code></li>
                  <li>• Underscores: <code className="px-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>___</code></li>
                  <li>• Empty brackets: <code className="px-1 rounded" style={{ background: "var(--md-sys-color-surface-container-highest)" }}>[ ]</code></li>
                </ul>
              </div>
            </div>

            <div className="rounded-3xl border p-6 shadow-sm" style={{ background: "var(--md-sys-color-surface-container)", borderColor: "var(--md-sys-color-outline-variant)" }}>
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                Parse summary
              </p>
              <dl className="mt-4 space-y-3 text-sm" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                <div className="flex items-center justify-between">
                  <dt>Document</dt>
                  <dd className="font-medium" style={{ color: "var(--md-sys-color-on-surface)" }}>{documentMeta?.name ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Size</dt>
                  <dd className="font-medium" style={{ color: "var(--md-sys-color-on-surface)" }}>{documentMeta?.size ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Placeholders</dt>
                  <dd className="font-medium" style={{ color: "var(--md-sys-color-on-surface)" }}>{placeholderBadge}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-3xl border p-6 shadow-sm" style={{ background: "var(--md-sys-color-surface-container)", borderColor: "var(--md-sys-color-outline-variant)" }}>
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                Detected placeholders
              </p>
              <div className="mt-3 space-y-2 text-sm" style={{ color: "var(--md-sys-color-on-surface)" }}>
                {placeholders.length ? (
                  <ul className="divide-y rounded-2xl border" style={{ background: "var(--md-sys-color-surface-container-high)", borderColor: "var(--md-sys-color-outline-variant)" }}>
                    {placeholders.map((placeholder, index) => {
                      const isFilled = answers[placeholder] !== undefined;
                      const isCurrent = index === currentPlaceholderIndex;
                      return (
                        <li key={placeholder} className="flex items-center justify-between px-4 py-2 gap-2">
                          <span className="font-mono text-xs flex-1" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>{placeholder}</span>
                          <div className="flex items-center gap-2">
                            {isCurrent && !isFilled && (
                              <button
                                onClick={() => handleSkipPlaceholder(placeholder)}
                                className="text-xs px-2 py-1 rounded transition"
                                style={{ background: "var(--md-sys-color-error-container)", color: "var(--md-sys-color-on-error-container)" }}
                              >
                                Skip
                              </button>
                            )}
                            <span style={{ color: isFilled ? "var(--md-sys-color-success)" : "var(--md-sys-color-secondary)" }}>
                              {isFilled ? "Filled" : isCurrent ? "Current" : "Pending"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p style={{ color: "var(--md-sys-color-on-surface-variant)" }}>Placeholder keys will appear after parsing.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border p-8 shadow-sm" style={{ background: "var(--md-sys-color-surface-container)", borderColor: "var(--md-sys-color-outline-variant)" }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                  Document preview
                </p>
                <p className="text-sm" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>Rendered directly from the parsed HTML</p>
              </div>
              {templateText && (
                <p className="text-xs" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>{templateText.split(" ").length} words</p>
              )}
            </div>
            <div className="mt-6 h-[560px] overflow-y-auto rounded-2xl border p-6 text-base leading-relaxed" style={{ background: "var(--md-sys-color-surface-container-high)", borderColor: "var(--md-sys-color-outline-variant)", color: "var(--md-sys-color-on-surface)" }}>
              {highlightedHtml ? (
                <article className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                  <p className="text-base font-medium">Upload a document to see it here</p>
                  <p className="mt-2 text-sm">Your parsed, scrollable preview will appear in this panel.</p>
                </div>
              )}
            </div>
          </div>

          {templateHtml && (
            <div className="rounded-3xl border p-6 shadow-sm flex flex-col h-[calc(100vh-200px)] max-h-[800px]" style={{ background: "var(--md-sys-color-surface-container)", borderColor: "var(--md-sys-color-outline-variant)" }}>
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--md-sys-color-outline-variant)" }}>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                    Conversational Fill
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                    {currentPlaceholderIndex < placeholders.length
                      ? `${currentPlaceholderIndex + 1} of ${placeholders.length}`
                      : "Complete"}
                  </p>
                </div>
                <div className="text-xs" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
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
                      className="max-w-[85%] rounded-2xl px-4 py-3"
                      style={{
                        background: message.role === "user" ? "var(--md-sys-color-primary)" : "var(--md-sys-color-surface-container-high)",
                        color: message.role === "user" ? "var(--md-sys-color-on-primary)" : "var(--md-sys-color-on-surface)"
                      }}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div
                      className="max-w-[85%] rounded-2xl px-4 py-3 flex items-center gap-1"
                      style={{
                        background: "var(--md-sys-color-surface-container-high)",
                        color: "var(--md-sys-color-on-surface)"
                      }}
                    >
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--md-sys-color-on-surface)", animationDelay: "0ms" }}></span>
                        <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--md-sys-color-on-surface)", animationDelay: "150ms" }}></span>
                        <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--md-sys-color-on-surface)", animationDelay: "300ms" }}></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {currentPlaceholderIndex < placeholders.length && (
                <div className="border-t pt-4" style={{ borderColor: "var(--md-sys-color-outline-variant)" }}>
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
                      placeholder="Type your answer... (or 'skip' to skip)"
                      autoFocus
                      className="flex-1 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2"
                      style={{ background: "var(--md-sys-color-surface-container-high)", borderColor: "var(--md-sys-color-outline)", color: "var(--md-sys-color-on-surface)" }}
                      aria-label="Answer input"
                    />
                    <button
                      type="submit"
                      disabled={!userInput.trim()}
                      className="rounded-xl px-6 py-3 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)" }}
                    >
                      Send
                    </button>
                  </form>
                </div>
              )}

              {((currentPlaceholderIndex >= placeholders.length && placeholders.length > 0) || 
                (placeholders.length === 0 && templateHtml)) && (
                <div className="border-t pt-4" style={{ borderColor: "var(--md-sys-color-outline-variant)" }}>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full rounded-xl px-6 py-3 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: "var(--md-sys-color-success)", color: "var(--md-sys-color-on-success)" }}
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

        <footer className="mt-12 border-t pt-8 text-center text-sm" style={{ borderColor: "var(--md-sys-color-outline-variant)", color: "var(--md-sys-color-on-surface-variant)" }}>
          <div className="space-y-2">
            <p>
              <strong style={{ color: "var(--md-sys-color-on-surface)" }}>How it works:</strong> Upload a .docx template → 
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
