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

⚠️ **IMPORTANT: Cost Protection Built-In**

The app has **multiple layers of protection** to prevent unexpected OpenAI bills:

1. **Rate Limiting:** 50 AI questions per hour per IP address (when using your default key)
2. **Efficient Model:** Uses GPT-4o-mini (~$0.0001 per question)
3. **Batch Processing:** Generates all questions in one API call (89% cost reduction)
4. **Graceful Fallback:** Works without AI if key is missing or rate limit exceeded

**Estimated Costs with Default Key:**
- Light usage (10 users/day): ~$0.50/month
- Medium usage (50 users/day): ~$2.50/month
- Heavy usage (200 users/day): ~$10/month

For AI-enhanced question generation, you have **three options**:

#### Option 1: No API Key (Safest - $0 cost)
- App works perfectly with deterministic questions
- No AI features, but fully functional
- Best for: Testing, demos without AI

#### Option 2: User-Provided Keys (BYOK - $0 cost to you)
1. Users enter their own API key in the app header
2. Their key is used only for their session (never stored)
3. No rate limiting applied
4. Best for: Power users, enterprise customers

#### Option 3: Your Default API Key (Rate-Limited)
1. Get an API key from https://platform.openai.com/api-keys
2. **Set usage limits in OpenAI dashboard** (recommended: $10/month hard cap)
3. Add to Vercel environment variables:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```
4. **Rate limiting automatically protects you:** 50 questions/hour per IP
5. Best for: Public demos, assessor testing

**🔒 Additional Protection Steps:**

1. **Set OpenAI Usage Limits:**
   - Go to https://platform.openai.com/account/limits
   - Set a hard monthly limit (e.g., $10)
   - Set email alerts at 50% and 90%

2. **Monitor Usage:**
   - Check https://platform.openai.com/usage
   - Review daily/weekly usage
   - Adjust rate limits if needed

3. **For Public Testing:**
   - Use Option 3 with rate limiting
   - Set OpenAI hard limit to $10-20/month
   - Monitor for first few days
   - Disable key if needed (app still works without it)

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
