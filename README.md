# Chronos — Connect. Create. Discover.

An Instagram-style social app built for Code Hackathon 2026: photo posts, profiles and followers, a server-ranked home feed and Explore page, real-time direct messages and notifications.

**What makes it different:** the feed is ranked on the server by a scaled-down version of the four-stage pipeline described in Meta's article [Scaling the Instagram Explore recommendations system](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/) — retrieval → first-stage ranking → value model → rule-based rerank — and every post can explain itself on request ("Why am I seeing this?"). The browser only receives the ordered posts; the explanation is fetched only when the user asks.

> The predicted scores are transparent formulas from features (account affinity, topic affinity, popularity, recency), not a trained neural network. Same stages as Meta's system; each formula can be replaced by a trained model later.

## Features

| Area | Status |
|---|---|
| Sign-up (email + password, 2 short steps), log in, onboarding with interests | Done, tested |
| Profiles, edit profile (photo, name, username, bio), followers / following | Done, tested |
| Photo posts (shrunk in the browser before upload), captions, topics, edit caption, delete | Done, tested |
| Home feed ranked on the server (~0.7–1 s), "Why am I seeing this?", see fewer, report, feed preferences | Done, tested |
| Likes, comments, saves, "see fewer posts like this", report | Built |
| Direct messages (real time, sent/seen ticks, offline outbox) | Built |
| Notifications (likes, comments, follows) | Built |
| Stories and Reels | In progress (mock data) |

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Zustand
- **Backend:** Supabase — Postgres with Row Level Security, Auth, Storage, Realtime
- **Server logic:** Vercel serverless functions in `api/` (feed ranking, explanations, preferences). They call Supabase with the user's own token, so database security rules apply on the server too.
- **Tests:** Vitest (ranking rules) and end-to-end checks against Supabase (`tests/`)

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase URL and publishable key
pnpm dev                     # http://localhost:5173 — also runs api/ locally
```

Database: run `supabase/schema.sql`, then `supabase/seed.sql` (30 demo accounts, 200 posts) in your Supabase project. In Auth settings, turn off "Confirm email" for a one-minute sign-up.

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with the `/api` functions |
| `pnpm build` | Type-check and production build |
| `pnpm test` | Ranking unit tests |
| `node tests/m1-accounts.e2e.mjs` | End-to-end checks (also `m2-profiles`, `m3-posts`, `m4-feed`) against your Supabase project — creates throwaway test accounts. `m4-feed` also needs `pnpm dev` running (or `CHRONOS_API=<url>`) |

## Project structure

```
api/            serverless functions: feed.ts, why.ts, prefs.ts
api/_lib/       rank.ts (4-stage ranking, pure + tested), server.ts
src/pages/      screens (Welcome, Onboarding, Feed, Explore, Profile, …)
src/components/ PostCard, PostImage, FollowButton, WhyModal, Layout, …
src/store/      auth, messages (cache + offline outbox), notifications
src/lib/        Supabase client, plain-English errors, image preparation
supabase/       schema.sql, seed.sql, demo photo credits
tests/          end-to-end checks per module
```

## Credits

Demo photos are freely licensed images from [Wikimedia Commons](https://commons.wikimedia.org/) (CC BY, CC BY-SA, CC0 and public domain). Title, author, licence and source for every photo: [`supabase/demo-image-credits.json`](supabase/demo-image-credits.json).

## Licence

All rights reserved. Private hackathon project.
