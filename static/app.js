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
const suggestionsSelectAllBtn = document.getElementById("suggestions-select-all-btn");
const suggestionsBulkActions = document.getElementById("suggestions-bulk-actions");
const suggestionsBulkCount = document.getElementById("suggestions-bulk-count");
const suggestionsBulkAcceptBtn = document.getElementById("suggestions-bulk-accept-btn");
const suggestionsBulkClearBtn = document.getElementById("suggestions-bulk-clear-btn");

let currentSuggestions = [];
let selectedSuggestionIds = new Set();

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
const trackerNewWeeklyToggle = document.getElementById("tracker-new-weekly-toggle");
const trackerNewWeeklyTargetRow = document.getElementById("tracker-new-weekly-target-row");
const trackerNewWeeklyTarget = document.getElementById("tracker-new-weekly-target");
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


const balancePeriodSelect = document.getElementById("balance-period");
const balanceRangeEl = document.getElementById("balance-range");
const balanceChart = document.getElementById("balance-chart");
const balanceTotalEl = document.getElementById("balance-total");
const balanceLegend = document.getElementById("balance-legend");
const balanceEmpty = document.getElementById("balance-empty");

const overdueSection = document.getElementById("overdue-section");
const overdueList = document.getElementById("overdue-list");
const enableNotificationsBtn = document.getElementById("enable-notifications");

let calendarViewDate = new Date();

const newCategoryForm = document.getElementById("new-category-form");
const newCategoryName = document.getElementById("new-category-name");
const newCategoryIcon = document.getElementById("new-category-icon");
const newCategoryGroup = document.getElementById("new-category-group");
const newCategoryParent = document.getElementById("new-category-parent");
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

function updateParentCategoryOptions() {
  newCategoryParent.innerHTML = '<option value="">상위 카테고리 없음 (최상위)</option>';
  for (const c of Object.values(categoriesMap)) {
    if (!c.parent_id) {
      const option = document.createElement("option");
      option.value = c.name;
      option.textContent = `${c.icon} ${c.name}`;
      newCategoryParent.appendChild(option);
    }
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

  const parents = categories.filter((c) => !c.parent_id);
  const children = categories.filter((c) => c.parent_id);

  for (const c of parents) {
    const opt1 = document.createElement("option");
    opt1.value = c.name;
    opt1.textContent = `${c.icon} ${c.name}`;
    categorySelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = c.name;
    opt2.textContent = `${c.icon} ${c.name}`;
    categoryFilter.appendChild(opt2);

    const subs = children.filter((ch) => ch.parent_name === c.name);
    for (const sub of subs) {
      const subOpt1 = document.createElement("option");
      subOpt1.value = sub.name;
      subOpt1.textContent = `  └ ${sub.icon} ${sub.name}`;
      categorySelect.appendChild(subOpt1);

      const subOpt2 = document.createElement("option");
      subOpt2.value = sub.name;
      subOpt2.textContent = `  └ ${sub.icon} ${sub.name}`;
      categoryFilter.appendChild(subOpt2);
    }
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
  updateParentCategoryOptions();
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
    titleSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startEditingTodo(todo, li);
    });

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

function startEditingTodo(todo, li) {
  li.classList.add("editing");

  const existingTitle = li.querySelector(".todo-title");
  const existingTime = li.querySelector(".todo-time");
  if (existingTitle) existingTitle.hidden = true;
  if (existingTime) existingTime.hidden = true;

  const editForm = document.createElement("div");
  editForm.className = "edit-form";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "edit-title-input";
  titleInput.value = todo.title;

  const dueDateInput = document.createElement("input");
  dueDateInput.type = "date";
  dueDateInput.className = "edit-date-input";
  if (todo.due_at) {
    dueDateInput.value = todo.due_at.slice(0, 10);
  }

  const dueTimeInput = document.createElement("input");
  dueTimeInput.type = "time";
  dueTimeInput.className = "edit-time-input";
  if (todo.due_at) {
    const timePart = todo.due_at.slice(11, 16);
    if (timePart) dueTimeInput.value = timePart;
  }

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "edit-save-btn";
  saveBtn.textContent = "저장";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "edit-cancel-btn";
  cancelBtn.textContent = "취소";

  const saveEdit = async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle) {
      titleInput.focus();
      return;
    }
    let newDueAt = null;
    if (dueDateInput.value) {
      newDueAt = `${dueDateInput.value} ${dueTimeInput.value || "00:00"}`;
    }
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, due_at: newDueAt }),
    });
    await fetchTodos();
    await renderCalendar();
  };

  saveBtn.addEventListener("click", saveEdit);
  cancelBtn.addEventListener("click", async () => {
    await fetchTodos();
  });
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") fetchTodos();
  });

  editForm.append(titleInput, dueDateInput, dueTimeInput, saveBtn, cancelBtn);

  const categoryEl = li.querySelector(".category-prompt");
  if (categoryEl) {
    li.insertBefore(editForm, categoryEl);
  } else {
    const deleteBtn = li.querySelector(".delete-btn");
    if (deleteBtn) {
      li.insertBefore(editForm, deleteBtn);
    } else {
      li.appendChild(editForm);
    }
  }

  titleInput.focus();
  titleInput.select();
}

