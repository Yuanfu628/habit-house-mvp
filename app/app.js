const STORAGE_KEY = "habit-house-mvp";
const REVIEW_OPTIONS = ["时间", "精力", "情绪", "环境", "其他"];
const REMINDER_TEMPLATES = [
  "你今天卡在哪？",
  "要不要先完成⭐，别断节奏？",
  "我今天完成了，一起加一块砖？",
];

const el = (id) => document.getElementById(id);

const state = loadState();
normalizeState();
debugLog("app.js loaded");
bindEvents();
renderAll();
handleHashChange();
window.addEventListener("hashchange", handleHashChange);
window.addEventListener("error", (event) => {
  console.error("[runtime] error", event.error || event.message);
});

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultState();
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return createDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createDefaultState() {
  return {
    loggedIn: false,
    team: {
      joined: false,
      code: null,
      members: [],
      skipped: false,
    },
    habit: {
      name: "未命名习惯",
      levels: {
        star1: "⭐ 10分钟",
        star2: "⭐⭐ 2km",
        star3: "⭐⭐⭐ 5km",
      },
      paused: false,
      archiveCount: 0,
    },
    house: {
      bricks: 0,
    },
    daily: newDailyRecord(todayString()),
    history: [],
    ui: {
      activeTab: "home",
      reminderTarget: null,
    },
  };
}

function newDailyRecord(date) {
  return {
    date,
    status: null,
    delta: 0,
    undoUsed: false,
    review: null,
    reviewSkipped: false,
    reminderSentTo: [],
  };
}

function normalizeState() {
  if (!state.daily) {
    state.daily = newDailyRecord(todayString());
  }
  if (!state.ui) {
    state.ui = { activeTab: "home", reminderTarget: null };
  }
  const today = todayString();
  if (state.daily.date !== today) {
    archiveDaily();
    state.daily = newDailyRecord(today);
  }
  if (!state.team.members || state.team.members.length === 0) {
    state.team.members = [
      { id: "me", name: "我" },
      { id: "mate1", name: "队友A" },
      { id: "mate2", name: "队友B" },
      { id: "mate3", name: "队友C" },
    ];
  }
}

function archiveDaily() {
  if (state.daily && state.daily.date) {
    const existing = state.history.find(
      (item) => item.date === state.daily.date
    );
    if (!existing && state.daily.status) {
      state.history.push({
        date: state.daily.date,
        status: state.daily.status,
        delta: state.daily.delta,
        review: state.daily.review,
      });
    }
  }
}

function bindEvents() {
  el("btnLogin").addEventListener("click", () => {
    debugLog("login email clicked");
    handleLoginEmail();
  });
  el("btnLoginAlt").addEventListener("click", () => {
    debugLog("login alt clicked");
    handleLoginAlt();
  });

  el("btnCreateTeam").addEventListener("click", () => {
    state.team.joined = true;
    state.team.skipped = false;
    state.team.code = generateInviteCode();
    saveState();
    el("teamCodeCreated").textContent = `邀请码：${state.team.code}（已复制）`;
    copyToClipboard(state.team.code);
    showMain();
  });

  el("btnJoinTeam").addEventListener("click", () => {
    const code = el("inviteCode").value.trim().toUpperCase();
    if (code.length !== 6) {
      el("teamJoinResult").textContent = "邀请码需为 6 位";
      return;
    }
    state.team.joined = true;
    state.team.skipped = false;
    state.team.code = code;
    el("teamJoinResult").textContent = "加入成功";
    saveState();
    showMain();
  });

  el("btnSkipTeam").addEventListener("click", () => {
    debugLog("skip team clicked");
    handleSkipTeam();
  });

  el("btnAuthClose").addEventListener("click", closeAuthModal);
  el("btnAuthSubmit").addEventListener("click", () => {
    debugLog("auth submit clicked");
    showToast("TODO: Auth");
  });
  el("authModal").addEventListener("click", (event) => {
    if (event.target.id === "authModal") {
      closeAuthModal();
    }
  });

  el("btnUndo").addEventListener("click", undoSelection);
  el("btnEditHabit").addEventListener("click", () => switchTab("settings"));

  el("btnPauseHabit").addEventListener("click", togglePauseHabit);
  el("btnRebuildHouse").addEventListener("click", rebuildHouse);
  el("btnCopyInvite").addEventListener("click", () => {
    if (!state.team.code) {
      return;
    }
    copyToClipboard(state.team.code);
  });
  el("btnLeaveTeam").addEventListener("click", () => {
    state.team.joined = false;
    state.team.code = null;
    state.team.skipped = true;
    saveState();
    renderAll();
  });

  el("habitName").addEventListener("input", (event) => {
    state.habit.name = event.target.value.trim() || "未命名习惯";
    saveState();
    renderHome();
  });
  el("level1").addEventListener("input", (event) => {
    state.habit.levels.star1 = event.target.value.trim();
    saveState();
  });
  el("level2").addEventListener("input", (event) => {
    state.habit.levels.star2 = event.target.value.trim();
    saveState();
  });
  el("level3").addEventListener("input", (event) => {
    state.habit.levels.star3 = event.target.value.trim();
    saveState();
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });

  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  el("btnSkipReview").addEventListener("click", () => {
    state.daily.reviewSkipped = true;
    saveState();
    renderReview();
  });

  el("btnModalSkip").addEventListener("click", () => {
    debugLog("review modal skip clicked");
    state.daily.reviewSkipped = true;
    closeModal();
    saveState();
    renderReview();
  });

  el("modalOptions").addEventListener("click", (event) => {
    const reviewButton = event.target.closest("[data-review]");
    if (reviewButton) {
      state.daily.review = reviewButton.dataset.review;
      closeModal();
      saveState();
      renderReview();
    }
  });

  el("modal").addEventListener("click", (event) => {
    const reviewButton = event.target.closest("[data-review]");
    if (reviewButton) {
      state.daily.review = reviewButton.dataset.review;
      closeModal();
      saveState();
      renderReview();
      return;
    }
    if (event.target.id === "modal") {
      closeModal();
    }
  });
}

