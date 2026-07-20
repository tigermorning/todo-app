import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


class CalendarNotConfigured(Exception):
    pass


def _token_path():
    return os.environ.get("GOOGLE_TOKEN_FILE", "token.json")


def get_credentials():
    token_path = _token_path()
    if not os.path.exists(token_path):
        raise CalendarNotConfigured(
            "구글 캘린더가 아직 연결되지 않았습니다. setup_google_calendar.py를 먼저 실행하세요."
        )
    creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return creds


def _normalize_event(event):
    start = event["start"].get("dateTime", event["start"].get("date"))
    if "T" in start:
        # "2026-07-25T13:00:00+09:00" -> "2026-07-25 13:00"
        due_at = start[:16].replace("T", " ")
    else:
        due_at = f"{start} 00:00"
    return {
        "event_id": event["id"],
        "title": event.get("summary", "(제목 없음)"),
        "due_at": due_at,
    }


def get_upcoming_events(days=None):
    creds = get_credentials()
    days = days or int(os.environ.get("CALENDAR_SUGGESTION_DAYS", 14))
    service = build("calendar", "v3", credentials=creds)

    now = datetime.now(timezone.utc)
    time_min = now.isoformat()
    time_max = (now + timedelta(days=days)).isoformat()

    result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    return [_normalize_event(e) for e in result.get("items", [])]
