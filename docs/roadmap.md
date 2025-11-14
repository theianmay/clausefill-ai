# Clausefill-AI – Implementation Roadmap

This roadmap is focused on **execution** and is meant to be extended as the project evolves. The conversational flow is implemented **deterministically (no AI required)**, with optional AI integration as a later stretch.

---

## Phase 0 – Project Setup

- [x] Initialize Next.js with TypeScript.
- [x] Add Tailwind CSS and basic layout components.
- [ ] Wire environment variables for optional AI integrations (e.g. `OPENAI_API_KEY`).

---

## Phase 1 – Upload & Parse Document

- [x] Build upload UI:
  - [x] Drag-and-drop + click-to-upload for `.docx`.
  - [x] File validation (type, size) and user-friendly error messages.
- [x] Implement `/api/parse-document`:
  - [x] Accept `.docx` via `FormData`.
  - [x] Convert to HTML/text using `mammoth` (or similar).
  - [x] Return parsed content to the client.
- [x] Render a scrollable preview of the parsed document.
- [x] Add an optional "Use sample document" button for quick demos.

---

## Phase 2 – Placeholder Detection & Highlighting

- [ ] Implement regex-based detection of placeholder patterns, including:
  - [ ] Square-bracketed tokens like `[Company Name]`, `[Investor Name]`, `[Date of Safe]`.
  - [ ] Bracketed blanks like `$[_____________]`.
  - [ ] (Optional) curly-braced tokens like `{company_name}`.
- [ ] Deduplicate placeholders and store them as a list of keys.
- [ ] Highlight placeholders in the preview (e.g. colored spans).
- [ ] Show a sidebar or panel listing all detected placeholders and their fill status.

---

## Phase 3 – Deterministic Conversational Flow (No AI)

Implement a **scripted, state-driven chat experience** that walks through placeholders one by one.

- [ ] Define client-side state:
  - [ ] `placeholders: string[]`
  - [ ] `answers: Record<string, string>`
  - [ ] `messages: { role: 'user' | 'assistant'; content: string }[]`
  - [ ] `currentPlaceholderIndex: number`
- [ ] Conversation logic:
  - [ ] After parsing, initialize `placeholders` and `currentPlaceholderIndex = 0`.
  - [ ] Append an assistant message introducing the flow.
  - [ ] For the current placeholder, generate a deterministic question, e.g.:
        `"What is the Company Name?"` from `[Company Name]`.
  - [ ] On user answer:
    - [ ] Store value in `answers[key]`.
    - [ ] Append user message to `messages`.
    - [ ] Re-render preview with updated values.
    - [ ] Increment `currentPlaceholderIndex` and ask the next question.
  - [ ] When all placeholders are filled, append a final assistant message and enable download.
- [ ] UI polish:
  - [ ] Chat bubble styling (assistant vs user).
  - [ ] Basic typing indicator / loading affordance.
  - [ ] Allow jumping to a placeholder by clicking it in the sidebar and editing the answer.

---

## Phase 4 – Completed Document & Download

- [ ] Implement `/api/generate-doc`:
  - [ ] Accept original template text and the `answers` map.
  - [ ] Replace placeholders with the corresponding values, leaving unfilled ones visibly marked.
  - [ ] Generate a `.docx` (or `.txt` fallback) and return as downloadable file.
- [ ] Add a "Download" button on the UI that calls this endpoint.
- [ ] Use a simple filename convention like `completed-document-{timestamp}.docx`.

---

## Phase 5 – Polish & QA

- [ ] Improve error handling and empty states:
  - [ ] Invalid file type.
  - [ ] Parsing failures.
  - [ ] No placeholders detected.
- [ ] Responsive layout with MD3 color scheme and basic accessibility checks.
- [ ] Copy polish (helper text around upload, placeholders, and conversation).
- [ ] Smoke test full flow with sample documents.

---

## Stretch – AI-Enhanced Question Generation (Optional)

After the deterministic flow is stable, optionally layer in AI for nicer/semantic questions while keeping the deterministic fallback:

- [ ] Add `/api/ask` endpoint:
  - [ ] Input: `{ placeholders, history }`.
  - [ ] If `OPENAI_API_KEY` is set, call an AI provider to generate the next question.
  - [ ] If not set, fall back to deterministic question generation on the client.
- [ ] Gate AI features behind environment config so the app remains fully functional without external services.
