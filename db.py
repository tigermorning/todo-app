import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "todo.db"

GROUPS = [
    {"key": "exercise", "label": "운동", "color": "#4F86F7"},
    {"key": "work", "label": "업무", "color": "#F5A623"},
    {"key": "study", "label": "공부", "color": "#9B59B6"},
    {"key": "chore", "label": "집안일", "color": "#2ECC71"},
    {"key": "social", "label": "약속", "color": "#FF6B6B"},
    {"key": "etc", "label": "기타", "color": "#95A5A6"},
]
GROUP_KEYS = {g["key"] for g in GROUPS}

DEFAULT_CATEGORIES = [
    ("운동", "🏃", "exercise"),
    ("업무", "💼", "work"),
    ("공부", "📚", "study"),
    ("집안일", "🧹", "chore"),
    ("약속", "👥", "social"),
    ("기타", "📌", "etc"),
]


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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
                group_key TEXT NOT NULL DEFAULT 'etc'
            )
            """
        )
        conn.executemany(
            "INSERT OR IGNORE INTO categories (name, icon, group_key) VALUES (?, ?, ?)",
            DEFAULT_CATEGORIES,
        )

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
