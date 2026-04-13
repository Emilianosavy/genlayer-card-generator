# genlayer-card-generator

GenLayer Community Card Generator.

## Deploy on Vercel

This project uses a Vercel Serverless Function at `api/generate-poem.js`.
Users never see or enter your Gemini API key.

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. In Vercel project settings, add environment variable:

```env
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL_1=gemini-2.5-flash-lite
GEMINI_MODEL_2=gemini-2.5-flash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

4. Deploy.

The frontend calls `/api/generate-poem`, and Vercel runs that endpoint server-side.

## Local preview (optional)

You can run Vercel locally to test the function:

```bash
cp .env.example .env
# set GEMINI_API_KEY in .env
# optionally set GEMINI_MODEL_1 and GEMINI_MODEL_2 in .env
# set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for persistent IP limits
npm run local
```

Then open the local URL shown in terminal (usually `http://localhost:3000`).

## How it works

- Frontend (`index.html`, `app.js`, `style.css`) collects user input and displays the generated card.
- Backend route is `api/generate-poem.js` (Vercel Serverless Function).
- The function calls Gemini using `GEMINI_API_KEY` and the two model variables `GEMINI_MODEL_1` and `GEMINI_MODEL_2`.
- The browser receives only the generated poem.
- Each IP can generate up to 2 cards per day. In production, this uses Upstash Redis for persistence.
