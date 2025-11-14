# Clausefill-AI

**AI-powered conversational document filling for legal templates.**

Fill legal documents faster with AI-guided conversations. Upload your .docx template, answer questions in a chat, and download a perfectly formatted completed document.

🔗 **Live App:** https://clausefill-ai.vercel.app/

## Features

- ✅ **Preserves formatting** - Original document structure maintained
- ✅ **AI-enhanced questions** - Natural, contextual questions with smart field detection
- ✅ **Batch processing** - Generates all questions at once for faster performance
- ✅ **Smart field grouping** - Automatically detects similar fields (company names, dates, amounts)
- ✅ **No data stored** - Everything processed in your browser
- ✅ **Works offline** - No AI key required (uses deterministic fallback)
- ✅ **Multiple placeholder formats** - `[brackets]`, `{curly}`, `$[amount]`, `___`

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
npm install
```

### Optional: OpenAI Integration

For AI-enhanced question generation, you have two options:

#### Option 1: Use Your Own API Key (In-App)
1. Get an API key from https://platform.openai.com/api-keys
2. Enter it in the "OpenAI API Key" field in the app header
3. Your key is only used for your session and never stored

#### Option 2: Set a Default API Key (Server-Side)
1. Get an API key from https://platform.openai.com/api-keys
2. Create a `.env.local` file in the root directory:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```
3. Restart the dev server
4. All users will use this default key (unless they provide their own)

**Rate Limiting:** When using a default API key, the app automatically rate limits to **50 AI questions per hour per IP address** to prevent abuse. Users can bypass this by providing their own API key.

**Note:** The app works perfectly without any API key using deterministic questions.

### Run Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
