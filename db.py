import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "todo.db"

GROUPS = [
    {"key": "health", "label": "건강", "color": "#4CAF50"},
    {"key": "selfdev", "label": "자기계발", "color": "#9C27B0"},
    {"key": "work", "label": "일", "color": "#F5A623"},
    {"key": "daily", "label": "일상관리", "color": "#607D8B"},
    {"key": "social", "label": "인간관계", "color": "#FF6B6B"},
    {"key": "rest", "label": "휴식", "color": "#00BCD4"},
    {"key": "finance", "label": "재정", "color": "#E91E63"},
    {"key": "etc", "label": "기타", "color": "#9E9E9E"},
]
GROUP_KEYS = {g["key"] for g in GROUPS}

DEFAULT_CATEGORIES = [
    ("건강", "health", None),
    ("자기계발", "selfdev", None),
    ("일", "work", None),
    ("일상관리", "daily", None),
    ("인간관계", "social", None),
    ("휴식", "rest", None),
    ("재정", "finance", None),
]
# 자식 카테고리 별도 추가
DEFAULT_SUBCATEGORIES = [
    ("운동", "건강", "health"),
    ("약물관리", "건강", "health"),
    ("식단", "건강", "health"),
    ("공부", "자기계발", "selfdev"),
    ("독서", "자기계발", "selfdev"),
    ("강의", "자기계발", "selfdev"),
    ("청소", "일상관리", "daily"),
    ("빨래", "일상관리", "daily"),
    ("장보기", "일상관리", "daily"),
    ("공과금", "일상관리", "daily"),
    ("행정업무", "일상관리", "daily"),
    ("데이트", "인간관계", "social"),
    ("약속", "인간관계", "social"),
    ("가족", "인간관계", "social"),
    ("취미", "휴식", "rest"),
    ("명상", "휴식", "rest"),
    ("산책", "휴식", "rest"),
    ("가계부", "재정", "finance"),
    ("예산", "재정", "finance"),
    ("투자", "재정", "finance"),
]


@contextmanager
def get_connection(retries=3, retry_delay=0.1):
    for attempt in range(retries):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=10)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()
            return
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e) and attempt < retries - 1:
                time.sleep(retry_delay)
                continue
            raise


def check_db_integrity():
    try:
        with get_connection() as conn:
            result = conn.execute("PRAGMA integrity_check").fetchone()
            return result[0] == "ok"
    except Exception:
        return False


def init_db():
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                category TEXT NOT NULL DEFAULT ''
            )
            """
        )
        existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(todos)")}
        if "category" not in existing_columns:
            conn.execute("ALTER TABLE todos ADD COLUMN category TEXT NOT NULL DEFAULT ''")
        if "due_at" not in existing_columns:
            conn.execute("ALTER TABLE todos ADD COLUMN due_at TEXT")
        if "recurring_rule_id" not in existing_columns:
            conn.execute("ALTER TABLE todos ADD COLUMN recurring_rule_id INTEGER")
        if "google_event_id" not in existing_columns:
            conn.execute("ALTER TABLE todos ADD COLUMN google_event_id TEXT")
        if "completed_at" not in existing_columns:
            conn.execute("ALTER TABLE todos ADD COLUMN completed_at TEXT")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                icon TEXT NOT NULL DEFAULT '🏷️',
                group_key TEXT NOT NULL DEFAULT 'etc',
                parent_id INTEGER
            )
            """
        )
        cat_columns = {row["name"] for row in conn.execute("PRAGMA table_info(categories)")}
        if "parent_id" not in cat_columns:
            conn.execute("ALTER TABLE categories ADD COLUMN parent_id INTEGER")

        def insert_cat(name, group_key, parent_name=None):
            parent_id = None
            if parent_name:
                parent_row = conn.execute(
                    "SELECT id FROM categories WHERE name = ?", (parent_name,)
                ).fetchone()
                if parent_row:
                    parent_id = parent_row["id"]
            conn.execute(
                "INSERT OR IGNORE INTO categories (name, icon, group_key, parent_id) VALUES (?, '', ?, ?)",
                (name, group_key, parent_id),
            )

        for name, gkey, _ in DEFAULT_CATEGORIES:
            insert_cat(name, gkey)
        for name, parent_name, gkey in DEFAULT_SUBCATEGORIES:
            insert_cat(name, gkey, parent_name)

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS recurring_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                freq TEXT NOT NULL DEFAULT 'WEEKLY',
                interval INTEGER NOT NULL DEFAULT 1,
                time_of_day TEXT,
                start_date TEXT NOT NULL,
                until_date TEXT,
                exceptions TEXT NOT NULL DEFAULT '[]',
                last_materialized_until TEXT,
                horizon_days INTEGER NOT NULL DEFAULT 60
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ignored_calendar_events (
                event_id TEXT PRIMARY KEY
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trackers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
            """
        )
        tracker_columns = {row["name"] for row in conn.execute("PRAGMA table_info(trackers)")}
        if "recurring_rule_id" not in tracker_columns:
            conn.execute("ALTER TABLE trackers ADD COLUMN recurring_rule_id INTEGER")
        if "weekly_target" not in tracker_columns:
            conn.execute("ALTER TABLE trackers ADD COLUMN weekly_target INTEGER")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tracker_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tracker_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                status TEXT NOT NULL,
                UNIQUE(tracker_id, date)
            )
            """
        )
