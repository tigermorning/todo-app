import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

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


def _normalize_event(event, calendar_id, calendar_name):
    start = event["start"].get("dateTime", event["start"].get("date"))
    if "T" in start:
        # "2026-07-25T13:00:00+09:00" -> "2026-07-25 13:00"
        due_at = start[:16].replace("T", " ")
    else:
        due_at = f"{start} 00:00"
    return {
        # 캘린더가 여러 개면 이벤트 ID가 서로 다른 캘린더에 속해도 문자열
        # 자체는 우연히 같을 수 있으니(이론상), calendar_id를 붙여 항상
        # 전역적으로 고유하게 만든다.
        "event_id": f"{calendar_id}:{event['id']}",
        "title": event.get("summary", "(제목 없음)"),
        "due_at": due_at,
        "calendar": calendar_name,
    }


def _list_visible_calendars(service):
    """구글 캘린더 화면에서 체크박스로 "보이게" 켜 둔 캘린더 목록을 가져온다
    (본인 기본 캘린더 + 다른 계정에서 공유/구독해 추가한 캘린더 포함).

    체크박스를 꺼 둔(선택 해제한) 캘린더는 제외한다 — "구글 캘린더에서 보이게
    해두면 앱에서도 보인다"는 기대에 맞추기 위함이다."""
    calendars = []
    page_token = None
    while True:
        result = service.calendarList().list(pageToken=page_token).execute()
        calendars.extend(result.get("items", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            break
    return [c for c in calendars if c.get("selected")]


def get_upcoming_events(days=None):
    creds = get_credentials()
    days = days or int(os.environ.get("CALENDAR_SUGGESTION_DAYS", 14))
    service = build("calendar", "v3", credentials=creds)

    now = datetime.now(timezone.utc)
    time_min = now.isoformat()
    time_max = (now + timedelta(days=days)).isoformat()

    calendars = _list_visible_calendars(service)
    events = []
    for calendar in calendars:
        calendar_id = calendar["id"]
        calendar_name = calendar.get("summaryOverride") or calendar.get("summary", calendar_id)
        try:
            result = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
        except HttpError:
            # 공유가 취소되었거나 일시적으로 접근이 막힌 캘린더 하나 때문에
            # 나머지 캘린더 조회까지 전부 실패하면 안 된다 — 그 캘린더만
            # 건너뛰고 계속 진행한다.
            continue
        events.extend(
            _normalize_event(e, calendar_id, calendar_name) for e in result.get("items", [])
        )
    events.sort(key=lambda e: e["due_at"])
    return events
