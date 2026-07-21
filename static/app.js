const quickForm = document.getElementById("quick-form");
const quickInput = document.getElementById("quick-input");
const toggleDetailedBtn = document.getElementById("toggle-detailed");
const detailedSection = document.getElementById("detailed-section");

const quickRecurringConfirm = document.getElementById("quick-recurring-confirm");
const quickRecurringSummary = document.getElementById("quick-recurring-summary");
const quickRecurringUntil = document.getElementById("quick-recurring-until");
const quickRecurringConfirmBtn = document.getElementById("quick-recurring-confirm-btn");
const quickRecurringCancelBtn = document.getElementById("quick-recurring-cancel-btn");

let pendingRecurring = null;

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const categorySelect = document.getElementById("category-select");
const dueDateInput = document.getElementById("due-date-input");
const dueTimeInput = document.getElementById("due-time-input");
const recurrenceSelect = document.getElementById("recurrence-select");
const recurrenceOptions = document.getElementById("recurrence-options");
const recurrenceUntil = document.getElementById("recurrence-until");
const exceptionStart = document.getElementById("exception-start");
const exceptionEnd = document.getElementById("exception-end");
const addExceptionBtn = document.getElementById("add-exception");
const exceptionList = document.getElementById("exception-list");

const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");
const list = document.getElementById("todo-list");

const suggestionsSection = document.getElementById("suggestions-section");
const suggestionsList = document.getElementById("suggestions-list");

const calendarPrev = document.getElementById("calendar-prev");
const calendarNext = document.getElementById("calendar-next");
const calendarLabel = document.getElementById("calendar-label");
const calendarGrid = document.getElementById("calendar-grid");
const calendarClear = document.getElementById("calendar-clear");

const trackerSelect = document.getElementById("tracker-select");
const trackerNewBtn = document.getElementById("tracker-new-btn");
const trackerDuplicateBtn = document.getElementById("tracker-duplicate-btn");
const trackerNewForm = document.getElementById("tracker-new-form");
const trackerNewName = document.getElementById("tracker-new-name");
const trackerNewLink = document.getElementById("tracker-new-link");
const trackerNewSave = document.getElementById("tracker-new-save");
const trackerNewCancel = document.getElementById("tracker-new-cancel");
const trackerDuplicateForm = document.getElementById("tracker-duplicate-form");
const trackerDuplicateName = document.getElementById("tracker-duplicate-name");
const trackerDuplicateCopy = document.getElementById("tracker-duplicate-copy");
const trackerDuplicateSave = document.getElementById("tracker-duplicate-save");
const trackerDuplicateCancel = document.getElementById("tracker-duplicate-cancel");
const trackerHeaderEl = document.getElementById("tracker-header");
const trackerWeekdaysEl = document.getElementById("tracker-weekdays");
const trackerGrid = document.getElementById("tracker-grid");
const trackerEmpty = document.getElementById("tracker-empty");
let trackers = [];
let currentTrackerId = null;


const overdueSection = document.getElementById("overdue-section");
const overdueList = document.getElementById("overdue-list");
const enableNotificationsBtn = document.getElementById("enable-notifications");

let calendarViewDate = new Date();

const newCategoryForm = document.getElementById("new-category-form");
const newCategoryName = document.getElementById("new-category-name");
const newCategoryIcon = document.getElementById("new-category-icon");
const newCategoryGroup = document.getElementById("new-category-group");
const newCategorySave = document.getElementById("new-category-save");
const newCategoryCancel = document.getElementById("new-category-cancel");

const manageCategories = document.getElementById("manage-categories");
const manageCategoriesList = document.getElementById("manage-categories-list");
const manageCategoriesClose = document.getElementById("manage-categories-close");

const bulkActions = document.getElementById("bulk-actions");
const bulkCount = document.getElementById("bulk-count");
const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
const bulkClearBtn = document.getElementById("bulk-clear-btn");

let categoriesMap = {};
let pendingExceptions = [];
let selectedTodoIds = new Set();
let lastSelectedIndex = null;
let currentTodoOrder = [];
let selectedDate = null;

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