function createCategoryControl(todoId, currentCategory) {
  const wrapper = document.createElement("span");
  wrapper.className = "category-prompt";

  const badge = document.createElement("button");
  badge.type = "button";
  if (currentCategory) {
    const meta = categoriesMap[currentCategory];
    badge.className = "category-badge";
    if (meta && meta.parent_name) {
      badge.textContent = `${meta.icon} ${meta.parent_name} ▸ ${currentCategory}`;
    } else {
      badge.textContent = meta ? `${meta.icon} ${currentCategory}` : `🏷️ ${currentCategory}`;
    }
    badge.style.backgroundColor = meta ? meta.color : "#95A5A6";
  } else {
    badge.className = "category-prompt-btn";
    badge.textContent = "+ 카테고리";
  }

  const select = document.createElement("select");
  select.hidden = true;
  select.innerHTML = '<option value="">카테고리 없음</option>';

  const parents = Object.values(categoriesMap).filter((c) => !c.parent_id);
  const children = Object.values(categoriesMap).filter((c) => c.parent_id);

  for (const c of parents) {
    const option = document.createElement("option");
    option.value = c.name;
    option.textContent = `${c.icon} ${c.name}`;
    if (c.name === currentCategory) option.selected = true;
    select.appendChild(option);

    const subs = children.filter((ch) => ch.parent_name === c.name);
    for (const sub of subs) {
      const subOption = document.createElement("option");
      subOption.value = sub.name;
      subOption.textContent = `  └ ${sub.icon} ${sub.name}`;
      if (sub.name === currentCategory) subOption.selected = true;
      select.appendChild(subOption);
    }
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
  await renderBalance();
}

async function toggleTodo(id) {
  await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
  await fetchTodos();
  await renderTracker();
  await renderBalance();
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
  await renderBalance();
}

async function deleteTodo(id) {
  await fetch(`/api/todos/${id}`, { method: "DELETE" });
  selectedTodoIds.delete(id);
  await fetchTodos();
  await renderCalendar();
  await renderBalance();
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
  await renderBalance();
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

async function acceptSuggestion(s) {
  await fetch("/api/calendar/suggestions/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: s.event_id, title: s.title, due_at: s.due_at }),
  });
}

function updateSuggestionsBulkBar() {
  const count = selectedSuggestionIds.size;
  suggestionsBulkActions.hidden = count === 0;
  suggestionsBulkCount.textContent = count > 0 ? `${count}개 선택됨` : "";
}

async function bulkAcceptSuggestions(ids) {
  const targets = currentSuggestions.filter((s) => ids.includes(s.event_id));
  await Promise.all(targets.map((s) => acceptSuggestion(s)));
  selectedSuggestionIds.clear();
  await fetchSuggestions();
  await fetchTodos();
  await renderCalendar();
}

suggestionsSelectAllBtn.addEventListener("click", () => {
  selectedSuggestionIds = new Set(currentSuggestions.map((s) => s.event_id));
  renderSuggestions(currentSuggestions);
});

suggestionsBulkAcceptBtn.addEventListener("click", () => {
  bulkAcceptSuggestions([...selectedSuggestionIds]);
});

suggestionsBulkClearBtn.addEventListener("click", () => {
  selectedSuggestionIds.clear();
  renderSuggestions(currentSuggestions);
});

function renderSuggestions(suggestions) {
  currentSuggestions = suggestions;
  const liveIds = new Set(suggestions.map((s) => s.event_id));
  selectedSuggestionIds = new Set([...selectedSuggestionIds].filter((id) => liveIds.has(id)));

  suggestionsSection.hidden = suggestions.length === 0;
  suggestionsList.innerHTML = "";
  updateSuggestionsBulkBar();
  for (const s of suggestions) {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedSuggestionIds.has(s.event_id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedSuggestionIds.add(s.event_id);
      } else {
        selectedSuggestionIds.delete(s.event_id);
      }
      updateSuggestionsBulkBar();
    });

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
      await acceptSuggestion(s);
      selectedSuggestionIds.delete(s.event_id);
      await fetchSuggestions();
      await fetchTodos();
      await renderCalendar();
    });

    const ignoreBtn = document.createElement("button");
    ignoreBtn.textContent = "무시";
    ignoreBtn.className = "delete-btn";
    ignoreBtn.addEventListener("click", async () => {
      selectedSuggestionIds.delete(s.event_id);
      await fetch(`/api/calendar/suggestions/${encodeURIComponent(s.event_id)}/ignore`, {
        method: "POST",
      });
      await fetchSuggestions();
    });

    li.append(checkbox, titleSpan, timeSpan, calendarSpan, acceptBtn, ignoreBtn);
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
    opt.textContent = t.recurring_rule_id
      ? `🔗 ${t.name}`
      : t.weekly_target
      ? `🎯 ${t.name} (주 ${t.weekly_target}회)`
      : t.name;
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
  const weeklyTarget = current ? current.weekly_target : null;

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
      : weeklyTarget
      ? `${data.year}년 ${data.month}월 · 🎯 주 ${weeklyTarget}회`
      : `${data.year}년 ${data.month}월`;

  trackerGrid.innerHTML = "";
  if (days.length === 0) return;

  // 패딩 칸과 실제 날짜 칸을 순서대로 한 배열에 모아서, 7개씩 끊으면 달력
  // 그리드의 한 행(=한 주)과 정확히 일치한다 - 주간 목표 달성 여부를
  // 판정/배경 강조하려면 이 주 단위 묶음이 필요하다.
  const cells = [];
  const firstDate = new Date(`${days[0].date}T00:00:00`);
  const padding = firstDate.getDay();
  for (let i = 0; i < padding; i++) {
    const empty = document.createElement("span");
    empty.className = "calendar-day empty";
    cells.push({ el: empty, isDone: false, isDay: false });
  }
  for (const d of days) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day";
    if (isLinked) btn.classList.add("tracker-linked");
    btn.dataset.status = d.status || "";
    if (weeklyTarget) {
      if (d.status === "done") btn.classList.add("tracker-weekly-mark");
    } else if (d.status === "done") {
      btn.classList.add("tracker-done");
    } else if (d.status === "failed") {
      btn.classList.add("tracker-failed");
    }
    btn.textContent = d.day;
    btn.title = d.date;
    if (!isLinked) {
      btn.addEventListener("click", () => cycleTrackerEntry(d.date, btn, !!weeklyTarget));
    }
    cells.push({ el: btn, isDone: d.status === "done", isDay: true });
  }

  if (weeklyTarget) {
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      const doneCount = week.filter((c) => c.isDay && c.isDone).length;
      if (doneCount >= weeklyTarget) {
        for (const c of week) c.el.classList.add("tracker-week-goal-met");
      }
    }
  }

  for (const c of cells) trackerGrid.appendChild(c.el);
}

