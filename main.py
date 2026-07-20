import json
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

import calendar_sync
from db import GROUPS, GROUP_KEYS, get_connection, init_db
from nlp import parse_quick_entry, parse_recurring_quick_entry
from recurring import extend_all_rules, materialize_occurrences


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with get_connection() as conn:
        extend_all_rules(conn)
    yield


app = FastAPI(title="Todo App", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent / "static"

GROUP_LOOKUP = {g["key"]: g for g in GROUPS}


VALID_FREQS = {"DAILY", "WEEKLY"}


def _guess_category(conn, title):
    rows = conn.execute("SELECT name FROM categories").fetchall()
    for row in rows:
        if row["name"] and row["name"] in title:
            return row["name"]
    return "기타"


def _validate_recurring_input(freq, interval, start_date, until_date, exceptions):
    if interval < 1:
        raise HTTPException(status_code=400, detail="반복 간격은 1 이상이어야 합니다.")
    if freq not in VALID_FREQS:
        raise HTTPException(status_code=400, detail="올바르지 않은 반복 주기입니다.")
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        if until_date:
            datetime.strptime(until_date, "%Y-%m-%d")
        for start, end in exceptions:
            datetime.strptime(start, "%Y-%m-%d")
            datetime.strptime(end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD 이어야 합니다.")


def _create_recurring_rule(
    conn, title, category, freq, interval, time_of_day, start_date, until_date, exceptions
):
    cursor = conn.execute(
        """
        INSERT INTO recurring_rules
            (title, category, freq, interval, time_of_day, start_date, until_date, exceptions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            category,
            freq,
            interval,
            time_of_day,
            start_date,
            until_date,
            json.dumps(exceptions),
        ),
    )
    rule_id = cursor.lastrowid
    rule_row = conn.execute("SELECT * FROM recurring_rules WHERE id = ?", (rule_id,)).fetchone()
    inserted = materialize_occurrences(conn, rule_row, today=date.today())
    return rule_id, inserted


class TodoCreate(BaseModel):
    title: str
    category: str = ""
    due_at: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str
    icon: str = ""
    group_key: str


class CategoryUpdate(BaseModel):
    name: str
    icon: str = ""
    group_key: str


class QuickEntryCreate(BaseModel):
    text: str


class TodoCategoryUpdate(BaseModel):
    category: str


class TodoDueAtUpdate(BaseModel):
    due_at: str


class TodoDoneUpdate(BaseModel):
    done: bool


class AcceptSuggestion(BaseModel):
    event_id: str
    title: str
    due_at: Optional[str] = None
    category: str = ""


class RecurringRuleCreate(BaseModel):
    title: str
    category: str = ""
    freq: str = "WEEKLY"
    interval: int = 1
    time_of_day: Optional[str] = None
    start_date: str
    until_date: Optional[str] = None
    exceptions: List[List[str]] = []


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/todos")
def list_todos(
    q: Optional[str] = None,
    category: Optional[str] = None,
    on_date: Optional[str] = Query(None, alias="date"),
):
    query = "SELECT id, title, done, created_at, category, due_at, recurring_rule_id FROM todos"
    conditions = []
    params = []
    if q:
        conditions.append("title LIKE ?")
        params.append(f"%{q}%")
    if category:
        conditions.append("category = ?")
        params.append(category)
    if on_date:
        conditions.append("substr(due_at, 1, 10) = ?")
        params.append(on_date)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY id DESC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/tracker")
def get_tracker(year: Optional[int] = None, month: Optional[int] = None):
    today = date.today()
    year = year or today.year
    month = month or today.month
    start = date(year, month, 1)
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    end = next_month - timedelta(days=1)

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS count
            FROM todos
            WHERE completed_at IS NOT NULL
              AND substr(completed_at, 1, 10) >= ?
              AND substr(completed_at, 1, 10) <= ?
            GROUP BY day
            """,
            (start.isoformat(), end.isoformat()),
        ).fetchall()
    counts = {row["day"]: row["count"] for row in rows}
    days = []
    cursor_day = start
    while cursor_day <= end:
        iso = cursor_day.isoformat()
        days.append({"date": iso, "count": counts.get(iso, 0)})
        cursor_day += timedelta(days=1)
    return {"year": year, "month": month, "days": days}


@app.get("/api/groups")
def list_groups():
    return GROUPS


@app.get("/api/categories")
def list_categories():
    with get_connection() as conn:
        rows = conn.execute("SELECT name, icon, group_key FROM categories ORDER BY id").fetchall()
    result = []
    for row in rows:
        group = GROUP_LOOKUP.get(row["group_key"], GROUP_LOOKUP["etc"])
        result.append(
            {
                "name": row["name"],
                "icon": row["icon"],
                "group_key": row["group_key"],
                "group_label": group["label"],
                "color": group["color"],
            }
        )
    return result


@app.post("/api/categories")
def create_category(category: CategoryCreate):
    name = category.name.strip()
    icon = category.icon.strip() or "🏷️"
    if not name:
        raise HTTPException(status_code=400, detail="카테고리 이름은 비어 있을 수 없습니다.")
    if category.group_key not in GROUP_KEYS:
        raise HTTPException(status_code=400, detail="올바르지 않은 그룹입니다.")
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM categories WHERE name = ?", (name,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="이미 존재하는 카테고리입니다.")
        conn.execute(
            "INSERT INTO categories (name, icon, group_key) VALUES (?, ?, ?)",
            (name, icon, category.group_key),
        )
    group = GROUP_LOOKUP[category.group_key]
    return {
        "name": name,
        "icon": icon,
        "group_key": category.group_key,
        "group_label": group["label"],
        "color": group["color"],
    }


@app.patch("/api/categories/{name}")
def update_category(name: str, update: CategoryUpdate):
    new_name = update.name.strip()
    icon = update.icon.strip() or "🏷️"
    if not new_name:
        raise HTTPException(status_code=400, detail="카테고리 이름은 비어 있을 수 없습니다.")
    if update.group_key not in GROUP_KEYS:
        raise HTTPException(status_code=400, detail="올바르지 않은 그룹입니다.")

    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="해당 카테고리를 찾을 수 없습니다.")
        if new_name != name:
            clash = conn.execute(
                "SELECT id FROM categories WHERE name = ?", (new_name,)
            ).fetchone()
            if clash:
                raise HTTPException(status_code=400, detail="이미 존재하는 카테고리입니다.")

        conn.execute(
            "UPDATE categories SET name = ?, icon = ?, group_key = ? WHERE name = ?",
            (new_name, icon, update.group_key, name),
        )
        if new_name != name:
            conn.execute("UPDATE todos SET category = ? WHERE category = ?", (new_name, name))
            conn.execute(
                "UPDATE recurring_rules SET category = ? WHERE category = ?", (new_name, name)
            )

    group = GROUP_LOOKUP[update.group_key]
    return {
        "name": new_name,
        "icon": icon,
        "group_key": update.group_key,
        "group_label": group["label"],
        "color": group["color"],
    }


@app.delete("/api/categories/{name}")
def delete_category(name: str):
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="해당 카테고리를 찾을 수 없습니다.")
        conn.execute("DELETE FROM categories WHERE name = ?", (name,))
        conn.execute("UPDATE todos SET category = '' WHERE category = ?", (name,))
        conn.execute("UPDATE recurring_rules SET category = '' WHERE category = ?", (name,))
    return {"name": name}