async function fetchTodos() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  if (categoryFilter.value) params.set("category", categoryFilter.value);
  if (selectedDate) params.set("date", selectedDate);

  const res = await fetch(`/api/todos?${params.toString()}`);
  const todos = await res.json();
  renderTodos(todos);
}

let groupsCache = [];

async function loadGroups() {
  const res = await fetch("/api/groups");
  groupsCache = await res.json();
  newCategoryGroup.innerHTML = "";
  for (const group of groupsCache) {
    const option = document.createElement("option");
    option.value = group.key;
    option.textContent = group.label;
    newCategoryGroup.appendChild(option);
  }
}

async function loadCategories() {
  const res = await fetch("/api/categories");
  const categories = await res.json();
  categoriesMap = {};
  for (const c of categories) categoriesMap[c.name] = c;

  const currentSelectValue = categorySelect.value;
  const currentFilterValue = categoryFilter.value;

  categorySelect.innerHTML = '<option value="">카테고리 없음</option>';
  categoryFilter.innerHTML = '<option value="">전체 카테고리</option>';
  for (const c of categories) {
    const opt1 = document.createElement("option");
    opt1.value = c.name;
    opt1.textContent = `${c.icon} ${c.name}`;
    categorySelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = c.name;
    opt2.textContent = `${c.icon} ${c.name}`;
    categoryFilter.appendChild(opt2);
  }
  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "+ 새 카테고리";
  categorySelect.appendChild(newOpt);

  const manageOpt = document.createElement("option");
  manageOpt.value = "__manage__";
  manageOpt.textContent = "⚙ 카테고리 관리";
  categorySelect.appendChild(manageOpt);

  if ([...categorySelect.options].some((o) => o.value === currentSelectValue)) {
    categorySelect.value = currentSelectValue;
  }
  if ([...categoryFilter.options].some((o) => o.value === currentFilterValue)) {
    categoryFilter.value = currentFilterValue;
  }
}

function formatTimestamp(value) {
  // value: "YYYY-MM-DD HH:MM(:SS)?"
  const [datePart, timePart] = value.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const weekday = WEEKDAY_NAMES[new Date(year, month - 1, day).getDay()];
  return `${datePart.slice(5).replace("-", "/")}(${weekday}) ${timePart.slice(0, 5)}`;
}

function renderTodos(todos) {
  list.innerHTML = "";
  currentTodoOrder = todos.map((t) => t.id);
  for (const todo of todos) {
    const li = document.createElement("li");
    li.className = [todo.done ? "done" : "", selectedTodoIds.has(todo.id) ? "selected" : ""]
      .filter(Boolean)
      .join(" ");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!todo.done;
    checkbox.addEventListener("click", (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        selectTodo(todo.id, true);
      }
    });
    checkbox.addEventListener("change", () => {
      if (selectedTodoIds.size > 1 && selectedTodoIds.has(todo.id)) {
        bulkSetDone([...selectedTodoIds], checkbox.checked);
      } else {
        toggleTodo(todo.id);
      }
    });

    const titleSpan = document.createElement("span");
    titleSpan.className = "todo-title";
    titleSpan.textContent = todo.title;
    titleSpan.addEventListener("click", (e) => selectTodo(todo.id, e.shiftKey));

    const timeSpan = document.createElement("span");
    timeSpan.className = "todo-time";
    timeSpan.textContent = formatTimestamp(todo.due_at || todo.created_at);
    timeSpan.addEventListener("click", (e) => selectTodo(todo.id, e.shiftKey));

    li.append(checkbox, titleSpan, timeSpan);

    if (todo.recurring_rule_id) {
      const recurBadge = document.createElement("span");
      recurBadge.className = "recur-badge";
      recurBadge.textContent = "🔁";
      recurBadge.title = "반복 일정";
      li.append(recurBadge);
    }

    li.append(createCategoryControl(todo.id, todo.category));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "삭제";
    deleteBtn.className = "delete-btn";
    deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

    li.append(deleteBtn);
    list.appendChild(li);
  }
}

