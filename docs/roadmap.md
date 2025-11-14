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

- [x] Implement regex-based detection of placeholder patterns, including:
  - [x] Square-bracketed tokens like `[Company Name]`, `[Investor Name]`, `[Date of Safe]`.
  - [x] Bracketed blanks like `$[_____________]`.
  - [x] (Optional) curly-braced tokens like `{company_name}`.
- [x] Deduplicate placeholders and store them as a list of keys.
- [x] Highlight placeholders in the preview (e.g. colored spans with background color).
- [x] Show a sidebar or panel listing all detected placeholders and their fill status.
- [x] **CRITICAL FOR REAL DOCS:** Add support for additional common patterns:
  - [x] Standalone underscores: `_________` (minimum 3+ underscores)
  - [x] Empty brackets: `[ ]` or `[  ]`
  - [x] Placeholder indicators: `[TBD]`, `[INSERT]`, `[FILL IN]`

---

## Phase 3 – Deterministic Conversational Flow (No AI)

Implement a **scripted, state-driven chat experience** that walks through placeholders one by one.

- [x] Define client-side state:
  - [x] `placeholders: string[]`
  - [x] `answers: Record<string, string>`
  - [x] `messages: { role: 'user' | 'assistant'; content: string }[]`
  - [x] `currentPlaceholderIndex: number`
- [x] Conversation logic:
  - [x] After parsing, initialize `placeholders` and `currentPlaceholderIndex = 0`.
  - [x] Append an assistant message introducing the flow.
  - [x] For the current placeholder, generate a deterministic question, e.g.:
        `"What is the Company Name?"` from `[Company Name]`.
  - [x] On user answer:
    - [x] Store value in `answers[key]`.
    - [x] Append user message to `messages`.
    - [x] Re-render preview with updated values.
    - [x] Increment `currentPlaceholderIndex` and ask the next question.
  - [x] When all placeholders are filled, append a final assistant message and enable download.
- [x] UI polish:
  - [x] Chat bubble styling (assistant vs user).
  - [ ] Basic typing indicator / loading affordance.
  - [ ] Allow jumping to a placeholder by clicking it in the sidebar and editing the answer.

---

## Phase 4 – Completed Document & Download

- [x] Implement `/api/generate-doc`:
  - [x] Accept original template text and the `answers` map.
  - [x] Replace placeholders with the corresponding values, leaving unfilled ones visibly marked.
  - [x] Use `docx` library to generate proper Word documents.
  - [x] Generate a `.docx` and return as downloadable file.
- [x] Add a "Download" button on the UI that calls this endpoint.
- [x] Use a simple filename convention like `completed-document-{timestamp}.docx`.
- [ ] **TESTING:** Verify with real legal documents that formatting is preserved.

---

## Phase 5 – Polish & QA

- [x] Improve error handling and empty states:
  - [x] Invalid file type.
  - [x] Parsing failures.
  - [x] No placeholders detected with helpful guidance.
  - [x] Large files (>4MB) with helpful guidance.
- [x] Responsive layout and basic accessibility checks.
- [x] Copy polish (helper text around upload, placeholders, and conversation).
- [x] **USER GUIDANCE:** Add help section explaining:
  - [x] Supported placeholder formats with examples.
  - [x] What to expect from the conversational flow (footer).
  - [x] Privacy note (no data stored).
- [x] Loading states (download button, parsing indicator).
- [x] Keyboard accessibility (Enter to submit, autofocus).
- [ ] Smoke test full flow with sample documents.
- [ ] **DEPLOYMENT:** Deploy to Vercel for public URL access.
- [ ] **REAL-WORLD TEST:** Test with actual legal documents (NDA, employment agreement, etc.).

---

## Phase 6 – Pre-Launch Checklist (Real-World Readiness)

Before sharing with unknown testers:

- [ ] **Landing page clarity:**
  - [ ] Clear value proposition visible immediately.
  - [ ] Instructions on how to use the tool.
  - [ ] Example placeholder formats shown.
- [ ] **Sample documents:**
  - [ ] Provide 2-3 downloadable sample legal documents (NDA, SAFE, employment offer).
  - [ ] Each with clear placeholder formats.
- [ ] **Error recovery:**
  - [ ] If no placeholders detected, suggest manual placeholder format.
  - [ ] If parsing fails, provide clear next steps.
- [ ] **Performance:**
  - [ ] Test with 10+ page documents.
  - [ ] Ensure parsing completes within 5 seconds.
- [ ] **Cross-browser testing:**
  - [ ] Chrome, Firefox, Safari.
  - [ ] Mobile responsive.
- [ ] **Analytics (optional):**
  - [ ] Track upload success rate.
  - [ ] Track placeholder detection rate.
  - [ ] Track completion rate.

---

## Stretch – AI-Enhanced Question Generation (Optional)

After the deterministic flow is stable, optionally layer in AI for nicer/semantic questions while keeping the deterministic fallback:

- [ ] Add `/api/ask` endpoint:
  - [ ] Input: `{ placeholders, history }`.
  - [ ] If `OPENAI_API_KEY` is set, call an AI provider to generate the next question.
  - [ ] If not set, fall back to deterministic question generation on the client.
- [ ] Gate AI features behind environment config so the app remains fully functional without external services.
