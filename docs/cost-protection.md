# Cost Protection Guide

## 🛡️ How You're Protected from Unexpected Bills

### Built-In Protections

1. **Rate Limiting (Primary Defense)**
   - 50 AI questions per hour per IP address
   - Applies only when using YOUR default API key
   - Users with their own keys bypass this (they pay)
   - Resets every hour automatically

2. **Efficient Model**
   - Uses GPT-4o-mini (cheapest OpenAI model)
   - ~$0.0001 per question
   - 10,000 questions = ~$1

3. **Batch Processing**
   - All questions generated in ONE API call
   - 89% fewer API calls than naive approach
   - Reduces costs dramatically

4. **Graceful Fallback**
   - If rate limit hit → deterministic questions (free)
   - If API key invalid → deterministic questions (free)
   - If API error → deterministic questions (free)
   - **App never breaks, just degrades gracefully**

### Real-World Cost Scenarios

#### Scenario 1: Assessor Testing (Your Use Case)
- **Users:** 1-5 assessors
- **Usage:** Each tests with 1-2 documents (6-10 placeholders each)
- **Questions:** ~10-20 questions per person
- **Total:** 50-100 questions
- **Cost:** ~$0.01 (one cent!)

#### Scenario 2: Light Public Usage
- **Users:** 10 users per day
- **Usage:** Each fills 1 document (8 placeholders average)
- **Questions:** 10 × 8 = 80 questions/day
- **Monthly:** 80 × 30 = 2,400 questions
- **Cost:** ~$0.24/month

#### Scenario 3: Medium Public Usage
- **Users:** 50 users per day
- **Usage:** Each fills 1 document (8 placeholders average)
- **Questions:** 50 × 8 = 400 questions/day
- **Monthly:** 400 × 30 = 12,000 questions
- **Cost:** ~$1.20/month

#### Scenario 4: Heavy Public Usage (Worst Case)
- **Users:** 200 users per day
- **Usage:** Each fills 2 documents (16 placeholders total)
- **Questions:** 200 × 16 = 3,200 questions/day
- **Monthly:** 3,200 × 30 = 96,000 questions
- **Cost:** ~$9.60/month

### Rate Limiting Math

**Per IP Address:**
- 50 questions per hour
- = 1,200 questions per day (if one user maxes out)
- = 36,000 questions per month (if one user maxes out every day)
- = ~$3.60/month per IP (absolute maximum)

**For 100 Different IPs (100 users):**
- If ALL users hit rate limit every day: $360/month
- **BUT:** This is impossible in practice because:
  - Most users fill 1 document and leave
  - Rate limit resets every hour
  - Most documents have 6-10 placeholders (not 50)

**Realistic Estimate for Public App:**
- 100 users/day × 8 questions each = 800 questions/day
- 800 × 30 = 24,000 questions/month
- **Cost: ~$2.40/month**

## 🔒 Recommended Setup for Public Testing

### Step 1: Set OpenAI Hard Limit
1. Go to https://platform.openai.com/account/limits
2. Set **Hard limit:** $10/month
3. Set **Soft limit:** $5/month (email alert)
4. Set **Email alerts:** 50%, 75%, 90%

### Step 2: Deploy with API Key
1. Add `OPENAI_API_KEY` to Vercel environment variables
2. Deploy to production
3. Rate limiting automatically active (50/hour per IP)

### Step 3: Monitor First Week
1. Check https://platform.openai.com/usage daily
2. Watch for unusual patterns
3. Adjust rate limits if needed (in `app/lib/rate-limiter.ts`)

### Step 4: Emergency Shutdown (if needed)
1. Remove `OPENAI_API_KEY` from Vercel environment variables
2. Redeploy
3. App continues working with deterministic questions
4. Zero cost

## 📊 Cost Comparison

### With Your Protections:
- Rate limiting: 50/hour per IP
- Batch processing: 1 API call per document
- Efficient model: GPT-4o-mini
- **Realistic cost: $2-10/month**

### Without Your Protections:
- No rate limiting: Unlimited
- Individual calls: 10 API calls per document
- Expensive model: GPT-4
- **Potential cost: $100-1000/month** ⚠️

## ✅ You're Safe Because:

1. **Rate limiting prevents abuse** - No single user can rack up huge bills
2. **Hard limit at OpenAI** - Billing stops at your cap
3. **Batch processing** - 89% cost reduction
4. **Cheap model** - GPT-4o-mini is 10x cheaper than GPT-4
5. **Graceful fallback** - App works without AI
6. **You can disable anytime** - Remove key, app still works

## 🎯 Recommendation for Assessor Demo

**Best approach:**
1. Set OpenAI hard limit to $10/month
2. Deploy with your API key
3. Share with assessor
4. Monitor usage for 1-2 days
5. Expected cost: **$0.01 - $0.50 total**

**Why this is safe:**
- Assessor will test 1-3 documents max
- That's 10-30 questions total
- Cost: ~$0.003 (less than a penny)
- Rate limiting prevents any abuse
- Hard limit prevents surprises

## 🚨 What If Something Goes Wrong?

**Worst case scenario:** Someone tries to abuse the system

**What happens:**
1. They hit rate limit after 50 questions (1 hour)
2. App switches to deterministic questions (free)
3. They can't generate more AI questions for 1 hour
4. Even if they use VPN to change IP, hard limit caps total cost
5. You get email alert at $5 usage
6. You can disable key immediately

**Maximum possible cost with $10 hard limit:** $10

**Realistic cost for assessor testing:** $0.01 - $0.50

You're protected! 🛡️