function showScreen(screen) {
  ["screenWelcome", "screenTeam", "screenMain"].forEach((id) =>
    el(id).classList.add("hidden")
  );
  if (screen !== "main") {
    closeModal();
  }
  if (screen === "welcome") {
    el("screenWelcome").classList.remove("hidden");
  }
  if (screen === "team") {
    el("screenTeam").classList.remove("hidden");
  }
  if (screen === "main") {
    el("screenMain").classList.remove("hidden");
  }
}

function showMain() {
  el("tabBar").classList.remove("hidden");
  showScreen("main");
  switchTab("home");
}

function renderAll() {
  if (!state.loggedIn) {
    showScreen("welcome");
    el("tabBar").classList.add("hidden");
    closeModal();
    return;
  }
  if (!state.team.joined && !state.team.code && !state.team.skipped) {
    showScreen("team");
    el("tabBar").classList.add("hidden");
    closeModal();
    return;
  }
  showMain();
  renderHome();
  renderCircle();
  renderReview();
  renderSettings();
  closeModal();
}

function switchTab(tab) {
  state.ui.activeTab = tab;
  ["home", "circle", "review", "settings"].forEach((name) => {
    el(`tab${capitalize(name)}`).classList.toggle("hidden", name !== tab);
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  saveState();
  renderTopbar();
}

function renderTopbar() {
  const status = state.daily.status;
  let statusText = "未选择";
  if (status === "stop") {
    statusText = "停工";
  } else if (status) {
    statusText = "已完成";
  }
  el("topbarStatus").textContent = `${todayString()} · ${statusText}`;
}

function renderHome() {
  renderTopbar();
  el("btnEditHabit").textContent = state.habit.name;
  el("todayMeta").textContent = todayStatusLabel();
  el("bricksCount").textContent = `${state.house.bricks} / 30`;
  el("weeklyStop").textContent = `${countWeeklyStops()} 天`;

  renderHouseGrid();
  renderHomeFeedback();

  const showBanner = !state.team.joined;
  el("bannerJoinTeam").classList.toggle("hidden", !showBanner);

  const slowdown = shouldSuggestSlowdown();
  el("slowdownHint").classList.toggle("hidden", !slowdown);
}

function renderHouseGrid() {
  const grid = el("houseGrid");
  grid.innerHTML = "";
  for (let i = 0; i < 30; i += 1) {
    const brick = document.createElement("div");
    brick.className = "brick";
    if (i < state.house.bricks) {
      brick.classList.add("filled");
    }
    grid.appendChild(brick);
  }
}

function renderHomeFeedback() {
  const feedback = el("todayFeedback");
  const undoButton = el("btnUndo");
  if (!state.daily.status) {
    feedback.textContent = "今天还未选择状态";
    undoButton.classList.add("hidden");
    return;
  }
  if (state.daily.status === "stop") {
    feedback.textContent = "今天停工，不会清零。明天继续。";
  } else {
    feedback.textContent = `已完成，新增 ${state.daily.delta} 块砖。`;
  }
  if (state.daily.undoUsed || !state.daily.status) {
    undoButton.classList.add("hidden");
  } else {
    undoButton.classList.remove("hidden");
  }
}

function handleAction(action) {
  if (state.habit.paused) {
    el("todayFeedback").textContent = "习惯已暂停，恢复后再打卡。";
    return;
  }
  if (state.daily.status) {
    el("todayFeedback").textContent = "今天已选择状态，可撤销后重选。";
    return;
  }
  debugLog(`home action: ${action}`);
  let delta = 0;
  let status = action;
  if (action === "star1") delta = 1;
  if (action === "star2") delta = 2;
  if (action === "star3") delta = 3;
  if (action === "stop") delta = 0;

  state.daily.status = status;
  state.daily.delta = delta;
  state.house.bricks = Math.min(30, state.house.bricks + delta);
  saveState();
  renderHome();
  renderReview();
  renderCircle();

  if (status !== "stop" && !state.daily.review && !state.daily.reviewSkipped) {
    openModal();
  }
}

function undoSelection() {
  if (!state.daily.status || state.daily.undoUsed) {
    return;
  }
  state.house.bricks = Math.max(0, state.house.bricks - state.daily.delta);
  state.daily.status = null;
  state.daily.delta = 0;
  state.daily.undoUsed = true;
  saveState();
  renderHome();
  renderReview();
  renderCircle();
}

function renderCircle() {
  const members = el("circleMembers");
  members.innerHTML = "";
  state.team.members.forEach((member) => {
    const card = document.createElement("div");
    card.className = "member-card";
    const status = member.id === "me" ? state.daily.status : null;
    const statusLabel = statusBadge(status);
    card.innerHTML = `
      <div class="row space">
        <strong>${member.name}</strong>
        <span class="status-pill ${statusLabel.className}">${statusLabel.text}</span>
      </div>
      <div class="muted">已建砖数：${member.id === "me" ? state.house.bricks : 0}</div>
    `;
    members.appendChild(card);
  });

  renderReminderArea();
}

function renderReminderArea() {
  const area = el("reminderArea");
  area.innerHTML = "";
  const canSend = state.daily.reminderSentTo.length < 1;
  state.team.members
    .filter((member) => member.id !== "me")
    .forEach((member) => {
      const card = document.createElement("div");
      card.className = "member-card";
      const hasSent = state.daily.reminderSentTo.includes(member.id);
      const disabled = hasSent || !canSend;
      card.innerHTML = `
        <div class="row space">
          <strong>${member.name}</strong>
          <span class="status-pill status-none">未打卡</span>
        </div>
        <button class="ghost" data-remind="${member.id}" ${
        disabled ? "disabled" : ""
      }>发一句提醒</button>
        <div class="reminder-templates"></div>
      `;
      area.appendChild(card);
    });

  area.querySelectorAll("[data-remind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.ui.reminderTarget = btn.dataset.remind;
      renderReminderArea();
    });
  });

  if (state.ui.reminderTarget) {
    const targetCard = area.querySelector(
      `[data-remind="${state.ui.reminderTarget}"]`
    );
    if (targetCard) {
      const container = targetCard.parentElement.querySelector(
        ".reminder-templates"
      );
      REMINDER_TEMPLATES.forEach((text) => {
        const btn = document.createElement("button");
        btn.className = "ghost";
        btn.textContent = text;
        btn.addEventListener("click", () => sendReminder(text));
        container.appendChild(btn);
      });
    }
  }
}

