#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fetch = require("node-fetch");

const API_BASE = process.env.TODO_API_URL || "http://127.0.0.1:8090";

const server = new Server(
  { name: "todo-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

async function api(method, path, body, params) {
  let url = `${API_BASE}${path}`;
  if (method === "GET" && params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, v);
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail || res.statusText).catch(() => res.statusText);
    throw new Error(detail);
  }
  return res.json();
}

function parseDueAt(dueAt) {
  if (!dueAt) return null;
  const s = dueAt.includes(" ") ? dueAt : dueAt + " 00:00";
  return new Date(s.replace(" ", "T"));
}

function fmtDate(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function fmtDateTime(d) {
  return fmtDate(d) + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

function getWeekRange(now) {
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function dayLabel(d) {
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
}

function hourBucket(d) {
  const h = d.getHours();
  if (h < 6) return "새벽(0~5시)";
  if (h < 12) return "오전(6~11시)";
  if (h < 18) return "오후(12~17시)";
  return "저녁(18~23시)";
}

const CATEGORY_KEYWORDS = {
  "운동": ["운동", "달리기", "조깅", "헬스", "수영", "자전거", "요가", "산책", "체육", "마라톤", "다이어트", "健身"],
  "업무": ["업무", "보고서", "미팅", "회의", "프로젝트", "발표", "이메일", "메일", "클라이언트", "고객", "면접", "工作"],
  "학습": ["학습", "공부", "독서", "강의", "인강", "책", "시험", "발표", "리포트", "논문", "学习"],
  "쇼핑": ["쇼핑", "장보기", "구매", "물건", "선물", "구입", "淘宝"],
  "여가": ["여가", "영화", "음악", "게임", "취미", "여행", "산책", "카페", "식당", "모임"],
  "가사": ["가사", "청소", "빨래", "설거지", "요리", "정리", "집안", "家务"],
  "건강": ["건강", "병원", "약", "진료", "검진", "치료", "치과", "안과", "健康"],
  "재정": ["재정", "납부", "공과금", "세금", "투자", "저축", "보험", "카드", "财务"],
  "사교": ["사교", "약속", "모임", "파티", "생일", "결혼", "约"],
};

function suggestCategory(title) {
  const lower = title.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best || "기타";
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "todo_list",
      description: "할 일 목록 조회. category, date(YYYY-MM-DD), search 키워드로 필터 가능",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "카테고리 필터" },
          date: { type: "string", description: "날짜 필터 (YYYY-MM-DD)" },
          search: { type: "string", description: "검색어" },
        },
      },
    },
    {
      name: "todo_add",
      description: "새 할 일 추가",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "할 일 제목" },
          due_at: { type: "string", description: "마감일시 (YYYY-MM-DD HH:MM)" },
          category: { type: "string", description: "카테고리" },
        },
        required: ["title"],
      },
    },
    {
      name: "todo_done",
      description: "할 일 완료 토글",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "할 일 ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "todo_delete",
      description: "할 일 삭제",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "할 일 ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "todo_quick",
      description: "자연어로 할 일 추가 (예: '내일 3시 회의')",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "자연어 입력" },
        },
        required: ["text"],
      },
    },
    {
      name: "todo_categories",
      description: "카테고리 목록 조회",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "todo_recurring",
      description: "반복 일정 목록 조회",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "todo_analyze_overdue",
      description: "기한이 지난 미완료 할 일을 분석. 오늘 기준 due_at이 지났고 done=0인 항목의 수, 목록, 평균 지연 일수를 반환",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "todo_summary_daily",
      description: "특정 날짜의 할 일을 요약. 전체 개수, 시간대별 분포, 완료율, 오전/오후 구분 리스트 반환 (기본: 오늘)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "조회할 날짜 (YYYY-MM-DD). 미입력 시 오늘" },
        },
      },
    },
    {
      name: "todo_recommend_priority",
      description: "미완료 할 일을 긴급도 순으로 정렬하여 추천. 기한 임박 순 + overdue 우선 + 지연 일수 가중치 + 설명 포함",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "todo_suggest_category",
      description: "제목을 입력받아 기존 카테고리 중 가장 유사한 카테고리를 추천 (키워드 매칭). 예: '달리기' → '운동'",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "카테고리를 추천받을 할 일 제목" },
        },
        required: ["title"],
      },
    },
    {
      name: "todo_weekly_review",
      description: "이번 주(월~일) 할 일 분석. 요일별 분포, 주간 완료율, 미완료 항목, 집중해야 할 요일/시간대 제안",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "todo_find_conflicts",
      description: "같은 날+동일 시간대에 겹치는 할 일이 있는지 탐지하여 반환",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const now = new Date();

  try {
    switch (name) {
      case "todo_list": {
        const params = {};
        if (args?.category) params.category = args.category;
        if (args?.date) params.date = args.date;
        if (args?.search) params.q = args.search;
        const todos = await api("GET", "/api/todos", null, params);
        return { content: [{ type: "text", text: JSON.stringify(todos, null, 2) }] };
      }
      case "todo_add": {
        const result = await api("POST", "/api/todos", {
          title: args.title,
          due_at: args.due_at || null,
          category: args.category || "",
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "todo_done": {
        const result = await api("PATCH", `/api/todos/${args.id}/toggle`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "todo_delete": {
        const result = await api("DELETE", `/api/todos/${args.id}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "todo_quick": {
        const result = await api("POST", "/api/todos/quick", { text: args.text });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "todo_categories": {
        const result = await api("GET", "/api/categories");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "todo_recurring": {
        const result = await api("GET", "/api/recurring");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ─── AI 지능형 도구들 ───

      case "todo_analyze_overdue": {
        const all = await api("GET", "/api/todos");
        const overdue = [];
        for (const t of all) {
          if (t.done) continue;
          const d = parseDueAt(t.due_at);
          if (!d) continue;
          if (d < now) {
            const diffMs = now - d;
            const diffDays = Math.floor(diffMs / 86400000);
            overdue.push({ ...t, overdue_days: diffDays });
          }
        }
        overdue.sort((a, b) => b.overdue_days - a.overdue_days);
        const avgDays = overdue.length > 0
          ? (overdue.reduce((s, t) => s + t.overdue_days, 0) / overdue.length).toFixed(1)
          : 0;
        const summary = {
          count: overdue.length,
          average_overdue_days: Number(avgDays),
          items: overdue.map(t => ({
            id: t.id,
            title: t.title,
            due_at: t.due_at,
            category: t.category,
            overdue_days: t.overdue_days,
          })),
        };
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }

      case "todo_summary_daily": {
        const targetDate = args?.date || fmtDate(now);
        const all = await api("GET", "/api/todos", null, { date: targetDate });
        const total = all.length;
        const done = all.filter(t => t.done).length;
        const completionRate = total > 0 ? ((done / total) * 100).toFixed(1) + "%" : "N/A";
        const buckets = { "새벽(0~5시)": [], "오전(6~11시)": [], "오후(12~17시)": [], "저녁(18~23시)": [] };
        const noTime = [];
        for (const t of all) {
          const d = parseDueAt(t.due_at);
          if (!d) {
            noTime.push({ id: t.id, title: t.title, done: t.done, category: t.category, due_at: t.due_at });
          } else {
            const bucket = hourBucket(d);
            buckets[bucket].push({ id: t.id, title: t.title, done: t.done, category: t.category, due_at: t.due_at });
          }
        }
        const summary = {
          date: targetDate,
          total,
          completed: done,
          pending: total - done,
          completion_rate: completionRate,
          time_distribution: {},
          items_by_time: {},
          items_no_time: noTime,
        };
        for (const [bucket, items] of Object.entries(buckets)) {
          summary.time_distribution[bucket] = items.length;
          summary.items_by_time[bucket] = items;
        }
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }

      case "todo_recommend_priority": {
        const all = await api("GET", "/api/todos");
        const pending = all.filter(t => !t.done);
        const scored = pending.map(t => {
          const d = parseDueAt(t.due_at);
          let urgency = 0;
          let reason = "";
          if (d) {
            const diffMs = d - now;
            const diffDays = Math.floor(diffMs / 86400000);
            if (diffDays < 0) {
              urgency = 100 + Math.abs(diffDays) * 2;
              reason = `기한 ${Math.abs(diffDays)}일 전에 만료 (오버듀)`;
            } else if (diffDays === 0) {
              urgency = 90;
              reason = "오늘이 마감일";
            } else if (diffDays === 1) {
              urgency = 80;
              reason = "내일 마감";
            } else if (diffDays <= 3) {
              urgency = 70 - diffDays;
              reason = `${diffDays}일 후 마감`;
            } else if (diffDays <= 7) {
              urgency = 50 - diffDays;
              reason = `${diffDays}일 후 마감 (1주 이내)`;
            } else {
              urgency = 30 - Math.min(diffDays, 30);
              reason = `${diffDays}일 후 마감`;
            }
          } else {
            urgency = 5;
            reason = "마감일 미설정";
          }
          return {
            id: t.id,
            title: t.title,
            due_at: t.due_at || "미설정",
            category: t.category,
            urgency_score: urgency,
            reason,
          };
        });
        scored.sort((a, b) => b.urgency_score - a.urgency_score);
        return { content: [{ type: "text", text: JSON.stringify(scored, null, 2) }] };
      }

      case "todo_suggest_category": {
        const title = args?.title;
        if (!title) throw new Error("title 파라미터가 필요합니다");
        const suggested = suggestCategory(title);
        const cats = await api("GET", "/api/categories");
        const exists = cats.some(c => c.name === suggested);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              title,
              suggested_category: suggested,
              exists_in_db: exists,
            }, null, 2),
          }],
        };
      }

      case "todo_weekly_review": {
        const { monday, sunday } = getWeekRange(now);
        const all = await api("GET", "/api/todos");
        const weekTodos = all.filter(t => {
          const d = parseDueAt(t.due_at);
          if (!d) return false;
          return d >= monday && d <= sunday;
        });
        const dayMap = {};
        for (let i = 1; i <= 7; i++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + (i - 1));
          const key = fmtDate(d);
          dayMap[key] = { day_label: dayLabel(d), date: key, todos: [], done: 0, total: 0 };
        }
        // include Sunday (0) if it's the end of the week
        const sundayKey = fmtDate(sunday);
        if (!dayMap[sundayKey]) {
          dayMap[sundayKey] = { day_label: dayLabel(sunday), date: sundayKey, todos: [], done: 0, total: 0 };
        }
        for (const t of weekTodos) {
          const d = parseDueAt(t.due_at);
          const key = fmtDate(d);
          if (!dayMap[key]) continue;
          dayMap[key].todos.push({ id: t.id, title: t.title, done: t.done, due_at: t.due_at });
          dayMap[key].total++;
          if (t.done) dayMap[key].done++;
        }
        const totalWeek = weekTodos.length;
        const doneWeek = weekTodos.filter(t => t.done).length;
        const weekRate = totalWeek > 0 ? ((doneWeek / totalWeek) * 100).toFixed(1) + "%" : "N/A";
        const pendingWeek = weekTodos.filter(t => !t.done);

        const hourCounts = {};
        for (const t of pendingWeek) {
          const d = parseDueAt(t.due_at);
          if (d) {
            const b = hourBucket(d);
            hourCounts[b] = (hourCounts[b] || 0) + 1;
          }
        }
        const focusBuckets = Object.entries(hourCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([bucket, count]) => ({ bucket, pending_count: count }));

        const heaviestDay = Object.values(dayMap)
          .filter(d => d.total > 0)
          .sort((a, b) => (b.total - b.done) - (a.total - a.done))[0];

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              week: `${fmtDate(monday)} ~ ${fmtDate(sunday)}`,
              total: totalWeek,
              completed: doneWeek,
              pending: totalWeek - doneWeek,
              completion_rate: weekRate,
              daily_breakdown: Object.values(dayMap),
              pending_items: pendingWeek.map(t => ({ id: t.id, title: t.title, due_at: t.due_at, category: t.category })),
              focus_suggestion: {
                busiest_day: heaviestDay ? `${heaviestDay.day_label}(${heaviestDay.date}) — 미완료 ${heaviestDay.total - heaviestDay.done}개` : "없음",
                busiest_time_slots: focusBuckets,
              },
            }, null, 2),
          }],
        };
      }

      case "todo_find_conflicts": {
        const all = await api("GET", "/api/todos");
        const pending = all.filter(t => !t.done && t.due_at);
        const slotMap = {};
        for (const t of pending) {
          const d = parseDueAt(t.due_at);
          if (!d) continue;
          const key = fmtDate(d) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
          if (!slotMap[key]) slotMap[key] = [];
          slotMap[key].push({ id: t.id, title: t.title, category: t.category, due_at: t.due_at });
        }
        const conflicts = [];
        for (const [slot, items] of Object.entries(slotMap)) {
          if (items.length > 1) {
            conflicts.push({ time_slot: slot, count: items.length, items });
          }
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              conflict_count: conflicts.length,
              conflicts,
            }, null, 2),
          }],
        };
      }

      default:
        throw new Error(`알 수 없는 도구: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: "text", text: `오류: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
