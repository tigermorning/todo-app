import os
import sys
from datetime import datetime

import fire
import requests

API_BASE = os.environ.get("TODO_API_URL", "http://127.0.0.1:8000")


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


class TodoCLI:
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

    def add(self, title, due_at=None, category=""):
        """새 할 일을 추가합니다."""
        data = {"title": title, "category": category}
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

    def done(self, todo_id):
        """할 일을 완료 처리합니다 (토글)."""
        result = _api("PATCH", f"/api/todos/{todo_id}/toggle")
        status = "완료" if result["done"] else "취소"
        print(f"id={todo_id} {status}")

    def toggle(self, todo_id):
        """할 일 완료 상태를 토글합니다."""
        return self.done(todo_id)

    def update(self, todo_id, title=None, due_at=None):
        """할 일을 수정합니다."""
        data = {}
        if title:
            data["title"] = title
        if due_at is not None:
            data["due_at"] = due_at
        _api("PATCH", f"/api/todos/{todo_id}", json=data)
        print(f"id={todo_id} 수정됨")

    def delete(self, todo_id):
        """할 일을 삭제합니다."""
        _api("DELETE", f"/api/todos/{todo_id}")
        print(f"id={todo_id} 삭제됨")

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


def main():
    fire.Fire(TodoCLI, name="todo")


if __name__ == "__main__":
    main()