function sendReminder(template) {
  const target = state.ui.reminderTarget;
  if (!target) return;
  if (state.daily.reminderSentTo.includes(target)) return;
  if (state.daily.reminderSentTo.length >= 1) return;
  state.daily.reminderSentTo.push(target);
  state.ui.reminderTarget = null;
  saveState();
  renderReminderArea();
}

function renderReview() {
  const container = el("reviewOptions");
  container.innerHTML = "";
  REVIEW_OPTIONS.forEach((option) => {
    const btn = document.createElement("button");
    btn.className = state.daily.review === option ? "primary" : "ghost";
    btn.textContent = option;
    btn.addEventListener("click", () => {
      if (!state.daily.status) {
        return;
      }
      state.daily.review = option;
      saveState();
      renderReview();
    });
    container.appendChild(btn);
  });

  if (!state.daily.status) {
    el("reviewStatus").textContent = "今天还未打卡，复盘将在完成后出现。";
  } else if (state.daily.review) {
    el("reviewStatus").textContent = `已选择：${state.daily.review}`;
  } else if (state.daily.reviewSkipped) {
    el("reviewStatus").textContent = "已跳过";
  } else {
    el("reviewStatus").textContent = "请选择一个阻碍原因";
  }

  el("weeklyTop").textContent = weeklyTopReason() || "暂无";
}

