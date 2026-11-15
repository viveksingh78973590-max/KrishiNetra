# KrishiNetra 🌾

KrishiNetra is a digital farming companion for Indian farmers, with NASA-based weather outlooks, AI farming chat, Fasal Vaidya crop diagnosis, mandi prices, government schemes, soil guidance, a farming calendar, tips, and farmer accounts.

## v9 additions (farm details, Soil Report AI, live mandi prices)

- **My Farm (Dashboard):** after login the farmer enters field area (acre / hectare / guntha, saved in acres), soil type, water source and village. Stored in the `users` table (new columns `soil_type`, `irrigation` are added automatically to an existing `krishisathi.db`).
- **Soil Report AI (new menu item + dashboard card):** upload a photo or PDF of a soil test report / Soil Health Card, or type the values. Gemini reads the values; the app rates each one with Indian Soil Health Card ranges (`soil_report.py`), gives a 0-100 soil health score, explains what is happening in the soil and gives the best solution (fixes, fertilizer plan, organic options, suitable crops). If the AI is unavailable, typed values still get built-in rule-based advice. Reports are saved per farmer (`soil_reports` table). API: `POST /api/soil-report`, `GET/DELETE /api/soil-reports`.
- **Live mandi prices:** `mandi_live.py` reads the official Agmarknet feed on data.gov.in. Add a free key as `DATA_GOV_API_KEY` in `.env` and restart. Prices are cached for 3 hours (Refresh button forces an update), the previous price and a per-day history are stored for change arrows and trend charts. Without a key the page clearly shows DEMO prices. API: `GET /api/mandi?state=..`, `GET /api/mandi/history?id=..`.

## Navigation
- Before login, the public header shows Home, About this Project, How to use, Login, and Register.
- After login, farmers land on the Farmer Dashboard. The authenticated navigation has no Home item; the public home page remains available to logged-out visitors.
- The authenticated menu includes Crop Guide, Mandi Prices, Weather, Government Schemes, AI KrishiNetra, Fasal Vaidya, Soil, Calendar, Tips, Search, and Alerts.
- Private pages and AI endpoints require a registered, logged-in account. Registration is required; there is no demo login.
- The existing `krishisathi.db` filename is intentionally retained so existing data continues to load.



## Netra, the voice guide bot (ported from PayGuard AI Pro)

A floating 3D robot (`static/bot.js`, `static/bot.css`) that works on every page of the single-page app:

- **Moves around** the screen, follows your cursor with its head, and keeps going as you change pages (it lives outside `#app`, so it is never redrawn).
- **Page introductions**: explains each page when you open it, and guides login / register (also when a private page needs a login).
- **Hover help**: put the cursor on a menu item, button, input, card or the language box and it explains it. Cards are read in the language the app is currently showing.
- **Bot tour**: the "Start bot tour" button walks through the public pages (before login) or all ten tool pages (after login).
- **Languages**: English and Hindi are built in. For other app languages it uses the app's own `/api/translate` and speaks only if the device has a voice for that language; otherwise it shows English text.
- **Human-sounding voice**: picks the most natural voice installed on the device (Microsoft "Natural/Online", Google, Apple Premium/Siri voices; robotic ones are avoided), speaks one sentence at a time with small changes in speed and pitch and natural pauses, and reads text like a person would (rupees, percent, per quintal, NASA, A I). A "Voice" dropdown lets the user choose another voice; "Voice on/off" mutes it.
- Browsers only allow speech after the first tap or key press, so the first intro shows as text and is spoken after that first tap.

Best voice quality: open the site in Microsoft Edge (free neural voices) or Chrome on Android. Files changed for this: `templates/index.html` (2 lines) and the two new `static/bot.*` files. `static/bot.css` also holds a small phone-width fix for the top bar, and `static/app.js` has a one-line fix for the Crop Guide list.

---

## Original documentation (app was called KrishiSathi)

This package keeps the converted KrishiSathi workflow and adds a robust Gemini integration.

## Windows quick start

1. Create a Gemini API key at https://aistudio.google.com/apikey (Create API key; choose "in new project" if the old one says quota exhausted).
2. Double-click `SET_GEMINI_KEY.bat` and paste the key. It tests the key and saves it into `.env` for you.
   (Manual way: copy `.env.example` to `.env` and set `GEMINI_API_KEY=` yourself. `TEST_GEMINI.bat` checks a saved key any time.)
