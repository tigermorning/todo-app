# Todo App

> **Note:** The app's UI (buttons, labels, messages) is entirely in Korean, and quick-entry parsing only understands Korean sentences. This README is written in English for a wider GitHub audience — the app itself has not been translated.

A personal, local-first Todo app built with Python (FastAPI) and SQLite. It runs entirely on your own computer — there's no hosted backend, no account system, and no server costs, even if you make the code public. Each person who runs it keeps their own local database file.

The standout feature is **Korean natural-language quick entry**: type a sentence like `내일 오후 1시에 네일숍` ("nail salon tomorrow at 1pm") and the app extracts the title and due date/time automatically, including compact recurring schedules like `8/3-11/5 격주 공원 산책` ("park walk, biweekly, Aug 3 to Nov 5").

## Features

- **Basic CRUD** — add, list, complete (strikethrough), delete
- **Multi-select** — **you must click a todo's title or time text to select it** (the checkbox alone does not start a selection — a plain click on it just toggles done, like always). Once something is selected:
  - **Shift+click** another title, time, or checkbox extends a contiguous range from the last-selected item (Explorer/Finder-style)
  - **전체 선택** (select all) above the list selects every currently-visible todo in one click
  - the **bulk-actions bar** that appears lets you delete the whole selection, or clear it
  - **checking/unchecking any selected item's checkbox applies to the entire selection**, not just that row
- **Persistent storage** — a single local SQLite file (`todo.db`), survives restarts
- **Categories** — 6 built-in presets (exercise / work / study / chores / social / etc.), grouped by color so related categories look alike at a glance. Fully customizable: add your own, rename, change icon/group, or delete — right from the app, no code editing required
- **Quick natural-language entry (Korean)** — parses relative dates (오늘/내일/모레/글피), weekdays (다음주 화요일), explicit dates (7월 25일), and both 12-hour (오후 3시) and 24-hour (20:30) time notation
- **Recurring todos** — daily / weekly / biweekly, with an end date and optional exception date ranges (e.g. skip a vacation week). Can be created either through a structured form or the same natural-language input (`매일 9시 약 복용`, `8/3-11/5 격주 공원 산책`)
- **Search and category filters**
- **Overdue check** — while the app is open in your browser, it periodically flags anything past its due time that's still unchecked, and lets you mark it done, reschedule it, or snooze it. Optional browser notifications (only fire while the tab is open — there's no background service)
- **Sidebar** — a month calendar (click a day to filter the list to it), a circular-cell heatmap of the current month's completions (darker = higher completion rate that day, with the date number shown on each cell), and a category-filtered news headline widget (politics/economy/society/IT/sports/world, from 경향신문's public RSS feeds — no API key required)
- **Google Calendar integration (optional)** — read-only OAuth connection that surfaces upcoming calendar events as suggested todos; nothing is imported until you accept it

## Requirements

- Python 3.10+
- Windows, macOS, or Linux (developed and tested primarily on Windows)

## Setup

```bash
git clone https://github.com/tigermorning/todo-app.git
cd todo-app
python -m venv venv
```

Activate the virtual environment:

