# Krasword

Browser vocabulary drills. Enter up to 30 words or phrases, or load them from the built-in 10,000-word English list, pick a level (`A2`, `B1`, or `B2`), and the app builds a fill-in-the-blank sentence for each item. No Gemini or DeepSeek API key is required.

Progress stays in the browser. Supabase sync is optional.

## Run locally

1. Install Node.js.
2. Install dependencies: `npm install`
3. Start the app: `npm run dev`

Open the URL Vite prints (port 3000).

## Optional Supabase

Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then apply `supabase/schema.sql` in your project.