@app.post("/api/todos")
def create_todo(todo: TodoCreate):
    title = todo.title.strip()
    category = todo.category.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title은 비어 있을 수 없습니다.")
    if todo.due_at:
        try:
            datetime.strptime(todo.due_at, "%Y-%m-%d %H:%M")
        except ValueError:
            raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD HH:MM 이어야 합니다.")
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO todos (title, category, due_at) VALUES (?, ?, ?)",
            (title, category, todo.due_at),
        )
        new_id = cursor.lastrowid
    return {"id": new_id, "title": title, "done": 0, "category": category, "due_at": todo.due_at}


@app.post("/api/todos/quick")
def create_quick_todo(entry: QuickEntryCreate):
    raw = entry.text.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="내용이 비어 있을 수 없습니다.")

    recurring = parse_recurring_quick_entry(raw)
    if recurring:
        with get_connection() as conn:
            category = _guess_category(conn, recurring["title"])

            if not recurring["until_date"]:
                # Don't silently pick a horizon — let the user say how long
                # this should repeat for before anything is created.
                return {
                    "needs_until_date": True,
                    "title": recurring["title"],
                    "category": category,
                    "freq": recurring["freq"],
                    "interval": recurring["interval"],
                    "start_date": recurring["start_date"],
                    "time_of_day": recurring["time_of_day"],
                    "exceptions": recurring["exceptions"],
                }

            _validate_recurring_input(
                recurring["freq"],
                recurring["interval"],
                recurring["start_date"],
                recurring["until_date"],
                recurring["exceptions"],
            )
            rule_id, inserted = _create_recurring_rule(
                conn,
                recurring["title"],
                category,
                recurring["freq"],
                recurring["interval"],
                recurring["time_of_day"],
                recurring["start_date"],
                recurring["until_date"],
                recurring["exceptions"],
            )
        return {
            "recurring": True,
            "id": rule_id,
            "title": recurring["title"],
            "category": category,
            "occurrences_created": inserted,
        }

    title, due_at = parse_quick_entry(raw)
    if not title:
        raise HTTPException(status_code=400, detail="할 일 제목을 인식하지 못했습니다.")
    with get_connection() as conn:
        category = _guess_category(conn, title)
        cursor = conn.execute(
            "INSERT INTO todos (title, category, due_at) VALUES (?, ?, ?)",
            (title, category, due_at),
        )
        new_id = cursor.lastrowid
    return {"id": new_id, "title": title, "done": 0, "category": category, "due_at": due_at}


