---
name: my-todo
description: Check, add, complete, or summarize todos in the user's local todo-app via its CLI (cli.py) instead of guessing or asking the user to open the browser.
---

# My Todo

이 스킬은 사용자의 로컬 Todo 앱(`C:\Users\user\Documents\todo-app`)을 CLI로 조작합니다.
"할일", "todo", "오늘 일정", "약 먹었는지" 등 이 앱과 관련된 요청이 오면 이 스킬을 사용하세요.

## 사전 조건

서버가 `http://127.0.0.1:8090`에서 떠 있어야 합니다. 확인:

```bash
curl -s http://127.0.0.1:8090/api/todos -o /dev/null -w "%{http_code}\n"
```

200이 아니면 사용자에게 `start.bat`(또는 `dev.bat`)을 실행해달라고 요청하세요 — 이 스킬이 대신 서버를 띄우지는 않습니다.

## 사용법

모든 명령은 이 형식입니다:

```bash
cd /c/Users/user/Documents/todo-app && venv/Scripts/python.exe cli.py <command>
```

| 명령 | 용도 |
|---|---|
| `task list [--date YYYY-MM-DD] [--category X] [--search Y]` | 목록 조회 |
| `task add --title "제목" [--date YYYY-MM-DD] [--time HH:MM] [--category X]` | 추가 |
| `task quick "자연어 문장"` | 자연어로 추가 |
| `task done <id>` | 완료 토글 |
| `task update <id> [--title X] [--date Y] [--time Z]` | 수정 |
| `task delete <id>` | 삭제 |
| `summary [--date YYYY-MM-DD]` | 하루 시간대별 요약 |
| `balance [--today] [--period day\|week\|month\|quarter\|half\|year]` | 카테고리별 완료 비중 |
| `categories` / `recurring` | 카테고리 / 반복 일정 목록 |

## 주의사항

- **한글이 포함된 값은 절대 커맨드라인에 직접 넣지 마세요** (`--title "필라테스"` 등). Git Bash가 UTF-8 인코딩을 깨뜨려 API가 400을 반환합니다. 값이 복잡하면 임시 파일에 써서 넘기거나, 짧은 한글 정도는 보통 괜찮지만 문제가 생기면 파일 경유 방식으로 바꾸세요.
- `task delete`, `task update`처럼 되돌리기 어려운 작업 전에는 무엇을 할지 먼저 사용자에게 확인하세요.
- `task list`/`summary` 결과에 테스트성 데이터를 추가했다면 확인 후 정리하세요 — `todo.db`는 실사용 데이터입니다.
- 더 자세한 배경은 `CLAUDE.md`를 참고하세요.