function createCategoryControl(todoId, currentCategory) {
  const wrapper = document.createElement("span");
  wrapper.className = "category-prompt";

  const badge = document.createElement("button");
  badge.type = "button";
  if (currentCategory) {
    const meta = categoriesMap[currentCategory];
    badge.className = "category-badge";
    badge.textContent = meta ? `${meta.icon} ${currentCategory}` : `🏷️ ${currentCategory}`;
    badge.style.backgroundColor = meta ? meta.color : "#95A5A6";
  } else {
    badge.className = "category-prompt-btn";
    badge.textContent = "+ 카테고리";
  }

  const select = document.createElement("select");
  select.hidden = true;
  select.innerHTML = '<option value="">카테고리 없음</option>';
  for (const name of Object.keys(categoriesMap)) {
    const meta = categoriesMap[name];
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${meta.icon} ${name}`;
    if (name === currentCategory) option.selected = true;
    select.appendChild(option);
  }

  badge.addEventListener("click", () => {
    badge.hidden = true;
    select.hidden = false;
    select.focus();
  });

  select.addEventListener("change", async () => {
    await setTodoCategory(todoId, select.value);
    await fetchTodos();
  });
  select.addEventListener("blur", () => {
    select.hidden = true;
    badge.hidden = false;
  });

  wrapper.append(badge, select);
  return wrapper;
}

async function setTodoCategory(id, category) {
  await fetch(`/api/todos/${id}/category`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  });
}

async function toggleTodo(id) {
  await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
  await fetchTodos();
  await renderTracker();
}

async function bulkSetDone(ids, done) {
  await Promise.all(
    ids.map((id) =>
      fetch(`/api/todos/${id}/done`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      })
    )
  );
  await fetchTodos();
  await renderTracker();
}

async function deleteTodo(id) {
  await fetch(`/api/todos/${id}`, { method: "DELETE" });
  selectedTodoIds.delete(id);
  await fetchTodos();
  await renderCalendar();
}

function selectTodo(id, shiftKey) {
  const index = currentTodoOrder.indexOf(id);
  if (index === -1) return;

  if (shiftKey && lastSelectedIndex !== null) {
    const [from, to] = [lastSelectedIndex, index].sort((a, b) => a - b);
    selectedTodoIds = new Set(currentTodoOrder.slice(from, to + 1));
  } else {
    selectedTodoIds = new Set([id]);
    lastSelectedIndex = index;
  }
  applySelectionHighlight();
  updateBulkActionsBar();
}

function applySelectionHighlight() {
  document.querySelectorAll("#todo-list li").forEach((li, i) => {
    const id = currentTodoOrder[i];
    li.classList.toggle("selected", selectedTodoIds.has(id));
  });
}

function updateBulkActionsBar() {
  bulkActions.hidden = selectedTodoIds.size === 0;
  bulkCount.textContent = `${selectedTodoIds.size}개 선택됨`;
}

bulkDeleteBtn.addEventListener("click", async () => {
  if (selectedTodoIds.size === 0) return;
  if (!confirm(`선택한 ${selectedTodoIds.size}개 할 일을 삭제할까요?`)) return;
  await Promise.all(
    [...selectedTodoIds].map((id) => fetch(`/api/todos/${id}`, { method: "DELETE" }))
  );
  selectedTodoIds = new Set();
  lastSelectedIndex = null;
  updateBulkActionsBar();
  await fetchTodos();
  await renderCalendar();
});

bulkClearBtn.addEventListener("click", () => {
  selectedTodoIds = new Set();
  lastSelectedIndex = null;
  applySelectionHighlight();
  updateBulkActionsBar();
});

document.getElementById("select-all-btn").addEventListener("click", () => {
  selectedTodoIds = new Set(currentTodoOrder);
  lastSelectedIndex = currentTodoOrder.length - 1;
  applySelectionHighlight();
  updateBulkActionsBar();
});

async function fetchSuggestions() {
  const res = await fetch("/api/calendar/suggestions");
  if (!res.ok) {
    suggestionsSection.hidden = true;
    return;
  }
  const suggestions = await res.json();
  renderSuggestions(suggestions);
}

function renderSuggestions(suggestions) {
  suggestionsSection.hidden = suggestions.length === 0;
  suggestionsList.innerHTML = "";
  for (const s of suggestions) {
    const li = document.createElement("li");

    const titleSpan = document.createElement("span");
    titleSpan.className = "todo-title";
    titleSpan.textContent = s.title;

    const timeSpan = document.createElement("span");
    timeSpan.className = "todo-time";
    timeSpan.textContent = formatTimestamp(s.due_at);

    const calendarSpan = document.createElement("span");
    if (s.calendar) {
      calendarSpan.className = "suggestion-calendar";
      calendarSpan.textContent = s.calendar;
    }

    const acceptBtn = document.createElement("button");
    acceptBtn.textContent = "추가";
    acceptBtn.addEventListener("click", async () => {
      await fetch("/api/calendar/suggestions/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: s.event_id, title: s.title, due_at: s.due_at }),
      });
      await fetchSuggestions();
      await fetchTodos();
      await renderCalendar();
    });

    const ignoreBtn = document.createElement("button");
    ignoreBtn.textContent = "무시";
    ignoreBtn.className = "delete-btn";
    ignoreBtn.addEventListener("click", async () => {
      await fetch(`/api/calendar/suggestions/${encodeURIComponent(s.event_id)}/ignore`, {
        method: "POST",
      });
      await fetchSuggestions();
    });

    li.append(titleSpan, timeSpan, calendarSpan, acceptBtn, ignoreBtn);
    suggestionsList.appendChild(li);
  }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchAllDueDates() {
  const res = await fetch("/api/todos");
  const todos = await res.json();
  const dates = new Set();
  for (const t of todos) {
    if (t.due_at) dates.add(t.due_at.slice(0, 10));
  }
  return dates;
}

async function renderCalendar() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  calendarLabel.textContent = `${year}년 ${month + 1}월`;

  const dueDates = await fetchAllDueDates();
  const today = todayISO();

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  calendarGrid.innerHTML = "";
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("span");
    empty.className = "calendar-day empty";
    calendarGrid.appendChild(empty);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day";
    if (iso === today) btn.classList.add("today");
    if (iso === selectedDate) btn.classList.add("selected");
    btn.textContent = day;
    if (dueDates.has(iso)) {
      const dot = document.createElement("span");
      dot.className = "dot";
      btn.appendChild(dot);
    }
    btn.addEventListener("click", () => {
      selectedDate = selectedDate === iso ? null : iso;
      calendarClear.hidden = !selectedDate;
      renderCalendar();
      fetchTodos();
    });
    calendarGrid.appendChild(btn);
  }
}

calendarPrev.addEventListener("click", () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
  renderCalendar();
});
calendarNext.addEventListener("click", () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
  renderCalendar();
});
calendarClear.addEventListener("click", () => {
  selectedDate = null;
  calendarClear.hidden = true;
  renderCalendar();
  fetchTodos();
});

async function loadTrackers() {
  const res = await fetch("/api/trackers");
  trackers = await res.json();

  trackerSelect.innerHTML = "";
  for (const t of trackers) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.recurring_rule_id ? `🔗 ${t.name}` : t.name;
    trackerSelect.appendChild(opt);
  }

  if (trackers.length === 0) {
    currentTrackerId = null;
  } else if (!trackers.some((t) => t.id === currentTrackerId)) {
    currentTrackerId = trackers[0].id;
  }
  if (currentTrackerId != null) trackerSelect.value = currentTrackerId;
}

async function renderTracker() {
  await loadTrackers();

  const hasTracker = currentTrackerId != null;
  const current = trackers.find((t) => t.id === currentTrackerId);
  const isLinked = !!(current && current.recurring_rule_id);

  trackerSelect.hidden = !hasTracker;
  trackerDuplicateBtn.hidden = !hasTracker || isLinked;
  trackerWeekdaysEl.hidden = !hasTracker;
  trackerGrid.hidden = !hasTracker;
  trackerEmpty.hidden = hasTracker;

  if (!hasTracker) {
    trackerHeaderEl.textContent = "";
    trackerGrid.innerHTML = "";
    return;
  }

  const res = await fetch(`/api/trackers/${currentTrackerId}/entries`);
  const data = await res.json();
  const days = data.days || [];
  trackerHeaderEl.textContent =
    isLinked && current.recurring_title
      ? `${data.year}년 ${data.month}월 · 🔗 ${current.recurring_title}`
      : `${data.year}년 ${data.month}월`;

  trackerGrid.innerHTML = "";
  if (days.length === 0) return;

  const firstDate = new Date(`${days[0].date}T00:00:00`);
  const padding = firstDate.getDay();
  for (let i = 0; i < padding; i++) {
    const empty = document.createElement("span");
    empty.className = "calendar-day empty";
    trackerGrid.appendChild(empty);
  }
  for (const d of days) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day";
    if (isLinked) btn.classList.add("tracker-linked");
    btn.dataset.status = d.status || "";
    if (d.status === "done") btn.classList.add("tracker-done");
    else if (d.status === "failed") btn.classList.add("tracker-failed");
    btn.textContent = d.day;
    btn.title = d.date;
    if (!isLinked) {
      btn.addEventListener("click", () => cycleTrackerEntry(d.date, btn));
    }
    trackerGrid.appendChild(btn);
  }
}

async function cycleTrackerEntry(dateStr, btn) {
  const current = btn.dataset.status || null;
  const next = current === "done" ? "failed" : current === "failed" ? null : "done";

  btn.classList.remove("tracker-done", "tracker-failed");
  if (next === "done") btn.classList.add("tracker-done");
  else if (next === "failed") btn.classList.add("tracker-failed");
  btn.dataset.status = next || "";

  await fetch(`/api/trackers/${currentTrackerId}/entries/${dateStr}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: next }),
  });
}

