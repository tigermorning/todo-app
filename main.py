import json
import signal
import sys
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

import calendar_sync
from db import GROUPS, GROUP_KEYS, get_connection, init_db, check_db_integrity
from nlp import parse_quick_entry, parse_recurring_quick_entry
from recurring import extend_all_rules, materialize_occurrences


def shutdown_handler(signum, frame):
    print("\n서버를 안전하게 종료합니다...")
    sys.exit(0)


if sys.platform != "win32":
    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
        with get_connection() as conn:
            extend_all_rules(conn)
        print("=" * 50)
        print("  서버가 성공적으로 시작되었습니다.")
        print("  (실제 접속 주소는 아래 Uvicorn 로그의 URL을 확인하세요)")
        print("  종료하려면 Ctrl+C를 누르세요")
        print("=" * 50)
    except Exception as e:
        print(f"서버 시작 중 오류 발생: {e}")
        raise
    yield
    print("서버를 안전하게 종료합니다.")


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
    parent_name: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: str
    icon: str = ""
    group_key: str
    parent_name: Optional[str] = None


class QuickEntryCreate(BaseModel):
    text: str


class TodoCategoryUpdate(BaseModel):
    category: str


class TodoDueAtUpdate(BaseModel):
    due_at: str


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    due_at: Optional[str] = None


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


class TrackerCreate(BaseModel):
    name: str
    recurring_rule_id: Optional[int] = None
    weekly_target: Optional[int] = None


class TrackerDuplicate(BaseModel):
    name: str
    copy_data: bool = False


