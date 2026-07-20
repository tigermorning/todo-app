import json
from datetime import date, datetime, timedelta

from dateutil.rrule import DAILY, WEEKLY, rrule

FREQ_MAP = {"DAILY": DAILY, "WEEKLY": WEEKLY}


def _parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def _in_exceptions(day, exceptions):
    for start, end in exceptions:
        if _parse_date(start) <= day <= _parse_date(end):
            return True
    return False


def materialize_occurrences(conn, rule_row, today=None):
    """Generate and insert todo rows for a recurring rule up to its horizon.

    Returns the number of todo rows inserted.
    """
    today = today or date.today()
    start_date = _parse_date(rule_row["start_date"])
    until_date = _parse_date(rule_row["until_date"]) if rule_row["until_date"] else None
    if until_date:
        # An explicit end date is the real bound — materialize the whole
        # range up front rather than trickling it out over the horizon.
        effective_until = until_date
    else:
        effective_until = today + timedelta(days=rule_row["horizon_days"])

    if rule_row["last_materialized_until"]:
        generate_from = _parse_date(rule_row["last_materialized_until"]) + timedelta(days=1)
    else:
        generate_from = start_date

    if generate_from > effective_until:
        return 0

    exceptions = [tuple(pair) for pair in json.loads(rule_row["exceptions"])]

    dtstart = datetime.combine(start_date, datetime.min.time())
    range_start = datetime.combine(max(start_date, generate_from), datetime.min.time())
    range_end = datetime.combine(effective_until, datetime.min.time())

    occurrences = rrule(
        FREQ_MAP[rule_row["freq"]], interval=rule_row["interval"], dtstart=dtstart
    ).between(range_start, range_end, inc=True)

    time_of_day = rule_row["time_of_day"] or "00:00"
    inserted = 0
    for occ in occurrences:
        day = occ.date()
        if _in_exceptions(day, exceptions):
            continue
        due_at = f"{day.isoformat()} {time_of_day}"
        conn.execute(
            "INSERT INTO todos (title, category, due_at, recurring_rule_id) VALUES (?, ?, ?, ?)",
            (rule_row["title"], rule_row["category"], due_at, rule_row["id"]),
        )
        inserted += 1

    conn.execute(
        "UPDATE recurring_rules SET last_materialized_until = ? WHERE id = ?",
        (effective_until.isoformat(), rule_row["id"]),
    )
    return inserted


def extend_all_rules(conn, today=None):
    rules = conn.execute("SELECT * FROM recurring_rules").fetchall()
    for rule_row in rules:
        materialize_occurrences(conn, rule_row, today)