function renderSettings() {
  el("habitName").value = state.habit.name;
  el("level1").value = state.habit.levels.star1;
  el("level2").value = state.habit.levels.star2;
  el("level3").value = state.habit.levels.star3;
  el("btnPauseHabit").textContent = state.habit.paused ? "恢复习惯" : "暂停习惯";
  el("teamInfo").textContent = state.team.code
    ? `邀请码：${state.team.code}`
    : "未加入小队";
}

function openModal() {
  const modal = el("modal");
  const options = el("modalOptions");
  options.innerHTML = "";
  REVIEW_OPTIONS.forEach((option) => {
    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = option;
    btn.dataset.review = option;
    btn.addEventListener("click", () => {
      state.daily.review = option;
      closeModal();
      saveState();
      renderReview();
    });
    options.appendChild(btn);
  });
  modal.classList.remove("hidden");
}

function closeModal() {
  el("modal").classList.add("hidden");
}

function openAuthModal() {
  el("authModal").classList.remove("hidden");
}

function closeAuthModal() {
  el("authModal").classList.add("hidden");
}

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2000);
}

function togglePauseHabit() {
  state.habit.paused = !state.habit.paused;
  saveState();
  renderSettings();
  renderHome();
}

function rebuildHouse() {
  state.habit.archiveCount += 1;
  state.house.bricks = 0;
  saveState();
  renderHome();
}

function todayStatusLabel() {
  if (!state.daily.status) return "未选择";
  if (state.daily.status === "stop") return "停工";
  return "已完成";
}

function countWeeklyStops() {
  const cutoff = dateOffset(-6);
  const records = [...state.history, state.daily].filter((record) => {
    if (!record || !record.date) return false;
    return new Date(record.date) >= cutoff;
  });
  return records.filter((record) => record.status === "stop").length;
}

function weeklyTopReason() {
  const cutoff = dateOffset(-6);
  const reasonCounts = {};
  const records = [...state.history, state.daily].filter((record) => {
    if (!record || !record.date) return false;
    return new Date(record.date) >= cutoff;
  });
  records.forEach((record) => {
    if (record.review) {
      reasonCounts[record.review] = (reasonCounts[record.review] || 0) + 1;
    }
  });
  let top = null;
  let max = 0;
  Object.keys(reasonCounts).forEach((reason) => {
    if (reasonCounts[reason] > max) {
      max = reasonCounts[reason];
      top = reason;
    }
  });
  return top;
}

function shouldSuggestSlowdown() {
  const yesterday = dateOffset(-1);
  const dayBefore = dateOffset(-2);
  const record1 = state.history.find(
    (item) => item.date === toDateString(yesterday)
  );
  const record2 = state.history.find(
    (item) => item.date === toDateString(dayBefore)
  );
  return (
    record1 &&
    record2 &&
    record1.status === "stop" &&
    record2.status === "stop"
  );
}

function statusBadge(status) {
  if (status === "stop") {
    return { text: "停工", className: "status-stop" };
  }
  if (status) {
    return { text: "已完成", className: "status-done" };
  }
  return { text: "未打卡", className: "status-none" };
}

function todayString() {
  return toDateString(new Date());
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function copyToClipboard(text) {
  if (!navigator.clipboard) {
    return;
  }
  navigator.clipboard.writeText(text);
}

function handleHashChange() {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;
  debugLog(`route hash: ${hash}`);
  if (hash === "oauth") {
    showToast("即将支持 Apple/Google 登录");
    return;
  }
  if (["home", "circle", "review", "settings"].includes(hash)) {
    state.loggedIn = true;
    if (!state.team.joined) {
      state.team.skipped = true;
    }
    saveState();
    showMain();
    switchTab(hash);
    renderHome();
    renderCircle();
    renderReview();
    renderSettings();
  }
}

function debugLog(message) {
  console.log("[debug]", message);
  if (window.hhDebug) {
    window.hhDebug(message);
  }
}

function handleLoginEmail() {
  state.loggedIn = true;
  saveState();
  openAuthModal();
}

function handleLoginAlt() {
  state.loggedIn = true;
  saveState();
  location.hash = "#oauth";
  showToast("即将支持 Apple/Google 登录");
}

function handleSkipTeam() {
  state.team.joined = false;
  state.team.skipped = true;
  saveState();
  showToast("已跳过");
  location.hash = "#home";
  showMain();
}

window.hhActions = {
  loginEmail: handleLoginEmail,
  loginAlt: handleLoginAlt,
  skipTeam: handleSkipTeam,
};