trackerSelect.addEventListener("change", () => {
  currentTrackerId = Number(trackerSelect.value);
  trackerNewForm.hidden = true;
  trackerDuplicateForm.hidden = true;
  renderTracker();
});

async function populateTrackerLinkOptions() {
  const res = await fetch("/api/recurring");
  const rules = await res.json();
  trackerNewLink.innerHTML = '<option value="">직접 기록 (수동)</option>';
  for (const rule of rules) {
    const opt = document.createElement("option");
    opt.value = rule.id;
    opt.textContent = rule.title;
    trackerNewLink.appendChild(opt);
  }
}

trackerNewBtn.addEventListener("click", async () => {
  trackerDuplicateForm.hidden = true;
  trackerNewForm.hidden = false;
  trackerNewName.value = "";
  trackerNewLink.value = "";
  await populateTrackerLinkOptions();
  trackerNewName.focus();
});

trackerNewCancel.addEventListener("click", () => {
  trackerNewForm.hidden = true;
});

trackerNewSave.addEventListener("click", async () => {
  const name = trackerNewName.value.trim();
  if (!name) return;
  const body = { name };
  if (trackerNewLink.value) body.recurring_rule_id = Number(trackerNewLink.value);
  const res = await fetch("/api/trackers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const created = await res.json();
  trackerNewForm.hidden = true;
  currentTrackerId = created.id;
  await renderTracker();
});

trackerDuplicateBtn.addEventListener("click", () => {
  if (currentTrackerId == null) return;
  const current = trackers.find((t) => t.id === currentTrackerId);
  trackerNewForm.hidden = true;
  trackerDuplicateForm.hidden = false;
  trackerDuplicateName.value = current ? `${current.name}2` : "";
  trackerDuplicateCopy.checked = false;
  trackerDuplicateName.focus();
});

trackerDuplicateCancel.addEventListener("click", () => {
  trackerDuplicateForm.hidden = true;
});

trackerDuplicateSave.addEventListener("click", async () => {
  const name = trackerDuplicateName.value.trim();
  if (!name || currentTrackerId == null) return;
  const res = await fetch(`/api/trackers/${currentTrackerId}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, copy_data: trackerDuplicateCopy.checked }),
  });
  const created = await res.json();
  trackerDuplicateForm.hidden = true;
  currentTrackerId = created.id;
  await renderTracker();
});

const notifiedIds = new Set();

function loadSnoozes() {
  const raw = localStorage.getItem("todoSnoozes");
  const map = raw ? JSON.parse(raw) : {};
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (map[id] < now) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) localStorage.setItem("todoSnoozes", JSON.stringify(map));
  return map;
}

function snoozeTodo(id, hours) {
  const map = loadSnoozes();
  map[id] = Date.now() + hours * 60 * 60 * 1000;
  localStorage.setItem("todoSnoozes", JSON.stringify(map));
}

async function checkOverdue() {
  const res = await fetch("/api/todos");
  const todos = await res.json();
  const now = new Date();
  const snoozes = loadSnoozes();

  const overdue = todos.filter((t) => {
    if (t.done || !t.due_at) return false;
    if (snoozes[t.id]) return false;
    const due = new Date(t.due_at.replace(" ", "T"));
    return due < now;
  });

  const overdueIds = new Set(overdue.map((t) => t.id));
  for (const id of notifiedIds) {
    if (!overdueIds.has(id)) notifiedIds.delete(id);
  }

  renderOverdue(overdue);

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    for (const t of overdue) {
      if (notifiedIds.has(t.id)) continue;
      notifiedIds.add(t.id);
      new Notification("지난 할 일 확인", { body: `"${t.title}" 완료하셨나요?` });
    }
  }
}

function renderOverdue(overdue) {
  overdueSection.hidden = overdue.length === 0;
  overdueList.innerHTML = "";
  for (const t of overdue) {
    const li = document.createElement("li");
    li.className = "overdue-item";

    const row = document.createElement("div");
    row.className = "overdue-title-row";
    const titleSpan = document.createElement("span");
    titleSpan.className = "todo-title";
    titleSpan.textContent = t.title;
    const timeSpan = document.createElement("span");
    timeSpan.className = "todo-time";
    timeSpan.textContent = formatTimestamp(t.due_at);
    row.append(titleSpan, timeSpan);

    const actions = document.createElement("div");
    actions.className = "overdue-actions";

    const completeBtn = document.createElement("button");
    completeBtn.className = "btn-complete";
    completeBtn.textContent = "완료";
    completeBtn.addEventListener("click", async () => {
      await toggleTodo(t.id);
      await checkOverdue();
    });

    const rescheduleBtn = document.createElement("button");
    rescheduleBtn.className = "btn-reschedule";
    rescheduleBtn.textContent = "다시 일정 잡기";

    const rescheduleForm = document.createElement("div");
    rescheduleForm.className = "reschedule-form";
    rescheduleForm.hidden = true;
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    const timeInput = document.createElement("input");
    timeInput.type = "time";
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "확인";
    confirmBtn.className = "btn-reschedule";
    confirmBtn.addEventListener("click", async () => {
      if (!dateInput.value) {
        dateInput.focus();
        return;
      }
      const due_at = `${dateInput.value} ${timeInput.value || "00:00"}`;
      await fetch(`/api/todos/${t.id}/due_at`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_at }),
      });
      await fetchTodos();
      await checkOverdue();
      await renderCalendar();
    });
    rescheduleForm.append(dateInput, timeInput, confirmBtn);

    rescheduleBtn.addEventListener("click", () => {
      rescheduleForm.hidden = !rescheduleForm.hidden;
    });

    const snoozeBtn = document.createElement("button");
    snoozeBtn.className = "btn-snooze";
    snoozeBtn.textContent = "나중에";
    snoozeBtn.addEventListener("click", () => {
      snoozeTodo(t.id, 3);
      checkOverdue();
    });

    actions.append(completeBtn, rescheduleBtn, snoozeBtn);
    li.append(row, actions, rescheduleForm);
    overdueList.appendChild(li);
  }
}

enableNotificationsBtn.addEventListener("click", async () => {
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    enableNotificationsBtn.textContent = "🔔 알림 켜짐";
  }
});

if (typeof Notification !== "undefined" && Notification.permission === "granted") {
  enableNotificationsBtn.textContent = "🔔 알림 켜짐";
}

function freqLabel(freq, interval) {
  if (freq === "DAILY") return "매일";
  if (freq === "WEEKLY" && interval === 2) return "격주";
  return "매주";
}

quickForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = quickInput.value.trim();
  if (!text) return;
  const res = await fetch("/api/todos/quick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.detail || "할 일을 추가하지 못했습니다.");
    return;
  }
  const result = await res.json();
  if (result.needs_until_date) {
    pendingRecurring = result;
    quickRecurringSummary.textContent =
      `"${result.title}" — ${freqLabel(result.freq, result.interval)} 반복`;
    quickRecurringUntil.value = "";
    quickRecurringConfirm.hidden = false;
    return;
  }
  quickInput.value = "";
  quickInput.focus();
  await fetchTodos();
  await renderCalendar();
});

document.querySelectorAll("#quick-recurring-confirm .preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const months = Number(btn.dataset.months);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    quickRecurringUntil.value = d.toISOString().slice(0, 10);
  });
});

quickRecurringCancelBtn.addEventListener("click", () => {
  pendingRecurring = null;
  quickRecurringConfirm.hidden = true;
});

quickRecurringConfirmBtn.addEventListener("click", async () => {
  if (!quickRecurringUntil.value) {
    quickRecurringUntil.focus();
    return;
  }
  const res = await fetch("/api/recurring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: pendingRecurring.title,
      category: pendingRecurring.category,
      freq: pendingRecurring.freq,
      interval: pendingRecurring.interval,
      time_of_day: pendingRecurring.time_of_day,
      start_date: pendingRecurring.start_date,
      until_date: quickRecurringUntil.value,
      exceptions: pendingRecurring.exceptions || [],
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.detail || "반복 일정을 추가하지 못했습니다.");
    return;
  }
  pendingRecurring = null;
  quickRecurringConfirm.hidden = true;
  quickInput.value = "";
  quickInput.focus();
  await fetchTodos();
  await renderCalendar();
});

toggleDetailedBtn.addEventListener("click", () => {
  detailedSection.hidden = !detailedSection.hidden;
  toggleDetailedBtn.textContent = detailedSection.hidden ? "상세 입력 ▾" : "상세 입력 ▴";
});

recurrenceSelect.addEventListener("change", () => {
  recurrenceOptions.hidden = recurrenceSelect.value === "";
});

addExceptionBtn.addEventListener("click", () => {
  const start = exceptionStart.value;
  const end = exceptionEnd.value;
  if (!start || !end) return;
  pendingExceptions.push([start, end]);
  renderExceptions();
  exceptionStart.value = "";
  exceptionEnd.value = "";
});

function renderExceptions() {
  exceptionList.innerHTML = "";
  pendingExceptions.forEach(([start, end], idx) => {
    const li = document.createElement("li");
    li.textContent = `${start} ~ ${end} `;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "삭제";
    removeBtn.className = "delete-btn";
    removeBtn.addEventListener("click", () => {
      pendingExceptions.splice(idx, 1);
      renderExceptions();
    });
    li.appendChild(removeBtn);
    exceptionList.appendChild(li);
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  const category = categorySelect.value === "__new__" ? "" : categorySelect.value;

  if (recurrenceSelect.value) {
    if (!dueDateInput.value) {
      alert("반복 일정은 시작 날짜를 지정해야 합니다.");
      return;
    }
    if (!recurrenceUntil.value) {
      alert("반복 일정은 종료일을 지정해야 합니다.");
      recurrenceUntil.focus();
      return;
    }
    const [freq, interval] = recurrenceSelect.value.split(":");
    const res = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        category,
        freq,
        interval: Number(interval),
        time_of_day: dueTimeInput.value || null,
        start_date: dueDateInput.value,
        until_date: recurrenceUntil.value,
        exceptions: pendingExceptions,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || "반복 일정을 추가하지 못했습니다.");
      return;
    }
  } else {
    const due_at = dueDateInput.value
      ? `${dueDateInput.value} ${dueTimeInput.value || "00:00"}`
      : null;
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, due_at }),
    });
  }

  input.value = "";
  categorySelect.value = "";
  dueDateInput.value = "";
  dueTimeInput.value = "";
  recurrenceSelect.value = "";
  recurrenceOptions.hidden = true;
  recurrenceUntil.value = "";
  pendingExceptions = [];
  renderExceptions();
  input.focus();
  await fetchTodos();
  await renderCalendar();
});

categorySelect.addEventListener("change", () => {
  if (categorySelect.value === "__new__") {
    newCategoryForm.hidden = false;
    newCategoryName.focus();
    categorySelect.value = "";
  } else if (categorySelect.value === "__manage__") {
    renderManageCategories();
    manageCategories.hidden = false;
    categorySelect.value = "";
  }
});

function renderManageCategories() {
  manageCategoriesList.innerHTML = "";
  for (const name of Object.keys(categoriesMap)) {
    const meta = categoriesMap[name];
    const li = document.createElement("li");
    li.className = "manage-category-row";

    const iconInput = document.createElement("input");
    iconInput.type = "text";
    iconInput.className = "cat-icon-input";
    iconInput.maxLength = 4;
    iconInput.value = meta.icon;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "cat-name-input";
    nameInput.value = name;

    const groupSelect = document.createElement("select");
    for (const group of groupsCache) {
      const option = document.createElement("option");
      option.value = group.key;
      option.textContent = group.label;
      if (group.key === meta.group_key) option.selected = true;
      groupSelect.appendChild(option);
    }

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "cat-save-btn";
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", async () => {
      const res = await fetch(`/api/categories/${encodeURIComponent(name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          icon: iconInput.value.trim(),
          group_key: groupSelect.value,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "카테고리를 수정하지 못했습니다.");
        return;
      }
      await loadCategories();
      await fetchTodos();
      renderManageCategories();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "cat-delete-btn";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`"${name}" 카테고리를 삭제할까요? 이 카테고리를 쓰던 할 일은 카테고리 없음이 됩니다.`)) {
        return;
      }
      await fetch(`/api/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
      await loadCategories();
      await fetchTodos();
      renderManageCategories();
    });

    li.append(iconInput, nameInput, groupSelect, saveBtn, deleteBtn);
    manageCategoriesList.appendChild(li);
  }
}

manageCategoriesClose.addEventListener("click", () => {
  manageCategories.hidden = true;
});

newCategoryCancel.addEventListener("click", () => {
  newCategoryForm.hidden = true;
  newCategoryName.value = "";
  newCategoryIcon.value = "";
  categorySelect.value = "";
});

newCategorySave.addEventListener("click", async () => {
  const name = newCategoryName.value.trim();
  if (!name) {
    newCategoryName.focus();
    return;
  }
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      icon: newCategoryIcon.value.trim(),
      group_key: newCategoryGroup.value,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.detail || "카테고리를 추가하지 못했습니다.");
    return;
  }
  await loadCategories();
  categorySelect.value = name;
  newCategoryForm.hidden = true;
  newCategoryName.value = "";
  newCategoryIcon.value = "";
});

searchInput.addEventListener("input", () => fetchTodos());
categoryFilter.addEventListener("change", () => fetchTodos());

(async () => {
  await loadGroups();
  await loadCategories();
  await fetchTodos();
  await fetchSuggestions();
  await renderCalendar();
  await renderTracker();
  await checkOverdue();
  setInterval(checkOverdue, 60000);
})();
