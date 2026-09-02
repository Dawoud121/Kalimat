# Kalimat (تاملك) — Project Brief for Claude Code

## What this is
Arabic vocabulary learning app focused on Classical and Quranic Arabic.
All files live in `C:\Users\dawou\kalimat\`. Do not create or modify files outside this folder.
Dev: `npm run dev` → http://localhost:5173 | Build: `npm run build` → `dist/`

---

## Deployment — cPanel Shared Hosting

### Live site
- **Domain**: kalimatstudio.com
- **Hosting**: cPanel shared hosting (managed by user's dad)
- **Structure**: Frontend (static `dist/` output) + PHP backend in same `public_html/` directory

### Server file structure (`public_html/`)
```
public_html/
├── index.html              ← from dist/ (Vite build output)
├── assets/                 ← from dist/ (JS/CSS bundles)
├── api/
│   ├── index.php           ← single-entry router
│   ├── lib/
│   │   ├── config.php      ← loads ../../config.php
│   │   ├── db.php          ← SQLite connection + 24-table schema
│   │   ├── jwt.php         ← HS256 encode/decode
│   │   ├── auth.php        ← require_auth / require_admin / optional_auth
│   │   ├── helpers.php     ← utility functions
│   │   └── tts.php         ← legacy Azure TTS wrapper (unused)
│   └── routes/
│       ├── auth.php        ← login, register, me, change-password
│       ├── profiles.php    ← user profile CRUD
│       ├── decks.php       ← deck CRUD
│       ├── words.php       ← word CRUD + batch import + exists check
│       ├── srs.php         ← SRS card CRUD + batch create
│       ├── dictionary.php  ← dictionary browse/search
│       ├── community.php   ← community decks + collections
│       ├── contributions.php ← contribution voting/moderation
│       ├── sentences.php   ← sentence CRUD
│       ├── stories.php     ← stories + progress
│       ├── quran.php       ← surah fetch + search + word count
│       ├── study.php       ← study log
│       ├── sessions.php    ← app session tracking
│       ├── feedback.php    ← user feedback
│       ├── notebook.php    ← notebook classes/lessons/strokes/images CRUD + Gemini analysis
│       ├── admin.php       ← admin stats + user management
│       └── tts.php         ← legacy Azure TTS endpoint (unused — TTS is now client-side)
├── data/
│   ├── exports/            ← 19 CSV files from Supabase export
│   ├── kalimat.sqlite      ← main database (created by import-data.php)
│   ├── notebook-images/    ← uploaded images for notebook lessons
│   ├── tts-cache/          ← legacy cached MP3 files from Azure TTS (no longer used)
│   └── .htaccess           ← blocks direct HTTP access to data/
├── .htaccess               ← API rewrite + auth header fix + SPA fallback
├── config.php              ← real secrets (created from sample, gitignored)
├── config.sample.php       ← template config
├── import-data.php         ← CSV → SQLite import script
└── set-password.php        ← CLI tool to set/reset user passwords
```

### Deployment steps (for updating the live site)
Deployment is via **GitHub → cPanel Git Version Control**:
1. Run `npm run build` locally to generate fresh `dist/`
2. Commit changes + built `dist/` to git
3. `git push origin main`
4. Open **cPanel → Git Version Control → Manage (Kalimat repo) → Pull or Deploy**
5. Click **"Update from Remote"** then **"Deploy HEAD Commit"**

The `.cpanel.yml` in the repo root handles all file copying automatically:
- Cleans old `assets/` and `api/`, copies fresh `dist/` output (index.html, assets, favicons) to `public_html/`
- Copies `server/api/`, `.htaccess`, and CLI tools to `public_html/`
- Does NOT touch `config.php`, `data/kalimat.sqlite`, or `data/tts-cache/` (these are server-only)
- **Important**: `api/` must be deleted before copying (`rm -rf` then `cp -r`) — otherwise `cp -r` nests `api/api/` inside the existing directory and changes don't deploy

**GitHub repo**: https://github.com/Dawoud121/Kalimat (public)
**cPanel repo path**: `/home/kalimat/repositories/Kalimat/public_html`

### Critical .htaccess rules (`server/.htaccess`)
Apache/cPanel **strips the `Authorization` header** before PHP receives it. Without this fix, ALL authenticated API calls fail with "Missing or invalid authorization header":
```apache
RewriteCond %{HTTP:Authorization} .
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
```
The `.htaccess` also handles:
- `/api/*` rewrite to `api/index.php` (single-entry router)
- `data/` and `config.php` protection (returns 403)
- SPA fallback: all non-file, non-API routes serve `index.html`

### Password migration caveat
Supabase hashes passwords internally and does NOT export them in CSV. All migrated user accounts exist in SQLite but have no usable password. Each user must have their password reset via CLI:
```bash
php set-password.php <email> <newpassword>
```
New accounts registered after migration work normally (bcrypt hash stored directly).

### Config (`config.php`)
Created from `config.sample.php` on the server. Contains:
- `jwt_secret` — random string for HS256 token signing
- `admin_email` — `dawoudhussein07@gmail.com`
- `data_dir` — path to data/ folder (default: `__DIR__ . '/data'`)
- `site_url` — `https://kalimatstudio.com`
- `azure_tts_key` / `azure_tts_region` — legacy Azure TTS config, no longer used (TTS is now client-side via Web Speech API)
- `gemini_api_key` — Google Gemini API key for notebook AI analysis

---

## Local Development Setup

### Prerequisites
- **PHP 8.5.8** installed at `C:\php\` (VS17 x64 Thread Safe from windows.php.net)
- **Node.js** + npm (for Vite frontend)

### PHP configuration (`C:\php\php.ini`)
Created from `php.ini-development`. Three critical settings:
1. `extension_dir = "C:\php\ext"` — must be uncommented AND set to full absolute path (not just `"ext"`)
2. `extension=pdo_sqlite` — uncommented (no leading `;`)
3. `extension=sqlite3` — uncommented
4. `extension=mbstring` — uncommented

Verify extensions loaded: `C:\php\php.exe -m | findstr sqlite` → should show `pdo_sqlite` and `sqlite3`

### First-time local setup
Run these once before starting servers:
```bash
# 1. Import Supabase CSV data into local SQLite
C:\php\php.exe C:\Users\dawou\kalimat\server\import-data.php

# 2. Set a password for a local account
C:\php\php.exe C:\Users\dawou\kalimat\server\set-password.php test@gmail.com YourPassword
```
The import script reads CSVs from `server/data/exports/` and creates `server/data/kalimat.sqlite`.
Note: PHP 8.5 shows `fgetcsv()` deprecation warnings — these are harmless and don't affect the import.

You can also register a new account through the app's registration page instead of using `set-password.php`.

### Running locally (two terminals)
**Terminal 1 — PHP backend:**
```bash
C:\php\php.exe -S localhost:8080 -t C:\Users\dawou\kalimat\server
```

**Terminal 2 — Vite frontend:**
```bash
cd C:\Users\dawou\kalimat
npm run dev
```

Open **http://localhost:5173** in browser.

### How the proxy works
Vite dev server proxies `/api` requests to `http://localhost:8080` (configured in `vite.config.js`). This means the frontend at `:5173` talks to the PHP backend at `:8080` seamlessly — same as production where both are on the same domain.

### Local vs Live — completely separate
Local and live are independent databases. Creating accounts, importing data, or making changes locally has zero effect on kalimatstudio.com and vice versa.

---

## Current Version: 2.9.2
Version must stay in sync across three places on every change:
1. `package.json` → `"version"`
2. `src/pages/Settings.jsx` → `const APP_VERSION` + `// vX.X.X` header comment
3. File header comment `// vX.X.X` on any changed file
Version policy: major features = x.Y.0, bug fixes = x.y.Z

---

## Tech Stack
- Vite 5 + React 18 + React Router v6 (SPA, no SSR)
- PHP + SQLite backend (`server/`) — JWT auth (HS256), single-entry router (`server/api/index.php`)
- API client: `src/lib/api.js` (fetch-based, JWT in localStorage as `kalimat_token`)
- Pure CSS only (no Tailwind) — single file: `src/styles/global.css`
- lucide-react for all icons (no emojis in UI)
- Dexie.js — used only for offline cache (`src/db/offlineDb.js`), not primary storage
- @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities + @dnd-kit/modifiers — drag-and-drop (used in TeamTab only)
- jspdf — PDF export for notebook
- HTML5 Canvas + Pointer Events — notebook handwriting canvas (pressure-sensitive, multi-touch)

---

## API Client (`src/lib/api.js`)
Replaces the old Supabase client (`src/lib/supabase.js`, now unused). Thin fetch wrapper with JWT auth.

- `getToken()` / `setToken(t)` / `clearToken()` — read/write/remove `kalimat_token` in localStorage
- `api.get(path)` / `api.post(path, body)` / `api.put(path, body)` / `api.del(path)` — JSON requests
- `api.postBlob(path, body)` — returns a Blob (used for TTS audio)
- Automatically attaches `Authorization: Bearer <token>` header when token exists
- **401 handling**: parses JSON error FIRST, then checks message. This ensures login errors ("Invalid email or password") show the real message instead of generic "Session expired". Only clears token and shows "Session expired" for actual expired sessions (no error message in response).
- `API_BASE` defaults to `/api` (set via `VITE_API_URL` env var)
- All API responses return data directly (not wrapped in `{ data, error }` like Supabase) — errors throw exceptions

### Migration from Supabase
Every `supabase.from('table').select()` / `.insert()` / `.update()` / `.delete()` call was replaced with `api.get/post/put/del()` equivalents in `dataService.js`. The Supabase RPC calls were replaced with dedicated PHP endpoints. `supabase.auth.onAuthStateChange` was replaced with JWT token validation on mount (`GET /auth/me`).

Files fully migrated from Supabase:
- `src/lib/dataService.js` — all ~70 data functions
- `src/auth/AuthContext.jsx` — auth flow
- `src/components/SpeakButton.jsx` — TTS (was Supabase Edge Function → Azure → now browser Web Speech API)
- `src/lib/syncService.js` — offline sync
- `src/pages/Dashboard.jsx`, `Stats.jsx`, `AdminStats.jsx`, `QuranicLexicon.jsx`, `QuranContext.jsx`
- `src/pages/ForgotPassword.jsx`, `ResetPassword.jsx` — simplified (no email reset, directs to admin)
- `src/db/seed.js` — community deck seeding
- `vite.config.js` — added dev proxy
- `.env` / `.env.example` — changed from Supabase vars to `VITE_API_URL=/api`

`src/lib/supabase.js` has been deleted — was unused dead code from the migration.

---

## Backend (`server/`)
- PHP + SQLite, deployed to cPanel shared hosting
- Single-entry router: `server/api/index.php` dispatches to `server/api/routes/*.php` (18 route files)
- Database: `server/data/kalimat.sqlite` (auto-created on first request via `server/api/lib/db.php`)
- Config: `server/config.php` (jwt_secret, admin_email, data_dir, site_url, azure_tts_key, azure_tts_region)
- Auth: JWT (HS256) via `server/api/lib/jwt.php` — no third-party auth service
- Admin email: `dawoudhussein07@gmail.com` (configured in `server/config.php`)
- Admin checks via `require_admin()` middleware comparing JWT email to config admin_email
- Ownership checks in PHP middleware replace Supabase RLS
- `.htaccess` rewrites `/api/*` to `api/index.php`, protects `data/` and `config.php`

### Tables (SQLite)
| Table | Purpose |
|-------|---------|
| `users` | id (UUID), email, password_hash (bcrypt) — replaces Supabase auth.users |
| `profiles` | username, trust_score, trust_score_vocab, trust_score_forms |
| `decks` | user vocab decks (review_frequency, review_interval_days, next_deck_review) |
| `words` | words linked to deck (notes, color, form columns) |
| `srs_cards` | SM-2 state per word per user |
| `community_decks` | shared decks (download_count, uploader_username, collection_id, order_index) |
| `community_collections` | folders for team tab (title, order_index) |
| `quran_words` | all 114 surahs, every word with arabic/english/root/grammar_tag/surah/verse/position |
| `dictionary` | MSA entries (arabic, definition, root, pos, forms JSON, example_sentence, sources JSON) |
| `sentences` | user sentences with arabic, translation, status, source |
| `contributions` | community word suggestions (type, arabic, root, vote_score, status, source) |
| `contribution_votes` | upvote/downvote per user per contribution |
| `contribution_audit` | moderation action log |
| `stories` | hadith/text entries with segments JSON |
| `collections` | story collections metadata |
| `story_progress` | per-user reading progress |
| `study_log` | daily study statistics |
| `app_sessions` | session tracking |
| `feedback` | user feedback |
| `notebook_classes` | notebook class folders per user (title, order_index) |
| `notebook_lessons` | lessons within classes (title, date, template, order_index) |
| `notebook_strokes` | one row per stroke/element per lesson (stroke_data JSON, order_index) |
| `notebook_images` | uploaded images for lessons (filename → data/notebook-images/) |
| `tts_rate_limits` | Legacy Azure TTS call tracking (no longer used) |

### Security notes
- Trust score protection: admin check in `PUT /profiles/:id` route (replaces `protect_trust_score` trigger)
- Sentence status protection: admin check in `PUT /sentences/:id` route (replaces `protect_sentence_status` trigger)
- Admin-only routes: all `/admin/*` endpoints call `require_admin()` which throws 403 for non-admin
- `dictionary.sources` stored as JSON array `["msa"]` (was Postgres `text[]`)
- `dictionary.forms` stored as JSON string (was Postgres JSONB)

### Key schema notes
- All snake_case columns normalized to camelCase in `src/lib/dataService.js`
- `decks.review_frequency`: `'daily' | 'weekly' | 'monthly' | 'custom' | NULL`
- `sentences.source`: `'user'` (manual) vs `'sentence_flag'` (auto-flagged)
- `contributions.source`: `'user'` vs `'sentence_flag'` vs `'gemini'` (AI-detected from notebook analysis)

### CLI tools
- `php server/import-data.php` — import CSV exports from `server/data/exports/` into SQLite (19 tables). Shows deprecation warnings on PHP 8.5 — harmless.
- `php server/set-password.php <email> <password>` — set/reset user password (bcrypt hash). Required for all accounts migrated from Supabase since passwords don't transfer.

### API routes summary
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | none | Returns JWT token |
| POST | `/auth/register` | none | Creates user + profile, returns JWT |
| GET | `/auth/me` | required | Validates token, returns user info |
| GET/PUT | `/profiles/:id` | required | Profile CRUD (trust score admin-protected) |
| GET/POST/PUT/DELETE | `/decks/*` | required | Deck CRUD |
| GET/POST/PUT/DELETE | `/words/*` | required | Word CRUD + `/words/batch` + `/words/exists` |
| GET/POST/PUT | `/srs/*` | required | SRS card CRUD + `/srs/batch` |
| GET | `/dictionary/*` | optional | Browse/search dictionary |
| GET/POST/DELETE | `/community/*` | varies | Community decks + collections + batch orders |
| GET/POST/PUT | `/contributions/*` | required | Contributions + voting + moderation |
| GET/POST/PUT/DELETE | `/sentences/*` | required | Sentence CRUD |
| GET | `/stories/*` | optional | Stories + collections + progress |
| GET | `/quran/:surah` | none | Surah words (supports `?verse=N` filter) |
| GET | `/quran/search` | none | Search quran words |
| GET | `/quran/count` | none | Word count for surah |
| POST/GET | `/study/*` | required | Study log |
| POST | `/sessions/*` | required | App session tracking |
| POST | `/feedback` | required | Submit feedback |
| GET | `/admin/stats` | admin | Admin dashboard stats |
| GET/POST/PUT/DELETE | `/notebook/classes/*` | required | Notebook class CRUD |
| GET/POST/PUT/DELETE | `/notebook/classes/:id/lessons` `/notebook/lessons/:id` | required | Lesson CRUD |
| GET/PUT | `/notebook/lessons/:id/strokes` | required | Stroke data (full replace on save) |
| POST/GET/DELETE | `/notebook/images/*` | required | Image upload + list + delete |
| POST | `/notebook/analyze` | required | Gemini AI analysis (multimodal, 5 modes) |
| DELETE | `/contributions/:id` | admin | Delete a contribution |
| POST | `/contributions/:id/to-dictionary` | admin | Add contribution word to dictionary |
| POST | `/tts/speak` | required | Legacy Azure TTS (no longer used — TTS is client-side) |
| GET | `/tts/cache/:key` | none | Legacy cached TTS audio (no longer used) |

---

## Authentication (`src/auth/AuthContext.jsx`)
- JWT auth (HS256) via PHP backend — token stored in localStorage as `kalimat_token`
- On mount: validates existing token via `GET /auth/me`
- `login()` calls `POST /auth/login`, `register()` calls `POST /auth/register`
- `useAuth()` hook: `{ currentUser, loading, isGuest, guestData, login, register, logout, updateUser, deleteAccount, loginAsGuest }`
- `currentUser` shape: `{ id (UUID), email, username }`
- Guest mode: `loginAsGuest()` sets `isGuest = true`, `guestData` with demo content — no backend needed
- Password reset: admin-only via CLI (`set-password.php`), no email flow yet
- `ForgotPassword.jsx` and `ResetPassword.jsx` are simplified static pages directing users to contact admin

---

## Routing (`src/App.jsx`)
Public: `/login`, `/register`, `/forgot-password`, `/reset-password`

Protected (ProtectedRoute → Layout → Outlet):
- `/dashboard` — Dashboard.jsx
- `/flashcards` — Flashcards.jsx (`?deck=ID&mode=review`)
- `/word-bank` — WordBank.jsx (`?section=words|roots|sentences`)
- `/decks` — Decks.jsx (renders WordBank with `forceSection="decks"`; own sidebar nav item, no secondary sidebar)
- `/dictionary` — Dictionary.jsx
- `/quran` — QuranicLexicon.jsx
- `/community` — CommunityDecks.jsx (`?section=team|browse|mine`)
- `/contributions` — Contributions.jsx (`?section=pending|approved|submissions|flagged`)
- `/stats` — Stats.jsx
- `/admin` — AdminStats.jsx (admin only)
- `/stories` — Stories.jsx
- `/games` — Games.jsx hub
- `/games/memory` `/games/multiple-choice` `/games/root-grouping` `/games/speed-round` `/games/spell-it-out`
- `/notebook` — Notebook.jsx (handwriting notebook with AI analysis)
- `/settings` — Settings.jsx

---

## Layout & Sidebar (`src/components/Layout.jsx`, `src/components/Sidebar.jsx`)

### Main sidebar nav items (in order)
- Home → `/dashboard`
- Flashcards → `/flashcards`
- Games → `/games`
- Word Bank → `/word-bank`
- Decks → `/decks`
- Dictionary → `/dictionary`
- Quranic Lexicon → `/quran`
- Stories → `/stories`
- Notebook → `/notebook`
- Community Decks → `/community`
- Contributions → `/contributions`
- Statistics → `/stats`
- Settings → `/settings`
- Admin → `/admin` (admin only)

### Secondary sidebar sections (by route)
| Route | Groups & Sections |
|-------|-------------------|
| `/word-bank` | LIBRARY: Words, Roots · STUDY: Sentences |
| `/decks` | *(no secondary sidebar)* |
| `/community` | BROWSE: Kalimat Team, Browse All · MINE: My Uploads |
| `/contributions` | COMMUNITY: Pending, Approved · MINE: Submissions · [admin] MODERATION: Flagged Words |
| `/stories` | BROWSE: All Stories, Hadith |
| `/stats` | STATS: Overview, Activity, Vocabulary, Contributions |
| `/admin` | ANALYTICS: Overview, Users, Engagement, Content · COMMUNITY: Moderation, Feedback |

- Main sidebar: always collapsed width, expands to full width on CSS `:hover` (no JS toggle)
- Secondary sidebar (200px, fixed): appears on `/word-bank`, `/community`, `/contributions`, `/admin`, `/stories`, `/stats` — replaces tab buttons with `?section=` URL nav
- `body.has-secondary-sidebar` class applied by Layout when on those routes
- `main-wrapper` owns sidebar offset margin (not `main-content`)
- `GuestBanner`: `position: sticky; top: 0` above `main-content`, below secondary sidebar
- `OfflineBanner`: inside `main-content`, shown when `!navigator.onLine`
- Mobile (<768px): main sidebar becomes bottom tab bar, secondary sidebar hidden
- Profile popover (`profileOpen` state) closes on `onMouseLeave` of `<aside>` — prevents popover staying open and stretching when sidebar CSS-collapses
- **Sidebar logo**: `.sidebar-logo` is `position: relative`. The icon (`sidebar-logo-icon`) is `position: absolute; left: calc((var(--sidebar-collapsed-width) - 26px) / 2); top: 50%; transform: translateY(-50%)` — absolutely positioned so it never shifts regardless of flex layout changes when the sidebar expands. `.sidebar-logo` has `padding-left: calc((var(--sidebar-collapsed-width) + 26px) / 2)` to reserve space for the icon, and `.sidebar-logo-text` follows as a normal flex item with `padding-left: 10px` for the gap.

---

## SM-2 Algorithm (`src/srs/sm2.js`)
3-rating system (Easy was removed in v1.0.3):
- Hard (0) → q=1 (resets: interval back to 1, repetitions reset)
- Close (1) → q=2 (resets)
- Easy (2) → q=4 (advances: rep0→1d, rep1→6d, rep2+→interval×easeFactor)

`getSRSStatus(card)`: new / learning / review / mastered
`previewIntervals(card)`: returns estimated next interval for each button

---

## Data Layer (`src/lib/dataService.js`)
All API CRUD lives here (uses `api.get/post/put/del` from `src/lib/api.js`). Key functions:
- `normalizeWord / normalizeDeck / normalizeSrsCard` — snake_case → camelCase. `normalizeDeck` includes `reviewFrequency`, `reviewIntervalDays`, `nextDeckReview`
- `batchImportDeck(userId, deckData, words, communityDeckId)` — bulk insert via `POST /words/batch` + `POST /srs/batch`
- `markWordsAsKnown(cardIds)` — sets repetitions=3, interval=21, ease=2.5, next_review=+21d
- `resetSrsCard(cardId)` / `resetDeckSrsCards(userId, deckId)` — reset SM-2 progress
- `updateSrsCard(id, updates)` — camelCase → snake_case for API
- `lookupWordInDictionary(arabic)` — dictionary auto-fill for word forms
- `propagateSentence(sentence, words)` — links approved sentence to matched word bank entries
- `flagSentenceUnknowns(tokens, userId, username)` — submits unknown tokens to contributions
- `getStories(collectionSlug)` — sorted by order_index ASC
- `upsertStoryProgress(userId, storyId, segmentsRead, completed)`
- `getUserSentences(userId)`, `createSentence(userId, {arabic, translation})`, `updateSentence(id, updates)`, `deleteSentence(id)` — sentence CRUD
- `getSentenceFlagContributions(limit)` — fetches contributions where `source = 'sentence_flag'` (Unknown Words tab)
- `getContributions({ status, source, limit, offset })` — optional `source` filter for separating manual vs sentence-flagged
- `Promise.allSettled` pattern used in CommunityDecks (not Promise.all — one failure must not kill both fetches)

---

## Pages Summary

**Dashboard** — greeting, review CTA (auto-starts session), 4 metric cards (Studied, Time, Pace, Retention — all from localStorage `kalimat_today_stats`), year activity calendar (YearCalendar.jsx — fixed-year view, year nav arrows, no DOW labels), Ayah of the Day (rotates daily by day-of-year). "Needs Attention" / weakest words section removed — keep it gone. `dueCount` is a `useMemo` that excludes cards from frequency decks where `nextDeckReview > now`.

**Flashcards** — setup screen (deck selector, Due only/All cards, limit 10/20/50/All) → SM-2 session → complete screen. `FLIP_DURATION = 400ms`, `isAnimating` ref prevents race. Card front shows forms button. Card back shows notes (mnemonic). Undo last rating (Z key or button) — stores `{ cardIndex, cardId, prevState, ratingKey }` in `lastRating` state, restores SRS card to previous state. Rating buttons always rendered; visibility/opacity/pointer-events toggled (prevents layout jump on flip). Keyboard: Space=flip, 1/2/3=rate, Z=undo. Auto-starts when navigated via Dashboard "Start Review" (`?mode=review`) using `didAutoStart` ref guard.
- **Scratchpad** (`src/components/Scratchpad.jsx`): Drawing canvas below the flashcard for practicing Arabic handwriting with mouse/touch/stylus. Uses HTML5 Canvas + Pointer Events (unified mouse/touch/stylus). Undo (last stroke) and Clear buttons. Auto-clears when advancing to next card via `clearTrigger={sessionIndex}`. Handles Retina/HiDPI via `devicePixelRatio` scaling + `ResizeObserver`. `touch-action: none` on canvas prevents scroll interference. Stroke color reads `--color-text` for dark mode support. No backend — ephemeral drawing only.
- **Frequency deck handling**: if selected deck has `reviewFrequency`, always loads all cards via `getAllSrsCardsWithWords` (bypasses mode toggle). Setup screen shows a teal info banner. Active session shows a "Mark Done" button (teal, CheckCircle icon) in the header. When all cards reviewed OR "Mark Done" pressed → calls `applyFrequencyDeckReview(deck, userId)` which sets `next_deck_review = now + interval`.
- **All-decks review mode**: filters out cards from frequency decks where `nextDeckReview > now` (paused decks don't pollute the queue).
- `getDeckIntervalDays(deck)`: daily=1, weekly=7, monthly=30, custom=`reviewIntervalDays||7`
- `applyFrequencyDeckReview(deck, userId)`: module-level async helper, calls `updateDeck(deck.id, { next_deck_review })`

**Word Bank** (`/word-bank`) — secondary sidebar: Words (LIBRARY) / Roots (LIBRARY) / Sentences (STUDY). Words tab: search/filter/inline-edit/batch-delete/mark-as-known/reset SRS. Sentences tab: Arabic sentence composer with autocomplete from word bank, interlinear gloss auto-generated from matches, approve/reject (admin). SQL needed: `ALTER TABLE public.words ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';`

**Decks** (`/decks`) — standalone page (own sidebar nav item, no secondary sidebar). Renders `WordBank` with `forceSection="decks"`. Deck CRUD: create/rename/delete, share/unshare to community, reset progress, download count badge, Study links. 3-dot menu per deck: Print PDF, Export, Share to community / Un-share, **Review schedule**, Reset progress, Delete.
- **Review schedule** (`ReviewFrequencyModal`): sets `review_frequency` + `review_interval_days` on the deck. Options: No schedule / Daily / Weekly / Monthly / Custom (N days). When a frequency is set, the deck card shows a `RefreshCw` badge (`weekly · due` in brand colour, or `weekly · in 3d` in muted grey). The individual SRS "X due" badge is suppressed for frequency decks.
- Frequency deck behaviour: deck interval overrides individual SRS — all cards shown when the deck is due. `next_deck_review` is set to `now + interval` when a frequency session completes (either all cards reviewed or user presses "Mark Done").
- `handleFrequencySave(deckId, updates)` calls `updateDeck` then patches local `decks` state with camelCase fields directly (no full reload).

**Dictionary** — open book layout (deep navy covers, cream pages `#f7f4ed`, navy spine). Idle state: alphabetical Arabic browse (loaded via `getDictionaryAll()`). Search filters entries in the book. 4 entries per page per side. Admin can delete words. Contributions tab in Word Bank for suggesting words.
- Entry layout: header row with [POS badge + root] on the left, [Arabic word + actions] on the right. Definition below as plain text. Form count shown as italic hint (e.g. "3 forms") — no form chips. Click entry to open detail modal with full conjugation table.
- Admin import controls (source select + Import JSON button) live on their own row below the search bar. `importAdminCommunityDeck` bypasses the normal user-deck requirement.
- Source filter chips (All/Quran/Bayna Yadayk/MSA) removed — were admin-only and not useful to regular users. `getDictionaryBySource` and `getDictionarySourceCounts` imports no longer used in Dictionary.jsx.
- English search (4+ chars): results re-sorted client-side — entries where the query is a whole word in the definition (word boundary regex `\b`) rank above entries where it only appears as a substring (e.g. "here" before "hereafter"). Under 4 chars: original order preserved.

**QuranicLexicon** — all 114 surahs, fetched via `api.get('/quran/:surah')`, debounced search via `api.get('/quran/search')`, Arabic on-screen keyboard, English translation under every word, click word → side panel + Add to Word Bank. `pendingScrollWord` pattern (stores surah+verse+position, surah guard prevents premature clearing). SURAH_LIST has type (Makki/Madani), verses count. Surah info panel: Type, Verses, Words, Letters, Hasanat (×10). Cache-first loading: checks offlineDb first, falls back to API.
- **Vocabulary coverage**: On login, all user word bank Arabic values are fetched once into `userWordSet` (a `Set` of `normalizeArabicQuery(arabic)` strings). Per surah, `surahCoverage` memo deduplicates words by `arabic_bare` and counts known vs unknown. Info panel shows "X / Y words known" with an animated progress bar and an "Add N unknown words to deck" button (opens the existing export modal pre-filtered to unknown words only). Words already in the user's bank are highlighted green in the surah text (`.quran-word.known` → `color: var(--color-success)` on `.quran-word-arabic`).
- **"In Quran" count**: When a word is selected, a count query fires against `quran_words` via API — tries `arabic_bare` first (groups diacritical variants), falls back to exact `arabic` match if count is 0. Shown as "In Quran — 34x" in the word detail panel.

**Community Decks** — secondary sidebar (?section=team|browse|mine). Reads only from `community_decks` table. Admin or uploader can delete. Import is always available (no disabled "Imported" button) — download count only increments on first import per session. Bayna Yadayk Ch1-16 seeded (uploader_username='Kalimat Team'). Admin-only "Import Deck" button next to search bar — calls `importAdminCommunityDeck(userId, { title, description, uploaderUsername, words })` which inserts directly into `community_decks`. **isOwn logic**: Kalimat Team decks (`uploader_username === 'Kalimat Team'`) are never treated as own — even if the admin uploaded them — so they always show Import not Un-share. **Deduplication**: before deduplicating by title, sort by `isTeamRow` first (Kalimat Team rows always win over user-uploaded duplicates), then by newest `created_at`. This prevents old personal-upload rows from hiding the canonical Kalimat Team versions.

**Team tab folder system** (`src/components/TeamTab.jsx`): The team tab renders a folder/collection view instead of a flat grid. Folders are `community_collections` rows; decks have `collection_id` + `order_index` columns. Admin can: create folders (New Folder button), rename/delete folders (pencil/trash on folder header), drag folders to reorder, drag decks within or between folders, drag decks to/from Uncollected section. Regular users see the same folder structure (collapsed by default) but without drag handles. Uses `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@dnd-kit/modifiers`. Key implementation notes:
- `buildDeckMap(decks, collections)` — decks with unknown/deleted `collection_id` fall back to `uncollected` (never silently vanish into unrendered buckets)
- `setDeckMapSync` — wrapper around `setDeckMap` that also updates a `deckMapRef` to avoid stale closures in async drag handlers
- `snapCenterToCursor` modifier on `DragOverlay` — fixes jump-to-top-of-page bug caused by incorrect bounding rect measurement in scrolled/nested containers
- `MeasuringStrategy.Always` on DndContext — ensures positions are always fresh
- Folders collapsed by default (`expanded` state starts as empty Set)
- `onEditDeck` prop passed from CommunityDecks → TeamTab → SortableDeckRow/SortableCollection — opens the same edit modal (title, description, Clear All Words, Import JSON)
- `patchCommunityDeckMeta` and `patchCommunityDeckWords` (also updates `word_count`) for API updates
- `batchUpdateCollectionOrders([{id, order_index}])` and `batchUpdateDeckOrders([{id, order_index, collection_id}])` for persisting drag order

**Contributions** — secondary sidebar (?section=pending|approved|submissions|flagged|gemini). Community word suggestions: upvote/downvote, auto-approve at +5 net votes. Admin can approve/reject manually. "Unknown Words" tab (section=flagged) shows sentence-auto-flagged contributions (`source='sentence_flag'`); populated when admin approves a sentence and tokens not found in dictionary. "Pending" tab shows only the current user's own pending submissions (excludes sentence_flag source). Trust score on profiles. Users cannot vote on their own submissions.
- **Gemini tab** (section=gemini): Shows AI-detected words from notebook analysis (`source='gemini'`). Admin-only features: Delete button (Trash2) removes contribution + votes + audit, "Dict" button (BookPlus) adds word to dictionary with forms lookup from `words` table (checks for duplicates by stripped diacritics). `dictAdded` Set tracks IDs already added.
- **Gemini contribution deduplication**: Separate code path for `source === 'gemini'` — checks ALL gemini contributions regardless of status (not just pending), silently returns `isDuplicate` without creating votes.

**Stats** — plain-English labels, "Your Numbers", "Your Contributions", Review History (14 days), Coming Up This Week (7-day forecast), Deck Breakdown table, top metrics.

**AdminStats** — admin-only. User list, app sessions, engagement stats, content stats, feedback inbox.

**Stories** — bookshelf layout (cartoony book spines, hover-lift, info panel below). Collections: Nawawi's 40 Hadith + Ibn Rajab's 8 (supplement). Books show reading progress overlay. Clicking opens story reader with segmented text (arabic + translation + notes per segment).

**Notebook** (`/notebook`) — Full handwriting notebook for Arabic lesson notes. Class → Lesson hierarchy in a collapsible left sidebar panel. Lessons contain a full canvas for drawing, text, and images.

### Files
- `src/pages/Notebook.jsx` (v2.9.1) — page shell: sidebar, class/lesson tree, AI analysis panel
- `src/components/notebook/NotebookCanvas.jsx` (v2.9.2) — all canvas logic: drawing, tools, elements, undo/redo, export
- `src/components/notebook/NotebookToolbar.jsx` (v2.9.2) — toolbar with tool buttons, color/thickness, AI menu
- `src/components/notebook/SelectionToolbar.jsx` (v2.9.0) — floating toolbar for lasso selection (color, thickness, duplicate, flip, delete)
- `server/api/routes/notebook.php` — classes/lessons/strokes/images CRUD + Gemini analysis endpoint

### Canvas Architecture
- Three stacked `<canvas>` layers: `linesCanvas` (template background), `staticCanvas` (committed elements), `activeCanvas` (in-progress stroke preview)
- `elementsRef` (renamed from `strokesRef`): polymorphic array of stroke, text, and image elements. Elements without `type` field are treated as strokes for backward compatibility.
- Viewport transform: `viewRef = { x, y, zoom }` — pinch-to-zoom on touch, ctrl+wheel zoom, touch pan, wheel scroll
- Retina/HiDPI: `devicePixelRatio` scaling + `ResizeObserver`
- Auto-save: 2-second debounce via `scheduleSave()`, also saves on `beforeunload` and lesson switch
- Undo/redo stack: `undoStackRef` / `redoStackRef` — action types: `draw`, `erase`, `clear`, `transform`, `deleteSelected`, `addText`, `editText`, `colorChange`, `thicknessChange`

### Tools
- **Pen** — pressure-sensitive strokes via Pointer Events. Snap-to-endpoint (10px). Line straightening on hold (500ms timer → straight line preview, can rotate/resize around origin). Stroke smoothing toggle (quadratic Bezier through midpoints). RDP point simplification (tolerance 0.3) for data size. Colors (7) and thickness (thin/medium/thick).
- **Highlighter** — `globalCompositeOperation: 'multiply'`, `HIGHLIGHTER_OPACITY = 0.3`, width ×3
- **Eraser** — hit-test on move, removes matching elements
- **Cursor** (MousePointer2 icon) — universal select/move/resize tool. Hit-tests images (move + corner resize handles), text (opens editor), strokes. Aspect-ratio-locked resize via corner handles (tl/tr/bl/br).
- **Lasso** — draw freeform polygon, selects elements inside via ray-casting (`pointInPolygon`). Selection persists (Notability-style) until click-away or tool change. Uses ref-synced state pattern (`selectedIndicesRef` + `selectedImageRef`) for immediate canvas drawing after `setState`. Lasso polygon stored in `lassoPolygonRef` for persistent visual display. Drag to move selection. Click inside → toggle floating SelectionToolbar. Undo/redo for transform and delete.
- **Text** — click to create new text element, click existing to edit. RTL direction, Noto Naskh Arabic font. `editingText` state with `textAreaRef` overlay.
- **Image** — insert images from file picker or clipboard paste (right-click → `navigator.clipboard.read()`). `compressImage(file, maxDim=2048, quality=0.92)`. Images are base64 data URLs stored inline in the element. Select → move/resize with blue dashed border + white corner handles. Aspect-ratio-locked resize.
- **Right-click**: `if (e.button === 2) return` at top of `handlePointerDown` blocks drawing. `contextmenu` handler reads clipboard for image paste.

### Ref-synced state pattern (critical for canvas drawing)
```jsx
const [selectedIndices, _setSelectedIndices] = useState(null)
const selectedIndicesRef = useRef(null)
const setSelectedIndices = (v) => { selectedIndicesRef.current = v; _setSelectedIndices(v) }
```
Needed because `setState` is async — calling `setSelectedIndices(hits)` then `redrawAll()` reads stale state in the closure. Canvas drawing functions (`redrawStatic`, `drawSelectionHighlight`, `updateSelectionBoundsScreen`) read from refs for immediate access.

### Page Templates
5 templates: `lined`, `blank`, `grid`, `dotted`, `arabic` (default). Arabic template has 48px spacing with solid baseline + dashed midline guide. Template stored in `notebook_lessons.template` column. Template selector dropdown in lesson header.

### Export
- `exportAsPNG` / `exportAsPDF` — renders to offscreen canvas at `EXPORT_WIDTH = 800`. PNG via `canvas.toDataURL()`, PDF via jspdf.
- `getCanvasImage()` — captures content area (up to last element + 40px margin) at 2x resolution for AI analysis.

### AI Analysis (5 modes)
Toolbar Sparkles button opens a popover menu with 5 modes:
1. **Transcribe & Translate** (`transcribe`) — reads Arabic handwriting, provides transcription + translation
2. **Explain My Notes** (`explain`) — turns messy notes into organized study notes
3. **Tutor Feedback** (`feedback`) — grammar corrections, handwriting tips, what went well
4. **Full Analysis** (`full`) — all of the above combined
5. **Ask About This Note** (`ask`) — conversational Q&A about the notes

All modes also extract vocabulary words with full tashkeel, roots, forms, and example sentences.

- **Backend** (`notebook.php`): Modular prompt builder per mode. Uses Gemini 3.6 Flash (`gemini-3.6-flash`). `system_instruction` with mode-specific JSON schema. `responseMimeType: 'application/json'`. Temperature 0.3. Response normalization: remaps Gemini's output fields to expected field names per mode (Gemini often ignores the requested schema and puts content in wrong fields).
- **Frontend** (`Notebook.jsx`): Analysis panel slides in on the right. `analyzeResult._mode` drives which sections to display. `show(field, ...modes)` helper gates sections — falls back to showing everything when `_mode` is undefined (backward compat with cached results). Follow-up Q&A with conversation history. Results cached in `localStorage` per lesson. "Re-analyze" button preserves current mode.
- **Auto-log words**: `autoLogWords()` submits all Gemini-detected words to contributions with `source: 'gemini'`, `status: 'approved'`.
- **Add to deck**: Words panel shows deck selector + per-word "Add" button to create word in user's deck.

### Sidebar (overlay panel)
Left panel with class/lesson tree. Auto-closes when a lesson is selected. Remembers last-used lesson in `localStorage` (`kalimat_last_lesson`). Class CRUD (create/rename/delete), Lesson CRUD (create with title+date/rename/delete). 3-dot menus with Pencil/Plus/Trash2 actions.

### Data service functions (`dataService.js`)
- `getNotebookClasses()` / `createNotebookClass()` / `updateNotebookClass()` / `deleteNotebookClass()`
- `getNotebookLessons(classId)` / `createNotebookLesson()` / `updateNotebookLesson()` / `deleteNotebookLesson()`
- `getNotebookStrokes(lessonId)` / `saveNotebookStrokes(lessonId, strokes)` — full replace on save
- `updateLessonTemplate(lessonId, template)`
- `uploadNotebookImage(lessonId, file)` / `getNotebookImages(lessonId)` / `deleteNotebookImage(imageId)`
- `analyzeNote(imageBase64, prompt, history = [], mode = 'full')` — sends to Gemini via backend
- `deleteContribution(contributionId)` — admin-only DELETE
- `addContributionToDictionary(contributionId)` — admin-only, adds word to dictionary with forms lookup

**Games** — hub page + 5 games:
- Memory Match: flip card pairs
- Multiple Choice: English → pick Arabic (4 options)
- Root Grouping: NYT Connections-style, group words by shared root. Default source is dictionary (`getDictionaryAll(3000)`). Users can switch to all their decks or a specific deck (disabled if not enough roots). Deduplicates by stripped diacritics before grouping. `findRootGroups` tries configs 4x4 → 4x3 → 3x4 → 3x3 → 2x4 → 2x3. `deckValid` map pre-computed via useMemo (never call `findRootGroups` inside JSX render).
- Speed Round: 60s countdown, endless cycling, personal best in localStorage
- Spell It Out: two modes toggled with Lucide icons (BookOpen=Reading, Headphones=Listening). **Listening mode is the default.** In listening mode a large SpeakButton replaces the English prompt and auto-plays on each new word; English/POS/root revealed after submitting. In reading mode English is shown upfront. Vowel-insensitive matching.

**Settings** — display name edit, theme toggle, SRS info, delete account (type "DELETE"). `APP_VERSION` constant here must match package.json.

---

## Offline Mode
- `src/db/offlineDb.js` — Dexie `KalimatOfflineCache` (snake_case to match API response rows)
- `src/lib/syncService.js` — `initialSync(userId)`, `flushSyncQueue()`, `updateSrsCardLocally()`, `queueSrsCardUpdate()`
- On login: `initialSync` downloads all user data into IndexedDB (fire-and-forget)
- On reconnect (`window online` event in App.jsx): `flushSyncQueue` sends queued SRS ratings
- Works offline: Flashcards (full SRS), Word Bank (read-only)
- Requires wifi: Quran Lexicon, Dictionary, Community Decks, Contributions, all writes except SRS ratings

---

## TTS (`src/components/SpeakButton.jsx`)
- Uses the **browser's built-in Web Speech API** (`speechSynthesis`) — no server-side TTS, no Azure dependency
- Requires the user to have an Arabic voice installed on their device (e.g. Saudi Arabia Arabic language pack)
- Voice selection: picks the first voice where `lang` starts with `ar` via `speechSynthesis.getVoices()`
- `utterance.lang = 'ar-SA'` ensures Arabic pronunciation even if no exact voice match
- Story mode rate: `-25%` (parsed to `0.75`) | Default rate everywhere else: `-15%` (parsed to `0.85`)
- `speakArabic(text, { rate })` is exported for direct use (e.g. Spell It Out auto-play)
- `SpeakButton` accepts `className` prop (used for `.speak-btn-lg` large variant in Spell It Out listening mode)
- Double-play prevention: `speechSynthesis.cancel()` called before each new utterance
- No authentication, caching, or rate limiting needed — runs entirely client-side
- **Legacy**: Server-side Azure TTS routes (`server/api/routes/tts.php`, `server/api/lib/tts.php`) and `tts_rate_limits` table still exist but are no longer used by the frontend.

---

## Styling
- CSS variables: `--color-brand: #18E299` (teal accent), `--color-primary: #0d0d0d` (near-black — NOT the purple from old CLAUDE.md)
- Dark mode via `[data-theme="dark"]` on `<html>`; theme stored in localStorage `kalimat_theme`
- Arabic text: `font-family: 'Noto Naskh Arabic'` loaded from Google Fonts in index.html
- Flashcard 3D flip: `.flashcard-scene` → `.flashcard.flipped` → `.flashcard-face.flashcard-back`
- `.flashcard-back`: `background: var(--color-brand-muted)`, `border-top: 3px solid var(--color-brand)`
- Rating buttons always rendered; hidden via `visibility/opacity/pointer-events` (prevents layout jump on flip)
- Book spine text: `writing-mode: vertical-lr; transform: rotate(180deg)`
- Dictionary open book: flexbox layout — covers + page-edge stacks + pages + spine

---

## Key Gotchas
- `--color-primary` is near-black (`#0d0d0d`), NOT purple — use `--color-brand` for the teal accent
- Admin check: PHP middleware `require_admin()` compares JWT email to `config['admin_email']`
- Auto-start effect in Flashcards.jsx must be placed AFTER `const handleStart = useCallback(...)` — `const` is not hoisted, temporal dead zone crashes the component (white page symptom)
- `Promise.all` in CommunityDecks was replaced with `Promise.allSettled` — one failing query must not kill the page
- `formatArabicInput` adds spaces between letters (for root display) — wrong for actual word input fields; use `appendWordLetter` instead
- `isPublic` on decks is INTEGER (0/1) in SQLite
- `.spinner` CSS uses `conic-gradient` + `mask` (NOT border-top trick) — do not revert to border approach as it causes a miter-line artifact that rotates with the spinner
- Sidebar active state uses a `::before` pseudo-element with fixed `left/right: calc(var(--sidebar-collapsed-width)/2 - 18px)` in collapsed state, transitioning to `left/right: 0` when expanded — percentage-based values cause the highlight to drift during the width animation, always use fixed px values anchored to `--sidebar-collapsed-width`
- API responses return data directly (not wrapped in `{ data, error }` like Supabase) — errors throw exceptions
- Apache/cPanel strips `Authorization` header — `.htaccess` must include the rewrite rule to pass it through (see Deployment section)
- `dist/` must be rebuilt (`npm run build`) and re-uploaded after any frontend code change — the live server serves static files, not a dev server
- Local and live databases are completely independent — changes to one do not affect the other
- `import-data.php` imports users WITHOUT passwords — must run `set-password.php` for each account after import
- `src/lib/supabase.js` has been deleted — was dead code from the Supabase migration
- Notebook canvas: `selectedIndices` / `selectedImage` state must use ref-synced pattern — calling `setState` then `redrawAll()` reads stale state because React batches updates. Canvas drawing reads from `selectedIndicesRef.current` / `selectedImageRef.current` instead.
- Gemini API doesn't reliably follow JSON schema — backend normalizes response fields per mode (e.g. remap `analysis` → `explanation` for explain mode)
- PowerShell doesn't support `&&` chaining — `git add` commands must be run one at a time, keep each short to avoid line-splitting
- Notebook elements array is polymorphic: stroke (legacy, no `type` field), `type: 'text'`, `type: 'image'`. Elements without `type` treated as strokes for backward compat.
- `notebook_lessons.template` defaults to `'arabic'` — migration adds column to existing tables via try/catch ALTER TABLE