class TrackerEntryUpdate(BaseModel):
    status: Optional[str] = None


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health_check():
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
        db_ok = check_db_integrity()
        return {
            "status": "ok" if db_ok else "degraded",
            "db_integrity": db_ok,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB 연결 실패: {str(e)}")


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


@app.get("/api/trackers")
def list_trackers():
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT t.id, t.name, t.created_at, t.recurring_rule_id, t.weekly_target, r.title AS recurring_title
            FROM trackers t
            LEFT JOIN recurring_rules r ON r.id = t.recurring_rule_id
            ORDER BY t.id
            """
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/trackers")
def create_tracker(tracker: TrackerCreate):
    name = tracker.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="이름은 비어 있을 수 없습니다.")
    if tracker.recurring_rule_id is not None and tracker.weekly_target is not None:
        raise HTTPException(
            status_code=400, detail="반복 일정 연동과 주간 목표는 동시에 설정할 수 없습니다."
        )
    if tracker.weekly_target is not None and not (1 <= tracker.weekly_target <= 7):
        raise HTTPException(status_code=400, detail="주간 목표는 1~7 사이여야 합니다.")
    with get_connection() as conn:
        if tracker.recurring_rule_id is not None:
            rule = conn.execute(
                "SELECT id FROM recurring_rules WHERE id = ?", (tracker.recurring_rule_id,)
            ).fetchone()
            if rule is None:
                raise HTTPException(status_code=404, detail="해당 반복 일정을 찾을 수 없습니다.")
        cursor = conn.execute(
            "INSERT INTO trackers (name, recurring_rule_id, weekly_target) VALUES (?, ?, ?)",
            (name, tracker.recurring_rule_id, tracker.weekly_target),
        )
        new_id = cursor.lastrowid
    return {
        "id": new_id,
        "name": name,
        "recurring_rule_id": tracker.recurring_rule_id,
        "weekly_target": tracker.weekly_target,
    }


@app.post("/api/trackers/{tracker_id}/duplicate")
def duplicate_tracker(tracker_id: int, dup: TrackerDuplicate):
    name = dup.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="이름은 비어 있을 수 없습니다.")
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id, recurring_rule_id, weekly_target FROM trackers WHERE id = ?", (tracker_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="해당 Tracker를 찾을 수 없습니다.")
        if existing["recurring_rule_id"] is not None:
            raise HTTPException(
                status_code=400,
                detail="반복 일정과 연동된 Tracker는 복제할 수 없습니다. 다른 일정을 연결한 새 Tracker를 만들어 주세요.",
            )
        cursor = conn.execute(
            "INSERT INTO trackers (name, weekly_target) VALUES (?, ?)",
            (name, existing["weekly_target"]),
        )
        new_id = cursor.lastrowid
        if dup.copy_data:
            conn.execute(
                """
                INSERT INTO tracker_entries (tracker_id, date, status)
                SELECT ?, date, status FROM tracker_entries WHERE tracker_id = ?
                """,
                (new_id, tracker_id),
            )
    return {"id": new_id, "name": name, "weekly_target": existing["weekly_target"]}


@app.get("/api/trackers/{tracker_id}/entries")
def get_tracker_entries(tracker_id: int, year: Optional[int] = None, month: Optional[int] = None):
    today = date.today()
    year = year or today.year
    month = month or today.month
    start = date(year, month, 1)
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    end = next_month - timedelta(days=1)

    with get_connection() as conn:
        tracker = conn.execute(
            "SELECT id, recurring_rule_id FROM trackers WHERE id = ?", (tracker_id,)
        ).fetchone()
        if tracker is None:
            raise HTTPException(status_code=404, detail="해당 Tracker를 찾을 수 없습니다.")

        if tracker["recurring_rule_id"] is not None:
            rows = conn.execute(
                """
                SELECT substr(due_at, 1, 10) AS day, MAX(done) AS done
                FROM todos
                WHERE recurring_rule_id = ?
                  AND due_at IS NOT NULL
                  AND substr(due_at, 1, 10) >= ? AND substr(due_at, 1, 10) <= ?
                GROUP BY day
                """,
                (tracker["recurring_rule_id"], start.isoformat(), end.isoformat()),
            ).fetchall()
            todo_by_day = {row["day"]: row["done"] for row in rows}
            today_iso = today.isoformat()
            days = []
            cursor_day = start
            while cursor_day <= end:
                iso = cursor_day.isoformat()
                if iso not in todo_by_day:
                    status = None
                elif todo_by_day[iso]:
                    status = "done"
                elif iso < today_iso:
                    status = "failed"
                else:
                    status = None
                days.append({"date": iso, "day": cursor_day.day, "status": status})
                cursor_day += timedelta(days=1)
            return {"year": year, "month": month, "days": days, "linked": True}

        rows = conn.execute(
            "SELECT date, status FROM tracker_entries WHERE tracker_id = ? AND date >= ? AND date <= ?",
            (tracker_id, start.isoformat(), end.isoformat()),
        ).fetchall()

    statuses = {row["date"]: row["status"] for row in rows}
    days = []
    cursor_day = start
    while cursor_day <= end:
        iso = cursor_day.isoformat()
        days.append({"date": iso, "day": cursor_day.day, "status": statuses.get(iso)})
        cursor_day += timedelta(days=1)
    return {"year": year, "month": month, "days": days, "linked": False}


@app.put("/api/trackers/{tracker_id}/entries/{entry_date}")
def set_tracker_entry(tracker_id: int, entry_date: str, update: TrackerEntryUpdate):
    try:
        datetime.strptime(entry_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD 이어야 합니다.")
    if update.status is not None and update.status not in ("done", "failed"):
        raise HTTPException(status_code=400, detail="status는 done, failed 중 하나이거나 비어 있어야 합니다.")

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id, recurring_rule_id FROM trackers WHERE id = ?", (tracker_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="해당 Tracker를 찾을 수 없습니다.")
        if existing["recurring_rule_id"] is not None:
            raise HTTPException(
                status_code=400, detail="반복 일정과 연동된 Tracker는 직접 기록할 수 없습니다."
            )
        if update.status is None:
            conn.execute(
                "DELETE FROM tracker_entries WHERE tracker_id = ? AND date = ?",
                (tracker_id, entry_date),
            )
        else:
            conn.execute(
                """
                INSERT INTO tracker_entries (tracker_id, date, status) VALUES (?, ?, ?)
                ON CONFLICT(tracker_id, date) DO UPDATE SET status = excluded.status
                """,
                (tracker_id, entry_date, update.status),
            )
    return {"tracker_id": tracker_id, "date": entry_date, "status": update.status}


@app.get("/api/groups")
def list_groups():
    return GROUPS


VALID_BALANCE_PERIODS = {"day", "week", "month", "quarter", "half", "year"}


def _add_months(d: date, months: int) -> date:
    total = (d.month - 1) + months
    year = d.year + total // 12
    month = total % 12 + 1
    return date(year, month, 1)


def _period_range(period: str, ref: date) -> tuple[date, date]:
    if period == "day":
        start = ref
        return start, start + timedelta(days=1)
    if period == "week":
        start = ref - timedelta(days=ref.weekday())
        return start, start + timedelta(days=7)
    if period == "month":
        start = ref.replace(day=1)
        return start, _add_months(start, 1)
    if period == "quarter":
        quarter_start_month = (ref.month - 1) // 3 * 3 + 1
        start = ref.replace(month=quarter_start_month, day=1)
        return start, _add_months(start, 3)
    if period == "half":
        half_start_month = 1 if ref.month <= 6 else 7
        start = ref.replace(month=half_start_month, day=1)
        return start, _add_months(start, 6)
    if period == "year":
        start = ref.replace(month=1, day=1)
        return start, start.replace(year=start.year + 1)
    raise HTTPException(status_code=400, detail="period은 day/week/month/quarter/half/year 중 하나여야 합니다.")


@app.get("/api/categories/breakdown")
def category_breakdown(period: str = Query("week"), date_str: Optional[str] = Query(None, alias="date")):
    if period not in VALID_BALANCE_PERIODS:
        raise HTTPException(status_code=400, detail="period은 day/week/month/quarter/half/year 중 하나여야 합니다.")

    ref = date.fromisoformat(date_str) if date_str else date.today()
    start, end = _period_range(period, ref)

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT category, COUNT(*) AS cnt
            FROM todos
            WHERE done = 1
              AND completed_at IS NOT NULL
              AND date(completed_at) >= date(?)
              AND date(completed_at) < date(?)
            GROUP BY category
            """,
            (start.isoformat(), end.isoformat()),
        ).fetchall()
        cat_rows = conn.execute("SELECT name, group_key FROM categories").fetchall()

    category_to_group = {row["name"]: row["group_key"] for row in cat_rows}

    totals = {g["key"]: 0 for g in GROUPS}
    total = 0
    for row in rows:
        group_key = category_to_group.get(row["category"], "etc")
        if group_key not in totals:
            group_key = "etc"
        totals[group_key] += row["cnt"]
        total += row["cnt"]

    groups_result = []
    for g in GROUPS:
        count = totals[g["key"]]
        percentage = round(count / total * 100, 1) if total else 0.0
        groups_result.append(
            {
                "key": g["key"],
                "label": g["label"],
                "color": g["color"],
                "icon": g["icon"],
                "count": count,
                "percentage": percentage,
            }
        )

    return {
        "period": period,
        "range": {"start": start.isoformat(), "end": (end - timedelta(days=1)).isoformat()},
        "total": total,
        "groups": groups_result,
    }