@app.patch("/api/todos/{todo_id}/category")
def set_todo_category(todo_id: int, update: TodoCategoryUpdate):
    category = update.category.strip()
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE todos SET category = ? WHERE id = ?", (category, todo_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 할 일을 찾을 수 없습니다.")
    return {"id": todo_id, "category": category}


@app.patch("/api/todos/{todo_id}/due_at")
def set_todo_due_at(todo_id: int, update: TodoDueAtUpdate):
    try:
        datetime.strptime(update.due_at, "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD HH:MM 이어야 합니다.")
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE todos SET due_at = ? WHERE id = ?", (update.due_at, todo_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 할 일을 찾을 수 없습니다.")
    return {"id": todo_id, "due_at": update.due_at}


@app.patch("/api/todos/{todo_id}/toggle")
def toggle_todo(todo_id: int):
    with get_connection() as conn:
        row = conn.execute("SELECT done FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="해당 할 일을 찾을 수 없습니다.")
        new_done = 0 if row["done"] else 1
        completed_at = (
            datetime.now().strftime("%Y-%m-%d %H:%M:%S") if new_done else None
        )
        conn.execute(
            "UPDATE todos SET done = ?, completed_at = ? WHERE id = ?",
            (new_done, completed_at, todo_id),
        )
    return {"id": todo_id, "done": new_done}


@app.patch("/api/todos/{todo_id}/done")
def set_todo_done(todo_id: int, update: TodoDoneUpdate):
    new_done = 1 if update.done else 0
    completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S") if new_done else None
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE todos SET done = ?, completed_at = ? WHERE id = ?",
            (new_done, completed_at, todo_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 할 일을 찾을 수 없습니다.")
    return {"id": todo_id, "done": new_done}


@app.delete("/api/todos/{todo_id}")
def delete_todo(todo_id: int):
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 할 일을 찾을 수 없습니다.")
    return {"id": todo_id}


@app.get("/api/recurring")
def list_recurring_rules():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM recurring_rules ORDER BY id DESC").fetchall()
    return [dict(row) for row in rows]


@app.post("/api/recurring")
def create_recurring_rule(rule: RecurringRuleCreate):
    title = rule.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title은 비어 있을 수 없습니다.")
    _validate_recurring_input(
        rule.freq, rule.interval, rule.start_date, rule.until_date, rule.exceptions
    )

    with get_connection() as conn:
        rule_id, inserted = _create_recurring_rule(
            conn,
            title,
            rule.category.strip(),
            rule.freq,
            rule.interval,
            rule.time_of_day,
            rule.start_date,
            rule.until_date,
            rule.exceptions,
        )

    return {"id": rule_id, "occurrences_created": inserted}


@app.delete("/api/recurring/{rule_id}")
def delete_recurring_rule(rule_id: int):
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM recurring_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="해당 반복 일정을 찾을 수 없습니다.")
        conn.execute(
            "DELETE FROM todos WHERE recurring_rule_id = ? AND done = 0 AND due_at >= ?",
            (rule_id, date.today().isoformat()),
        )
        conn.execute("DELETE FROM recurring_rules WHERE id = ?", (rule_id,))
    return {"id": rule_id}


@app.get("/api/calendar/suggestions")
def get_calendar_suggestions():
    try:
        events = calendar_sync.get_upcoming_events()
    except calendar_sync.CalendarNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"구글 캘린더 조회 실패: {exc}")

    with get_connection() as conn:
        linked = {
            row["google_event_id"]
            for row in conn.execute(
                "SELECT google_event_id FROM todos WHERE google_event_id IS NOT NULL"
            ).fetchall()
        }
        ignored = {
            row["event_id"]
            for row in conn.execute("SELECT event_id FROM ignored_calendar_events").fetchall()
        }

    return [e for e in events if e["event_id"] not in linked and e["event_id"] not in ignored]


@app.post("/api/calendar/suggestions/accept")
def accept_calendar_suggestion(suggestion: AcceptSuggestion):
    title = suggestion.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title은 비어 있을 수 없습니다.")
    with get_connection() as conn:
        category = suggestion.category.strip() or _guess_category(conn, title)
        cursor = conn.execute(
            "INSERT INTO todos (title, category, due_at, google_event_id) VALUES (?, ?, ?, ?)",
            (title, category, suggestion.due_at, suggestion.event_id),
        )
        new_id = cursor.lastrowid
    return {"id": new_id, "title": title, "done": 0, "category": category, "due_at": suggestion.due_at}


@app.post("/api/calendar/suggestions/{event_id}/ignore")
def ignore_calendar_suggestion(event_id: str):
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO ignored_calendar_events (event_id) VALUES (?)", (event_id,)
        )
    return {"event_id": event_id}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
