# CLAUDE.md

이 저장소는 로컬 Todo 앱(FastAPI + SQLite)입니다. 사용자의 실제 할 일 데이터가 `todo.db`에 들어있습니다.

## 서버

- 실행: `start.bat` 더블클릭 (Windows) — `http://127.0.0.1:8090`
- 개발 모드(파일 변경 시 자동 재시작): `dev.bat`
- 서버가 이미 떠 있어야 아래 CLI/API가 동작합니다.

## CLI로 할 일 다루기

`cli.py`가 이 앱의 커맨드라인 인터페이스입니다. 사용자를 대신해 할 일을 확인하거나 조작할 때는
브라우저 UI를 직접 조작하는 대신 이 CLI를 실행하세요.

```bash
venv/Scripts/python.exe cli.py <command> [옵션]
```

### 할 일 (task)

| 명령 | 설명 |
|---|---|
| `task list [--category X] [--date YYYY-MM-DD] [--search 검색어]` | 목록 조회 |
| `task add --title "제목" [--date YYYY-MM-DD] [--time HH:MM] [--category X]` | 새 할 일 추가 |
| `task quick "자연어 문장"` | 자연어로 추가 (예: "내일 3시 회의") |
| `task done <id>` / `task toggle <id>` | 완료 상태 토글 |
| `task update <id> [--title X] [--date Y] [--time Z]` | 수정 |
| `task delete <id>` | 삭제 |

### 요약 / 통계

| 명령 | 설명 |
|---|---|
| `summary [--date YYYY-MM-DD]` | 특정 날짜(기본 오늘) 할 일을 시간대별로 요약 |
| `balance [--period day\|week\|month\|quarter\|half\|year] [--today]` | 완료한 할 일의 카테고리 그룹별 비중 |
| `categories` | 카테고리(상위/하위) 목록 |
| `recurring` | 반복 일정 목록 |

### 예시

```bash
venv/Scripts/python.exe cli.py task list --date 2026-07-23
venv/Scripts/python.exe cli.py task add --title "필라테스" --date 2026-07-23 --time 09:00 --category 운동
venv/Scripts/python.exe cli.py summary
venv/Scripts/python.exe cli.py balance --today
```

## 다른 인터페이스

이 CLI 외에도 `todo-mcp-server/`에 동일 기능을 제공하는 MCP 서버가 있습니다(`mcp__todo__*` 도구).
CLI는 사람이 터미널에서 직접 실행하기 쉽고, MCP는 에이전트가 구조화된 스키마로 호출하기 쉽습니다 — 용도에 맞게 고르면 됩니다.

## 안전 규칙

- **되돌리기 어려운 코드 변경**(스키마 변경, 대량 삭제/수정 로직, 기존 API 시그니처 변경 등) 전에는
  먼저 `git status`로 현재 상태를 확인하고, 커밋되지 않은 변경이 있다면 커밋하거나 사용자에게 확인한 뒤 진행하세요.
- `todo.db`는 git 추적 대상이 아닙니다(`.gitignore`) — 실제 사용자 데이터이므로 테스트 데이터를 넣었다면
  작업 후 반드시 정리하세요.
- 포트는 **8090**을 사용합니다(과거 8000번에서 옮겨짐 — 다른 프로세스와 충돌 이력이 있었습니다).