```bash
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (cmd)
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Then run it:

- **Windows**: double-click **`start.bat`** (or run it from cmd/PowerShell) — it activates the virtual environment and starts uvicorn with the paths below filled in automatically.
- **macOS / Linux**:
  ```bash
  uvicorn main:app --reload --reload-exclude="$(pwd)/venv" --reload-exclude="$(pwd)/__pycache__"
  ```

Open **http://localhost:8000** in your browser. That's it — the SQLite database and all category presets are created automatically on first run.

> **Why `--reload-exclude` needs an absolute path:** without it, `--reload` watches every file inside `venv/` too — including the entire installed dependency tree (fastapi, google API client libs, etc., thousands of files), any of which can have its mtime touched by pip, an antivirus scan, or backup/sync software and trigger a reload storm that looks like the server "randomly crashing". A glob like `--reload-exclude=venv/*` or a bare relative name like `--reload-exclude=venv` only shadows files *directly* inside `venv/` — nested files several levels down (e.g. `venv/Lib/site-packages/fastapi/applications.py`) still get watched, since uvicorn compares excluded directories against the *absolute* paths it watches, and a relative `venv` never equals an absolute one. Passing the full absolute path (as `start.bat` and the command above do) is what actually makes the exclusion recursive.

## How to use it

### Quick add (top input)

Type a sentence in Korean and press Enter. The parser recognizes:

| You type | Result |
|---|---|
| `내일 오후 1시에 네일숍` | Title: "네일숍", due tomorrow 13:00 |
| `20:30 회의` | Title: "회의", due today 20:30 |
| `다음주 화요일에 병원` | Title: "병원", due next Tuesday |
| `7월 25일에 생일파티` | Title: "생일파티", due July 25 |
| `매일 9시 약 복용` | Recurring todo, daily at 09:00 — you'll be asked how long to repeat it for |
| `8/3-11/5 격주 공원 산책` | Recurring todo, biweekly, Aug 3 through Nov 5 |
| `5/1-9/30 격주로 산책, 9월 첫째주 제외` | Recurring todo, biweekly, May 1–Sep 30, **skipping the 1st week of September** |
| `5/1-9/30 격주 산책, 9/5-9/12 제외` | Same, but the excluded range is spelled out explicitly instead of by week number |
| `수요일마다 산책` | Recurring todo, weekly, every Wednesday — you'll be asked how long to repeat it for |

#### A trigger word is required for anything recurring

`화요일에 병원` (just a bare weekday, no trigger word) is treated as a **single** upcoming appointment on the next Tuesday — not a standing weekly one. This is deliberate: most weekday mentions like that mean "this one time," not "every week." To make something recurring, include one of: `매일` (daily), `매주` (weekly), `격주` (biweekly), a date range (`M/D-M/D`), or `{weekday}요일마다` (e.g. `수요일마다`, "every Wednesday").

#### Excluding a period from a recurring todo (in the same sentence)

Add `, <period> 제외` to a recurring quick-entry sentence to skip a stretch of it (e.g. a vacation week) — no need to open the detailed form. Two forms are recognized:

- **A specific date range**: `M/D-M/D 제외` or `M월 D일부터 M월 D일까지 제외`
- **The Nth week of a month**: `M월 첫째주 제외` / `둘째주` / `셋째주` / `넷째주` / `다섯째주` 제외 (week 1 = days 1–7 of that month, week 2 = days 8–14, and so on)

Only one exclusion clause per sentence is understood. For more than one excluded period, use the detailed input form's "제외 기간 추가" (add exception) button, which accepts as many as you like.

If a category name (e.g. an existing "필라테스" category) appears literally in the text, it's assigned automatically; otherwise the todo falls back to "기타" (misc) and you can change it with one click on its badge.

Non-Korean speakers can skip natural-language entry entirely and use the date/time pickers in "상세 입력" (detailed input) instead — that part of the UI is just standard HTML form controls.

### Detailed input

Click "상세 입력" to expand a form with an explicit title field, category picker (including "⚙ 카테고리 관리" to rename/delete/edit categories), a date+time picker, and recurrence settings (daily/weekly/biweekly, required end date, optional exception date ranges).

**Note:** the title field here is used exactly as typed — it does not run through the natural-language parser. If you type a description like "수요일 산책, 9월 첫째주 제외" into this title field, it becomes the literal todo title; the date/recurrence/exception fields are the actual controls that determine when it repeats. Natural-language parsing only happens in the quick-add box at the top.

### Sidebar

- **Calendar**: dots mark days with something due; click a day to filter the list to it, click "전체 보기" to clear the filter.
- **Tracker**: one cell per day of the current month, labeled with its date number. The color darkens as that day's completion rate (완료 개수 / 마감된 할 일 개수) increases — a day with nothing due stays uncolored.
- **News**: pick a category (정치/경제/사회/IT/스포츠/세계) from the dropdown to see its 10 most recent headlines from 경향신문's public RSS feed. Click a headline to open the article in a new tab. Headlines are cached for 10 minutes per category to avoid re-fetching on every page load.

### Overdue check

Every 60 seconds while the tab is open, anything overdue and unchecked shows up in a banner with three actions: mark it done, reschedule it, or snooze it for a few hours. Click "🔔 알림 켜기" once to also get a browser notification when this happens.

### Google Calendar (optional)

This step requires your own Google account — it can't be done on your behalf, since it involves an OAuth login.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Calendar API**.
2. Configure the OAuth consent screen (External user type is fine for personal use; add your own email as a test user).
3. Create an **OAuth client ID** of type **Desktop app**, and download its JSON as `credentials.json` into this folder.
4. Copy `.env.example` to `.env` and adjust values if needed.
5. Run the one-time setup script yourself (it opens a browser window for you to log in):

   ```bash
   python setup_google_calendar.py
   ```

6. Restart the server. Upcoming events now appear as suggested todos; accepting one saves it, ignoring it hides it going forward.

## Project structure

```
todo-app/
├── main.py                    # FastAPI app and all routes
├── db.py                      # SQLite connection, schema, category presets
├── nlp.py                     # Korean quick-entry date/time parser (rule-based)
├── recurring.py               # Recurring-rule occurrence generation (dateutil.rrule)
├── calendar_sync.py           # Google Calendar API client (read-only)
├── setup_google_calendar.py   # One-time OAuth setup script (run this yourself)
├── start.bat                  # Windows: activates venv and runs the server
├── requirements.txt
├── .env.example
├── static/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── todo.db                    # Created on first run — your data, not committed
└── PRD.md                     # Full design notes and decision log
```

## Known limitations

- Natural-language quick entry only understands Korean. Structured recurrence and the date/time pickers work regardless of language.
- Browser notifications for overdue todos only fire while the app's tab is open — there's no background/always-on notification service.
- Recurring todos with no end date only materialize 60 days ahead at a time (auto-extended whenever the server restarts); recurring todos *with* an end date are generated in full immediately.
- The category-matching for quick entry looks for an exact existing category name inside the text — it doesn't infer categories it hasn't seen before.
- Quick-entry recurrence recognizes at most one `제외` (exclude) clause per sentence. For multiple excluded periods, use the detailed input form instead.

See [PRD.md](PRD.md) for the full history of design decisions, including things that were intentionally left out (and why).

## License

No license specified yet — all rights reserved by default. Ask before reusing this code commercially.