3. Keep the key only in `.env`; do not put it in `static/app.js` or commit it.
4. Run `run_windows.bat`, or run:

```powershell
python -m pip install -r requirements.txt
python server.py
```

5. Open http://127.0.0.1:5000

## Gemini behavior

- Uses the official `google-genai` Python SDK.
- Does not force a temperature for Gemini 3.x chat requests.
- Retries temporary 503/429 failures with backoff.
- Tries `GEMINI_FALLBACK_MODEL` if the primary model remains temporarily unavailable.
- Fasal Vaidya continues to use Gemini vision when the key is configured.

## Security

Never publish `.env` or put your API key in browser JavaScript. If an API key is accidentally shared, revoke/rotate it in Google AI Studio and use the new key locally.

## Database

SQLite file `krishisathi.db` is created automatically on first run (no install needed).
Tables: `chat_messages` (AI chat history) and `diagnoses` (Fasal Vaidya history).
Each browser gets an anonymous id (stored in localStorage), so history stays after refresh.
API: `GET/DELETE /api/history`, `GET/DELETE /api/diagnoses`.
To inspect it, open the file with "DB Browser for SQLite". Delete the file to reset everything.

## Accounts and database-backed data (v3)

- Reference data (crops, schemes, mandi prices, soil, tips, calendar, weather, ...) now lives in SQLite
  tables (`crops`, `schemes`, `mandi_prices`, `reference_data`). First run seeds them from `seed_data.json`.
  The browser loads them from `/data.js`, which the server builds from the database.
  To change data: edit rows in the DB (e.g. with DB Browser for SQLite) and refresh the page.
- Farmer accounts: `/api/auth/register`, `/login`, `/logout`, `/me` (GET/PUT). Passwords are stored hashed
  (werkzeug), login uses a signed session cookie. A signing key is generated into `.secret_key` (or set SECRET_KEY in .env).
- Chat/diagnosis history is stored per user; history made before login is moved to the account on login/sign-up.
- "Quick Demo Login" is a local demo only (nothing is saved to the database).

## Live weather + languages (v4)

- Weather page now loads live data from Open-Meteo through `/api/weather` (16 districts built in, or "Use my location").
  If live data fails it falls back to the old sample data and says so. Rain / heat / frost alerts are generated from the forecast.
- AI chat and Fasal Vaidya can answer in: Hindi, English, Hinglish, Marathi, Gujarati, Punjabi, Bengali, Tamil, Telugu,
  Kannada, Malayalam, Odia, Urdu (pick from the dropdown; the EN/हिं button also sets Hindi/English).
- Mandi prices are still DEMO data (the page says so). Live prices need an official source (Agmarknet / data.gov.in API key).

## Smarter search + auto-updating schemes (v5)

- Search: you can type full words/sentences; results match ALL words (e.g. "wheat yellow leaves").
  Press Enter or the green button to fetch full details with Gemini + Google Search (shows sources).
  If nothing matches inside the app, details are fetched automatically.
- Government schemes update by themselves: while `python server.py` runs, every `SCHEMES_REFRESH_DAYS` (default 7)
  it asks Gemini (with Google Search) for the current details of each scheme and stores them in the database.
  Only answers with web sources and a valid https .gov.in/.nic.in website are accepted; anything else is ignored.
  New schemes found online are added with a "Auto-found - verify" tag. Each run is logged in table `scheme_updates`.
- Update right now: `python server.py refresh-schemes`.  Turn off: `SCHEMES_AUTO_UPDATE=0` in .env.
- Always verify scheme details on the official website before applying - AI can make mistakes.

## v6 additions (NASA live outlook + photo honesty + Gemini key)

**Gemini key:** the key in `.env` is being accepted, but Gemini reported that its free-tier request quota is exhausted. A new key must be created in Google AI Studio under a project with available quota; this app cannot generate a key. Replace `GEMINI_API_KEY` in `.env` locally and restart the server. Never paste the key into chat, browser JavaScript, or GitHub.

