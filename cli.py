import os
import sys
from datetime import datetime

import fire
import requests

API_BASE = os.environ.get("TODO_API_URL", "http://127.0.0.1:8090")


def _api(method, path, **kwargs):
    url = f"{API_BASE}{path}"
    try:
        resp = requests.request(method, url, **kwargs)
        resp.raise_for_status()
    except requests.ConnectionError:
        print("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요 (start.bat).")
        sys.exit(1)
    except requests.HTTPError as e:
        detail = resp.json().get("detail", str(e))
        print(f"오류: {detail}")
        sys.exit(1)
    return resp.json()


def _format_due(due_at):
    if not due_at:
        return ""
    try:
        dt = datetime.strptime(due_at, "%Y-%m-%d %H:%M")
        now = datetime.now()
        if dt.date() == now.date():
            return f"오늘 {dt.strftime('%H:%M')}"
        return dt.strftime("%m/%d(%a) %H:%M")
    except ValueError:
        return due_at


def _format_done(done):
    return "[v]" if done else "[ ]"


def _combine_due_at(date=None, time=None):
    if not date:
        return None
    return f"{date} {time or '00:00'}"


class TaskCommands:
    def list(self, category=None, date=None, search=None):
        """할 일 목록을 조회합니다."""
        params = {}
        if category:
            params["category"] = category
        if date:
            params["date"] = date
        if search:
            params["q"] = search
        todos = _api("GET", "/api/todos", params=params)
        if not todos:
            print("할 일이 없습니다.")
            return
        print(f"{'ID':<4} {'상태':<5} {'제목':<40} {'마감':<20} {'카테고리':<10}")
        print("-" * 80)
        for t in todos:
            done = _format_done(t["done"])
            due = _format_due(t.get("due_at"))
            title = t["title"][:38]
            cat = t.get("category", "")[:8]
            print(f"{t['id']:<4} {done:<5} {title:<40} {due:<20} {cat:<10}")

    def add(self, title, date=None, time=None, category=""):
        """새 할 일을 추가합니다 (--date YYYY-MM-DD --time HH:MM)."""
        data = {"title": title, "category": category}
        due_at = _combine_due_at(date, time)
        if due_at:
            data["due_at"] = due_at
        result = _api("POST", "/api/todos", json=data)
        print(f"추가됨 (id={result['id']}): {result['title']}")

    def quick(self, text):
        """자연어로 할 일을 추가합니다 (예: '내일 3시 회의')."""
        result = _api("POST", "/api/todos/quick", json={"text": text})
        if "needs_until_date" in result:
            print("반복 일정입니다. until_date가 필요합니다:")
            print(f"  제목: {result['title']}")
            print(f"  주기: {result['freq']} (매 {result['interval']}회)")
            print(f"  시작: {result['start_date']}")
            return
        if result.get("recurring"):
            print(
                f"반복 일정 추가됨: {result['title']}"
                f" (생성된 할 일: {result.get('occurrences_created', '?')}개)"
            )
        else:
            print(f"추가됨 (id={result['id']}): {result['title']}")

    def done(self, task_id):
        """할 일을 완료 처리합니다 (토글)."""
        result = _api("PATCH", f"/api/todos/{task_id}/toggle")
        status = "완료" if result["done"] else "취소"
        print(f"id={task_id} {status}")

    def toggle(self, task_id):
        """할 일 완료 상태를 토글합니다."""
        return self.done(task_id)

    def update(self, task_id, title=None, date=None, time=None):
        """할 일을 수정합니다 (--date/--time으로 마감 변경)."""
        data = {}
        if title:
            data["title"] = title
        due_at = _combine_due_at(date, time)
        if due_at:
            data["due_at"] = due_at
        _api("PATCH", f"/api/todos/{task_id}", json=data)
        print(f"id={task_id} 수정됨")

    def delete(self, task_id):
        """할 일을 삭제합니다."""
        _api("DELETE", f"/api/todos/{task_id}")
        print(f"id={task_id} 삭제됨")


class TodoCLI:
    def __init__(self):
        self.task = TaskCommands()

    def categories(self):
        """카테고리 목록을 조회합니다."""
        cats = _api("GET", "/api/categories")
        for c in cats:
            parent = f" > {c['parent_name']}" if c.get("parent_name") else ""
            print(f"{c['name']}{parent}  ({c['group_label']})")

    def recurring(self):
        """반복 일정 목록을 조회합니다."""
        rules = _api("GET", "/api/recurring")
        if not rules:
            print("반복 일정이 없습니다.")
            return
        for r in rules:
            print(f"#{r['id']} {r['title']}  ({r['freq']} / {r.get('category', '')})")

    def balance(self, period="week", today=False, date=None):
        """완료한 할 일을 카테고리 그룹별 비중으로 보여줍니다.

        --today는 period=day의 단축 표현입니다. period는 day/week/month/quarter/half/year.
        """
        if today:
            period = "day"
        params = {"period": period}
        if date:
            params["date"] = date
        result = _api("GET", "/api/categories/breakdown", params=params)

        r = result["range"]
        print(f"[{result['period']}] {r['start']} ~ {r['end']}  (총 {result['total']}건)")
        if result["total"] == 0:
            print("완료한 할 일이 아직 없어요.")
            return
        print("-" * 40)
        for g in result["groups"]:
            if g["count"] == 0:
                continue
            print(f"{g['icon']} {g['label']:<10} {g['count']:>3}건  ({g['percentage']:>5.1f}%)")


def main():
    fire.Fire(TodoCLI, name="todo")


if __name__ == "__main__":
    main()
