import re
from datetime import date, datetime, timedelta

WEEKDAY_MAP = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}

_TRAILING_PARTICLES = re.compile(r"^\s*(에는|에도|부터|까지|로|에)\s*")


def _consume_trailing_particle(text, end):
    match = _TRAILING_PARTICLES.match(text[end:])
    if match:
        return end + match.end()
    return end


def _find_date(text, now):
    patterns = [
        (re.compile(r"(다음|담)\s*주\s*([월화수목금토일])\s*요일"), "next_week_weekday"),
        (re.compile(r"이번\s*주\s*([월화수목금토일])\s*요일"), "this_week_weekday"),
        (re.compile(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일"), "month_day"),
        (re.compile(r"(\d{1,2})\s*일\s*(후|뒤)"), "days_after"),
        (re.compile(r"모레|내일모레"), "plus2"),
        (re.compile(r"글피"), "plus3"),
        (re.compile(r"내일"), "plus1"),
        (re.compile(r"오늘"), "plus0"),
        (re.compile(r"([월화수목금토일])\s*요일"), "bare_weekday"),
    ]
    today = now.date()
    for pattern, kind in patterns:
        m = pattern.search(text)
        if not m:
            continue
        if kind == "next_week_weekday":
            target = WEEKDAY_MAP[m.group(2)]
            monday_next_week = today - timedelta(days=today.weekday()) + timedelta(days=7)
            return monday_next_week + timedelta(days=target), m.span()
        if kind == "this_week_weekday":
            target = WEEKDAY_MAP[m.group(1)]
            monday_this_week = today - timedelta(days=today.weekday())
            return monday_this_week + timedelta(days=target), m.span()
        if kind == "month_day":
            month, day = int(m.group(1)), int(m.group(2))
            year = today.year
            try:
                candidate = today.replace(year=year, month=month, day=day)
            except ValueError:
                continue
            if candidate < today:
                candidate = candidate.replace(year=year + 1)
            return candidate, m.span()
        if kind == "days_after":
            return today + timedelta(days=int(m.group(1))), m.span()
        if kind == "plus2":
            return today + timedelta(days=2), m.span()
        if kind == "plus3":
            return today + timedelta(days=3), m.span()
        if kind == "plus1":
            return today + timedelta(days=1), m.span()
        if kind == "plus0":
            return today, m.span()
        if kind == "bare_weekday":
            target = WEEKDAY_MAP[m.group(1)]
            delta = (target - today.weekday()) % 7
            return today + timedelta(days=delta), m.span()
    return None, None


def _find_time(text):
    patterns = [
        (re.compile(r"정오"), "noon"),
        (re.compile(r"자정"), "midnight"),
        (re.compile(r"(오전|오후)\s*(\d{1,2})\s*시(?!간)\s*반"), "ampm_half"),
        (re.compile(r"(오전|오후)\s*(\d{1,2})\s*시(?!간)\s*(\d{1,2})\s*분"), "ampm_hm"),
        (re.compile(r"(오전|오후)\s*(\d{1,2})\s*시(?!간)"), "ampm_h"),
        (re.compile(r"(오전|오후)\s*(\d{1,2}):(\d{2})"), "ampm_colon"),
        (re.compile(r"(\d{1,2})\s*시(?!간)\s*반"), "h_half"),
        (re.compile(r"(\d{1,2})\s*시(?!간)\s*(\d{1,2})\s*분"), "h_m"),
        (re.compile(r"(\d{1,2}):(\d{2})"), "colon"),
        (re.compile(r"(\d{1,2})\s*시(?!간)"), "h"),
    ]

    def _to_24h(hour, ampm=None):
        if ampm == "오후":
            return (hour % 12) + 12
        if ampm == "오전":
            return hour % 12
        # No AM/PM marker.
        if hour >= 13:
            return hour  # already unambiguous 24-hour notation (e.g. "20:30")
        if 1 <= hour <= 6:
            return hour + 12  # casual heuristic: early-clock hours default to PM
        return hour

    for pattern, kind in patterns:
        m = pattern.search(text)
        if not m:
            continue
        if kind == "noon":
            return (12, 0), m.span()
        if kind == "midnight":
            return (0, 0), m.span()
        if kind == "ampm_half":
            return (_to_24h(int(m.group(2)), m.group(1)), 30), m.span()
        if kind == "ampm_hm":
            return (_to_24h(int(m.group(2)), m.group(1)), int(m.group(3))), m.span()
        if kind == "ampm_h":
            return (_to_24h(int(m.group(2)), m.group(1)), 0), m.span()
        if kind == "ampm_colon":
            return (_to_24h(int(m.group(2)), m.group(1)), int(m.group(3))), m.span()
        if kind == "h_half":
            return (_to_24h(int(m.group(1))), 30), m.span()
        if kind == "h_m":
            return (_to_24h(int(m.group(1))), int(m.group(2))), m.span()
        if kind == "colon":
            return (_to_24h(int(m.group(1))), int(m.group(2))), m.span()
        if kind == "h":
            return (_to_24h(int(m.group(1))), 0), m.span()
    return None, None


def parse_quick_entry(text, now=None):
    """Parse a Korean free-text quick-entry string into (title, due_at).

    due_at is a "YYYY-MM-DD HH:MM" string, or None if no date/time was found.
    """
    now = now or datetime.now()
    text = text.strip()

    date_value, date_span = _find_date(text, now)
    time_value, time_span = _find_time(text)

    spans = []
    if date_span:
        spans.append((date_span[0], _consume_trailing_particle(text, date_span[1])))
    if time_span:
        spans.append((time_span[0], _consume_trailing_particle(text, time_span[1])))

    title = text
    for start, end in sorted(spans, key=lambda s: s[0], reverse=True):
        title = title[:start] + " " + title[end:]
    title = re.sub(r"\s+", " ", title).strip()
    if not title:
        title = text.strip()

    due_at = None
    if date_value:
        hour, minute = time_value if time_value else (0, 0)
        due_at = datetime(date_value.year, date_value.month, date_value.day, hour, minute)
        due_at = due_at.strftime("%Y-%m-%d %H:%M")
    elif time_value:
        hour, minute = time_value
        candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate < now:
            candidate += timedelta(days=1)
        due_at = candidate.strftime("%Y-%m-%d %H:%M")

    return title, due_at


_FREQUENCY_WORDS = [("격주", "WEEKLY", 2), ("매주", "WEEKLY", 1), ("매일", "DAILY", 1)]


def _find_recurring_frequency(text):
    for word, freq, interval in _FREQUENCY_WORDS:
        m = re.search(word, text)
        if m:
            return freq, interval, m.span()
    return None, None, None


def _resolve_date_range(month1, day1, month2, day2, today):
    year = today.year
    start = date(year, month1, day1)
    if start < today:
        year += 1
        start = date(year, month1, day1)
    until = date(year, month2, day2)
    if until < start:
        until = date(year + 1, month2, day2)
    return start, until


def _find_date_range(text, now):
    today = now.date()
    patterns = [
        re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*[-~]\s*(\d{1,2})\s*/\s*(\d{1,2})"),
        re.compile(
            r"(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*부터\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*까지"
        ),
    ]
    for pattern in patterns:
        m = pattern.search(text)
        if not m:
            continue
        month1, day1, month2, day2 = (int(g) for g in m.groups())
        try:
            start, until = _resolve_date_range(month1, day1, month2, day2, today)
        except ValueError:
            continue
        return start, until, m.span()
    return None, None, None


def parse_recurring_quick_entry(text, now=None):
    """Detect a compact recurring expression like "8/3-11/5 격주 공원 산책".

    Returns None if no recurring-frequency keyword (매일/매주/격주) is found — the
    caller should fall back to parse_quick_entry() for a normal single todo.
    Otherwise returns a dict: title, freq, interval, start_date, until_date, time_of_day.
    """
    now = now or datetime.now()
    text = text.strip()

    freq, interval, freq_span = _find_recurring_frequency(text)
    if freq is None:
        return None

    start_date, until_date, range_span = _find_date_range(text, now)

    spans = [freq_span]
    if range_span:
        spans.append(range_span)
    else:
        single_date, single_span = _find_date(text, now)
        if single_date:
            start_date = single_date
            spans.append(single_span)

    time_value, time_span = _find_time(text)
    if time_span:
        spans.append(time_span)

    if start_date is None:
        start_date = now.date()

    title = text
    for start, end in sorted(
        ((s, _consume_trailing_particle(text, e)) for s, e in spans),
        key=lambda s: s[0],
        reverse=True,
    ):
        title = title[:start] + " " + title[end:]
    title = re.sub(r"\s+", " ", title).strip()
    if not title:
        title = "반복 일정"

    return {
        "title": title,
        "freq": freq,
        "interval": interval,
        "start_date": start_date.isoformat(),
        "until_date": until_date.isoformat() if until_date else None,
        "time_of_day": f"{time_value[0]:02d}:{time_value[1]:02d}" if time_value else None,
    }