async function cycleTrackerEntry(dateStr, btn, isWeekly) {
  const current = btn.dataset.status || null;
  const next = isWeekly
    ? current === "done" ? null : "done"
    : current === "done" ? "failed" : current === "failed" ? null : "done";

  await fetch(`/api/trackers/${currentTrackerId}/entries/${dateStr}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: next }),
  });
  // 주간 목표는 이 날짜 하나만 바뀌어도 같은 주 전체의 배경 강조가 바뀔 수
  // 있어(달성/미달성 전환), 이 버튼만 patch하지 않고 전체를 다시 그린다.
  await renderTracker();
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
  trackerNewLink.disabled = false;
  trackerNewWeeklyToggle.checked = false;
  trackerNewWeeklyTargetRow.hidden = true;
  trackerNewWeeklyTarget.value = "2";
  await populateTrackerLinkOptions();
  trackerNewName.focus();
});

trackerNewCancel.addEventListener("click", () => {
  trackerNewForm.hidden = true;
});

trackerNewWeeklyToggle.addEventListener("change", () => {
  trackerNewWeeklyTargetRow.hidden = !trackerNewWeeklyToggle.checked;
  trackerNewLink.disabled = trackerNewWeeklyToggle.checked;
  if (trackerNewWeeklyToggle.checked) trackerNewLink.value = "";
});

trackerNewSave.addEventListener("click", async () => {
  const name = trackerNewName.value.trim();
  if (!name) return;
  const body = { name };
  if (trackerNewWeeklyToggle.checked) {
    const target = Number(trackerNewWeeklyTarget.value);
    if (!Number.isInteger(target) || target < 1 || target > 7) {
      alert("주간 목표는 1~7 사이의 숫자여야 합니다.");
      return;
    }
    body.weekly_target = target;
  } else if (trackerNewLink.value) {
    body.recurring_rule_id = Number(trackerNewLink.value);
  }
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

function describeBalanceRange(period, range) {
  if (period === "day") return range.start;
  if (period === "year") return `${range.start.slice(0, 4)}년`;
  return `${range.start} ~ ${range.end}`;
}

function renderBalanceChart(groups, total) {
  const NS = "http://www.w3.org/2000/svg";
  balanceChart.innerHTML = "";

  if (!total) {
    balanceChart.hidden = true;
    balanceTotalEl.textContent = "";
    return;
  }
  balanceChart.hidden = false;

  const cx = 50;
  const cy = 50;
  const r = 40;
  let angle = -Math.PI / 2;

  const nonZero = groups.filter((g) => g.count > 0);
  if (nonZero.length === 1) {
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", nonZero[0].color);
    balanceChart.appendChild(circle);
  } else {
    for (const g of nonZero) {
      const slice = (g.count / total) * Math.PI * 2;
      const nextAngle = angle + slice;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(nextAngle);
      const y2 = cy + r * Math.sin(nextAngle);
      const largeArc = slice > Math.PI ? 1 : 0;
      const path = document.createElementNS(NS, "path");
      path.setAttribute(
        "d",
        `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
      );
      path.setAttribute("fill", g.color);
      const title = document.createElementNS(NS, "title");
      title.textContent = `${g.icon} ${g.label} ${g.percentage}%`;
      path.appendChild(title);
      balanceChart.appendChild(path);
      angle = nextAngle;
    }
  }

  const hole = document.createElementNS(NS, "circle");
  hole.setAttribute("cx", cx);
  hole.setAttribute("cy", cy);
  hole.setAttribute("r", r * 0.55);
  hole.setAttribute("class", "balance-chart-hole");
  balanceChart.appendChild(hole);

  balanceTotalEl.textContent = `${total}개`;
}

