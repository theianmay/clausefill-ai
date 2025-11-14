# Clausefill-AI – MVP Product Spec

## 1. Problem & Goal

Clausefill-AI is a small web app that turns a legal template into a guided, conversational intake. It is built for startup legal workflows and aligns with the mission of delivering AI-assisted legal services.

**Goal:** Provide an end-to-end experience where a user can:

- Upload a legal document draft (e.g. `.docx`).
- Automatically identify template/boilerplate text vs. dynamic placeholders.
- Fill those placeholders via a conversational, question-and-answer flow.
- Review the completed document and download it.

The focus is on clarity, functionality, and a smooth, minimal MVP that can be implemented in roughly 1–2 days.

---

## 2. Core User Stories

- **US1 – Upload & parse**  
  As a founder, I can upload a `.docx` legal template and see a readable preview in the browser.

- **US2 – Detect placeholders**  
  As a founder, I can see which parts of the document are static boilerplate vs. dynamic placeholders (e.g. `[Company Name]`, `[Investor Name]`, `$[_____________]`) highlighted.

- **US3 – Conversational fill**  
  As a founder, I can answer a sequence of questions in a chat-like UI, and those answers automatically fill the placeholders.

- **US4 – Review completed document**  
  As a founder, I can review the fully filled-in document in the browser with my answers applied.

- **US5 – Download completed document**  
  As a founder, I can download the completed document in a common format (MVP: `.docx` or `.txt`).

---

## 3. MVP Scope

### 3.1 Assumptions & Constraints

- Placeholders are detected using pattern-based rules and may appear as:
  - Square-bracketed tokens like `[Company Name]`, `[Investor Name]`, `[Date of Safe]`.
  - Bracketed blanks like `$[_____________]`.
  - (Optionally) curly-braced tokens like `{company_name}`.
- Any text that does not match these patterns is treated as template/boilerplate.
- No authentication or multi-user support; all state is per-session in browser memory.
- No database or long-term persistence.
- Single user role (founder/author); no separate lawyer interface.

These assumptions are surfaced in the UI (e.g. brief helper copy near the upload and placeholder list).

### 3.2 Features Included in the Super-MVP

- **Upload page**
  - Drag-and-drop area and file picker for `.docx` files.
  - Basic validation: allowed MIME types, max file size, and error messaging.
  - Optional "Use sample document" button to instantly load a built-in template.

- **Template parsing & placeholder detection**
  - Server-side conversion of `.docx` → HTML/plain text using a library like `mammoth`.
  - Regex-based detection of placeholder patterns, including:
    - Square-bracketed tokens like `[Company Name]`, `[Investor Name]`, `[Date of Safe]`.
    - Bracketed blanks like `$[_____________]`.
    - (Optionally) curly-braced tokens like `{company_name}`.
  - Deduplicate placeholders (e.g. `[Company Name]` may appear multiple times).
  - Display:
    - Template text = standard typography.
    - Placeholders = highlighted spans and summarized in a side panel list.

- **Conversational filling experience**
  - Chat-style panel with message history.
  - For each placeholder, generate a question:
    - Deterministic fallback: `"What is the Company Name?"` from `[Company Name]`.
    - Optional AI enhancement if an API key is configured.
  - User answers are stored and associated with placeholder keys.
  - As answers are provided, the document preview re-renders with placeholders replaced.

- **Live document preview**
  - Scrollable preview showing the template with current answers merged in.
  - Unfilled placeholders remain visually highlighted so gaps are obvious.

- **Download completed document**
  - Button to download the filled document.
  - MVP: generate either a `.docx` using a small server utility (e.g. `docx` library) or a `.txt` fallback if necessary.
  - Simple filename convention like `completed-document-{timestamp}.docx`.

### 3.3 Explicit Non-Goals (for the 2-day MVP)

- No user accounts, logins, or permissions.
- No persistent storage of templates or answers.
- No advanced clause-level semantic analysis; placeholder detection is pattern-based.
- No multi-party collaboration or inline redlining.

---

## 4. Architecture & Tech Stack

### 4.1 Stack