**NASA early warnings (Weather page + Home page)** - `nasa_outlook.py`, API: `GET /api/nasa-outlook?lat=..&lon=..`
- NASA POWER satellite records: what actually happened in the last 30 days (rain, temperature, root-zone soil moisture).
- NASA POWER climatology: what is *normal* for this exact place and month.
- 16-day forecast (Open-Meteo) compared with NASA's normal -> warnings for hot spell, cold spell / frost, rain, long dry spell, with dates.
- Note: NASA POWER has no future values (data is 2-7 days old), so the coming-days forecast comes from weather models; NASA data is used for the history and for judging what is unusual.
- Home page "Live NASA field reading" fills with live NASA data (Lucknow, or your location if already allowed).

**Fasal Vaidya v2** - `imagecheck.py` + `/api/diagnose`
1. AI-generated photo check: file markers (C2PA, SynthID, Midjourney, Stable Diffusion prompt data ...) + Gemini vision forensic check.
   AI photos are rejected: "please upload the real photo". Edited photos get a warning.
2. Blurry or dark photos are automatically sharpened / brightened first (before-after shown).
3. Full report: plant name, health score, disease, symptoms, causes, treatment, organic remedies, prevention, and a Soil Check (soil condition, problems, how to improve).
No AI detector is 100% accurate; the app never gives pesticide doses - ask your nearest KVK.

## v7 changes (speed fixes + whole-app language switch)

- **Fasal Vaidya is much faster.** Photo authenticity check and disease report now happen in ONE Gemini call (before: two slow calls one after the other). Every Gemini call also has a hard timeout, so it can never hang forever.
- **AI KrishiNetra chat fixed.** It now gives a direct, useful answer first instead of only asking questions, and replies in about 120-250 words.
- **Language dropdown (top right, on every page incl. Home).** Pick any language and the whole app (menus, home page, dashboard, all pages) is translated. Translations are made by Gemini once, then saved in the database table `translations` and in the browser, so the next time it is instant. English needs no translation.
- **Search removed** from the logged-in menu.
- Translating a language for the first time needs `GEMINI_API_KEY` in `.env` and available Gemini quota. Cached languages switch immediately; if the API is unavailable or out of quota, the app keeps the text readable and asks you to try again later.

## v8 changes (AI KrishiNetra + Fasal Vaidya fix)

**Why the AI stopped working**
- The app's own log showed `429 RESOURCE_EXHAUSTED - You exceeded your current quota` for every Gemini call: the old key's project had no quota left. A code change cannot create quota, so a **new key is needed** (see "Windows quick start" above). Nobody but you can create a key in your Google account.
- On top of that the code had its own problems, all fixed:
  1. On a quota error (429) it never tried another model. Now it goes down the list `GEMINI_MODEL` -> `GEMINI_FALLBACK_MODEL` (default: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`). Quota is counted per model, so another model can still answer. A model that just failed is skipped for a while so replies stay fast.
  2. The old fallback `gemini-3.7-flash` is retired (Google routes it to 3.8), so it was no real backup. Retired names are now replaced automatically.
  3. Every chat / photo / translation call sent `thinking_budget=0`, which `gemini-3.8-flash` does not accept. Each model now gets a thinking setting it supports, and if one is rejected the call is retried without it.
  4. Output limits were small enough that "thinking" could use them up and cut the answer off (empty chat reply / broken diagnosis JSON). Limits raised.
  5. The whole-app **language switch could never work**: the translation reply (a JSON list) was reduced to its first item and then rejected. Fixed.
  6. The scheme auto-updater used up quota by retrying every scheme after a quota error and by making extra calls whose answers were thrown away. It now stops at the first quota error and waits about 6 hours.
  7. A stale `GEMINI_API_KEY` left in the Windows environment could silently beat the key in `.env`. `.env` now wins for the Gemini settings.
- Error messages now say exactly what is wrong (bad key / quota / model / busy) and how to fix it.

**New helper files**
- `SET_GEMINI_KEY.bat` (or `python check_gemini.py --set`) - paste a new key; it is tested and saved to `.env`. A key Google rejects is never saved.
- `TEST_GEMINI.bat` (or `python check_gemini.py`) - tells you whether AI chat, Fasal Vaidya (photo) and Google Search lookups are ready, model by model.
- `run_windows.bat` asks for a key automatically when none is saved.
- `gemini_config.py` - shared key / model-list rules used by the server and the checker.

`.env.example` no longer contains a real key. Because the previous key was stored in the shared project files, treat it as exposed: delete it at https://aistudio.google.com/apikey once the new key works.