@app.get("/api/categories")
def list_categories():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT name, icon, group_key, parent_id FROM categories ORDER BY id"
        ).fetchall()
    result = []
    for row in rows:
        group = GROUP_LOOKUP.get(row["group_key"], GROUP_LOOKUP["etc"])
        parent_name = None
        if row["parent_id"]:
            with get_connection() as conn:
                parent = conn.execute(
                    "SELECT name FROM categories WHERE id = ?", (row["parent_id"],)
                ).fetchone()
                if parent:
                    parent_name = parent["name"]
        result.append(
            {
                "name": row["name"],
                "icon": row["icon"],
                "group_key": row["group_key"],
                "group_label": group["label"],
                "color": group["color"],
                "parent_id": row["parent_id"],
                "parent_name": parent_name,
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
    parent_id = None
    if category.parent_name:
        parent_name = category.parent_name.strip()
        with get_connection() as conn:
            parent = conn.execute(
                "SELECT id FROM categories WHERE name = ?", (parent_name,)
            ).fetchone()
            if parent is None:
                raise HTTPException(status_code=404, detail="부모 카테고리를 찾을 수 없습니다.")
            parent_id = parent["id"]
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM categories WHERE name = ?", (name,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="이미 존재하는 카테고리입니다.")
        conn.execute(
            "INSERT INTO categories (name, icon, group_key, parent_id) VALUES (?, ?, ?, ?)",
            (name, icon, category.group_key, parent_id),
        )
    group = GROUP_LOOKUP[category.group_key]
    return {
        "name": name,
        "icon": icon,
        "group_key": category.group_key,
        "group_label": group["label"],
        "color": group["color"],
        "parent_id": parent_id,
        "parent_name": category.parent_name,
    }


@app.patch("/api/categories/{name}")
def update_category(name: str, update: CategoryUpdate):
    new_name = update.name.strip()
    icon = update.icon.strip() or "🏷️"
    if not new_name:
        raise HTTPException(status_code=400, detail="카테고리 이름은 비어 있을 수 없습니다.")
    if update.group_key not in GROUP_KEYS:
        raise HTTPException(status_code=400, detail="올바르지 않은 그룹입니다.")

    parent_id = None
    if update.parent_name:
        parent_name = update.parent_name.strip()
        with get_connection() as conn:
            parent = conn.execute(
                "SELECT id FROM categories WHERE name = ?", (parent_name,)
            ).fetchone()
            if parent is None:
                raise HTTPException(status_code=404, detail="부모 카테고리를 찾을 수 없습니다.")
            parent_id = parent["id"]

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
            "UPDATE categories SET name = ?, icon = ?, group_key = ?, parent_id = ? WHERE name = ?",
            (new_name, icon, update.group_key, parent_id, name),
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
        "parent_id": parent_id,
        "parent_name": update.parent_name,
    }


@app.delete("/api/categories/{name}")
def delete_category(name: str, cascade: bool = Query(False)):
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="해당 카테고리를 찾을 수 없습니다.")
        children = conn.execute(
            "SELECT name FROM categories WHERE parent_id = ?", (existing["id"],)
        ).fetchall()
        if children and not cascade:
            names = ", ".join(c["name"] for c in children)
            raise HTTPException(
                status_code=409,
                detail=f"하위 카테고리({names})가 있습니다. 함께 삭제하려면 cascade=true로 요청하세요.",
            )
        names_to_delete = [name] + [c["name"] for c in children]
        for n in names_to_delete:
            conn.execute("DELETE FROM categories WHERE name = ?", (n,))
            conn.execute("UPDATE todos SET category = '' WHERE category = ?", (n,))
            conn.execute("UPDATE recurring_rules SET category = '' WHERE category = ?", (n,))
    return {"name": name, "deleted": names_to_delete}


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


@app.patch("/api/todos/{todo_id}")
def update_todo(todo_id: int, update: TodoUpdate):
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="해당 할 일을 찾을 수 없습니다.")

        updates = []
        params = []
        if update.title is not None:
            title = update.title.strip()
            if not title:
                raise HTTPException(status_code=400, detail="title은 비어 있을 수 없습니다.")
            updates.append("title = ?")
            params.append(title)
        if update.due_at is not None:
            if update.due_at:
                try:
                    datetime.strptime(update.due_at, "%Y-%m-%d %H:%M")
                except ValueError:
                    raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD HH:MM 이어야 합니다.")
            updates.append("due_at = ?")
            params.append(update.due_at or None)

        if not updates:
            raise HTTPException(status_code=400, detail="수정할 항목이 없습니다.")

        params.append(todo_id)
        conn.execute(f"UPDATE todos SET {', '.join(updates)} WHERE id = ?", params)

    return {"id": todo_id, "title": update.title, "due_at": update.due_at}


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