function renderBalanceLegend(groups) {
  balanceLegend.innerHTML = "";
  for (const g of groups) {
    if (g.count === 0) continue;
    const li = document.createElement("li");
    li.className = "balance-legend-row";

    const swatch = document.createElement("span");
    swatch.className = "balance-legend-swatch";
    swatch.style.backgroundColor = g.color;

    const label = document.createElement("span");
    label.className = "balance-legend-label";
    label.textContent = `${g.icon} ${g.label}`;

    const value = document.createElement("span");
    value.className = "balance-legend-value";
    value.textContent = `${g.count}개 (${g.percentage}%)`;

    li.append(swatch, label, value);
    balanceLegend.appendChild(li);
  }
}

async function renderBalance() {
  const period = balancePeriodSelect.value;
  const res = await fetch(`/api/categories/breakdown?period=${period}`);
  if (!res.ok) return;
  const data = await res.json();

  balanceRangeEl.textContent = describeBalanceRange(data.period, data.range);
  balanceEmpty.hidden = data.total > 0;
  renderBalanceChart(data.groups, data.total);
  renderBalanceLegend(data.groups);
}

balancePeriodSelect.addEventListener("change", () => renderBalance());

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

let collapsedCategoryGroups = new Set();

function renderManageCategories() {
  manageCategoriesList.innerHTML = "";

  const parents = Object.values(categoriesMap).filter((c) => !c.parent_id);
  const children = Object.values(categoriesMap).filter((c) => c.parent_id);

  for (const c of parents) {
    const subs = children.filter((ch) => ch.parent_name === c.name);
    const isCollapsed = collapsedCategoryGroups.has(c.name);

    const li = document.createElement("li");
    li.className = "manage-category-row";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "cat-toggle-btn";
    if (subs.length > 0) {
      toggleBtn.textContent = isCollapsed ? "▸" : "▾";
      toggleBtn.setAttribute("aria-label", isCollapsed ? "하위 카테고리 펼치기" : "하위 카테고리 접기");
      toggleBtn.addEventListener("click", () => {
        if (isCollapsed) {
          collapsedCategoryGroups.delete(c.name);
        } else {
          collapsedCategoryGroups.add(c.name);
        }
        renderManageCategories();
      });
    } else {
      toggleBtn.disabled = true;
    }

    const iconInput = document.createElement("input");
    iconInput.type = "text";
    iconInput.className = "cat-icon-input";
    iconInput.maxLength = 4;
    iconInput.value = c.icon;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "cat-name-input";
    nameInput.value = c.name;

    const groupSelect = document.createElement("select");
    for (const group of groupsCache) {
      const option = document.createElement("option");
      option.value = group.key;
      option.textContent = group.label;
      if (group.key === c.group_key) option.selected = true;
      groupSelect.appendChild(option);
    }

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "cat-save-btn";
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", async () => {
      const res = await fetch(`/api/categories/${encodeURIComponent(c.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          icon: iconInput.value.trim(),
          group_key: groupSelect.value,
          parent_name: null,
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
      if (!confirm(`"${c.name}" 카테고리를 삭제할까요? 이 카테고리를 쓰던 할 일은 카테고리 없음이 됩니다.`)) {
        return;
      }
      await fetch(`/api/categories/${encodeURIComponent(c.name)}`, { method: "DELETE" });
      await loadCategories();
      await fetchTodos();
      renderManageCategories();
    });

    li.append(toggleBtn, iconInput, nameInput, groupSelect, saveBtn, deleteBtn);
    manageCategoriesList.appendChild(li);

    if (isCollapsed) continue;

    for (const sub of subs) {
      const subLi = document.createElement("li");
      subLi.className = "manage-category-row";
      subLi.style.paddingLeft = "1.5rem";

      const subIconInput = document.createElement("input");
      subIconInput.type = "text";
      subIconInput.className = "cat-icon-input";
      subIconInput.maxLength = 4;
      subIconInput.value = sub.icon;

      const subNameInput = document.createElement("input");
      subNameInput.type = "text";
      subNameInput.className = "cat-name-input";
      subNameInput.value = sub.name;

      const subGroupSelect = document.createElement("select");
      for (const group of groupsCache) {
        const option = document.createElement("option");
        option.value = group.key;
        option.textContent = group.label;
        if (group.key === sub.group_key) option.selected = true;
        subGroupSelect.appendChild(option);
      }

      const subSaveBtn = document.createElement("button");
      subSaveBtn.type = "button";
      subSaveBtn.className = "cat-save-btn";
      subSaveBtn.textContent = "저장";
      subSaveBtn.addEventListener("click", async () => {
        const res = await fetch(`/api/categories/${encodeURIComponent(sub.name)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: subNameInput.value.trim(),
            icon: subIconInput.value.trim(),
            group_key: subGroupSelect.value,
            parent_name: c.name,
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

      const subDeleteBtn = document.createElement("button");
      subDeleteBtn.type = "button";
      subDeleteBtn.className = "cat-delete-btn";
      subDeleteBtn.textContent = "삭제";
      subDeleteBtn.addEventListener("click", async () => {
        if (!confirm(`"${sub.name}" 카테고리를 삭제할까요? 이 카테고리를 쓰던 할 일은 카테고리 없음이 됩니다.`)) {
          return;
        }
        await fetch(`/api/categories/${encodeURIComponent(sub.name)}`, { method: "DELETE" });
        await loadCategories();
        await fetchTodos();
        renderManageCategories();
      });

      subLi.append(subIconInput, subNameInput, subGroupSelect, subSaveBtn, subDeleteBtn);
      manageCategoriesList.appendChild(subLi);
    }
  }
}

manageCategoriesClose.addEventListener("click", () => {
  manageCategories.hidden = true;
});

newCategoryCancel.addEventListener("click", () => {
  newCategoryForm.hidden = true;
  newCategoryName.value = "";
  newCategoryIcon.value = "";
  newCategoryParent.value = "";
  categorySelect.value = "";
});

newCategorySave.addEventListener("click", async () => {
  const name = newCategoryName.value.trim();
  if (!name) {
    newCategoryName.focus();
    return;
  }
  const parentName = newCategoryParent.value || null;
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      icon: newCategoryIcon.value.trim(),
      group_key: newCategoryGroup.value,
      parent_name: parentName,
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
  newCategoryParent.value = "";
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
  await renderBalance();
  await checkOverdue();
  setInterval(checkOverdue, 60000);
})();