- **Framework:** Next.js (App Router).
- **Language:** TypeScript.
- **UI:** React with Tailwind CSS for rapid, consistent styling.
- **File parsing:** `mammoth` (Node/Edge) to convert `.docx` → HTML/text.
- **Document generation:** `docx` (or similar) to generate `.docx` from the filled template.
- **AI (optional):** OpenAI (or compatible) Chat API for nicer question phrasing when available.

### 4.2 High-Level Architecture

- **Frontend (Next.js App Router)**
  - `/(main)/page.tsx` (or similar):
    - Upload area.
    - Document preview panel.
    - Conversational chat panel.
  - Global layout with minimal brand styling, responsive design.

- **Backend API routes**
  - `POST /api/parse-document`
    - Input: uploaded `.docx` via `FormData`.
    - Steps:
      - Convert file to HTML/text with `mammoth`.
      - Extract placeholders using regex.
      - Return `{ rawText, html, placeholders: string[] }`.

  - `POST /api/generate-doc`
    - Input: `{ rawTemplate: string, values: Record<string, string> }`.
    - Replace placeholders with submitted values.
    - Generate `.docx` and return as file download.

  - `POST /api/ask` (optional, AI-powered)
    - Input: `{ placeholders: string[], history: Message[] }`.
    - If AI is configured, generate more natural follow-up questions.
    - If AI is not configured, fall back to deterministic questions on the client.

- **State Management (Client-Side)**
  - Local React state (no external store needed):
    - `templateText: string`
    - `templateHtml: string`
    - `placeholders: string[]`
    - `answers: Record<string, string>`
    - `messages: { role: 'user' | 'assistant'; content: string }[]`
    - `currentPlaceholderIndex: number`

---

## 5. Implementation Roadmap (Super-MVP)

Estimated total: ~6–10 hours, suitable for a 2-day assignment window.

### Phase 0 – Project Setup (0.5–1h)

- Initialize Next.js with TypeScript and Tailwind CSS.
- Configure basic layout and styling primitives (container, typography, buttons, panels).
- Add environment variable wiring for optional AI integration (e.g. `OPENAI_API_KEY`).

### Phase 1 – Upload & Parse Document (1.5–2h)

- Build upload UI: drag-and-drop or click-to-upload for `.docx`.
- Implement `/api/parse-document`:
  - Accept file via `FormData`.
  - Use `mammoth` to convert `.docx` to HTML/text.
  - Extract and return parsed content.
- Render a scrollable preview of the parsed document.

**Deliverable:** User can upload a `.docx` and see a readable preview.

### Phase 2 – Placeholder Detection & Highlighting (1–1.5h)

- Apply regex-based detection for placeholder patterns such as `[Company Name]`, `[Investor Name]`, `$[_____________]` (and optionally `{company_name}`).
- Deduplicate to a unique list of placeholder keys.
- Highlight placeholders in the preview and show them in a sidebar list.

**Deliverable:** User can clearly see which parts of the document are dynamic placeholders.

### Phase 3 – Conversational Filling Experience (2–3h)

- Implement chat-style UI with message history and an input box.
- Define a simple conversation loop:
  - Ask questions one placeholder at a time.
  - On user answer, store value and advance to next placeholder.
- Update document preview on each answer to reflect filled values.
- Optional: integrate `/api/ask` for AI-generated questions when `OPENAI_API_KEY` is present.

**Deliverable:** User can fill all placeholders by answering questions in a conversational flow.

### Phase 4 – Completed Document & Download (1–2h)

- Implement `/api/generate-doc`:
  - Replace placeholders in template text with collected answers.
  - Generate a `.docx` (or `.txt` fallback) and send as downloadable file.
- Add a "Download" button once all required placeholders are filled (or at any time, with unfilled placeholders left marked).

**Deliverable:** User can download the completed document with their answers applied.

### Phase 5 – Polish & QA (1–1.5h)

- Error handling and empty states (invalid file, no placeholders, server errors).
- Basic responsive layout and visual polish.
- Optional: add a built-in sample template button for instant demo.
- Light accessibility and copy review.

**Deliverable:** Clean, end-to-end experience suitable for a public demo URL (e.g. Vercel deployment).
