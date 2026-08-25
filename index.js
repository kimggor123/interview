(function () {
  const STORAGE_KEY = "interviewQnA.items.v1";
  const THEME_KEY = "interviewQnA.theme.v1";

  let items = loadItems();
  const revealedIds = new Set();
  let editingId = null;
  let confirming = null; // { id, timeout }

  const listEl = document.getElementById("list");
  const emptyState = document.getElementById("emptyState");
  const countLabel = document.getElementById("countLabel");
  const toggleAllBtn = document.getElementById("toggleAllBtn");
  const themeBtn = document.getElementById("themeBtn");
  const addBtn = document.getElementById("addBtn");
  const emptyAddBtn = document.getElementById("emptyAddBtn");

  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const qInput = document.getElementById("qInput");
  const aInput = document.getElementById("aInput");
  const saveBtn = document.getElementById("saveBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function render() {
    listEl.innerHTML = "";
    countLabel.textContent = `총 ${items.length}개 질문`;
    const hasItems = items.length > 0;
    emptyState.hidden = hasItems;
    toggleAllBtn.hidden = !hasItems;
    items.forEach((item, idx) => listEl.appendChild(buildCard(item, idx)));
    updateToggleAllLabel();
  }

  function buildCard(item, idx) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = item.id;
    if (revealedIds.has(item.id)) card.classList.add("revealed");

    const rings = document.createElement("div");
    rings.className = "card-rings";

    const body = document.createElement("div");

    const header = document.createElement("div");
    header.className = "card-header";

    const number = document.createElement("span");
    number.className = "card-number";
    number.textContent = String(idx + 1).padStart(2, "0");

    const qText = document.createElement("h3");
    qText.className = "question-text";
    qText.textContent = item.q;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "수정";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", () => openModal(item));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = "삭제";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () =>
      handleDeleteClick(item.id, deleteBtn),
    );

    actions.append(editBtn, deleteBtn);
    header.append(number, qText, actions);

    const revealBtn = document.createElement("button");
    revealBtn.className = "reveal-btn";
    revealBtn.textContent = revealedIds.has(item.id)
      ? "🙈 답변 숨기기"
      : "👁 정답 보기";
    revealBtn.addEventListener("click", () =>
      toggleReveal(item.id, card, revealBtn),
    );

    const answerWrap = document.createElement("div");
    answerWrap.className = "answer-wrap";
    const answerInner = document.createElement("div");
    answerInner.className = "answer-inner";
    const answerBody = document.createElement("p");
    answerBody.className = "answer-body";
    answerBody.textContent = item.a;
    answerInner.appendChild(answerBody);
    answerWrap.appendChild(answerInner);

    body.append(header, revealBtn, answerWrap);
    card.append(rings, body);
    return card;
  }

  function toggleReveal(id, cardEl, btnEl) {
    const isRevealed = revealedIds.has(id);
    if (isRevealed) {
      revealedIds.delete(id);
      cardEl.classList.remove("revealed");
      btnEl.textContent = "👁 정답 보기";
    } else {
      revealedIds.add(id);
      cardEl.classList.add("revealed");
      btnEl.textContent = "🙈 답변 숨기기";
    }
    updateToggleAllLabel();
  }

  function updateToggleAllLabel() {
    const anyHidden = items.some((it) => !revealedIds.has(it.id));
    toggleAllBtn.textContent = anyHidden ? "전체 보기" : "전체 숨기기";
  }

  toggleAllBtn.addEventListener("click", () => {
    const anyHidden = items.some((it) => !revealedIds.has(it.id));
    document.querySelectorAll(".card").forEach((cardEl) => {
      const id = cardEl.dataset.id;
      const btnEl = cardEl.querySelector(".reveal-btn");
      if (anyHidden) {
        revealedIds.add(id);
        cardEl.classList.add("revealed");
        btnEl.textContent = "🙈 답변 숨기기";
      } else {
        revealedIds.delete(id);
        cardEl.classList.remove("revealed");
        btnEl.textContent = "👁 정답 보기";
      }
    });
    updateToggleAllLabel();
  });

  function handleDeleteClick(id, btnEl) {
    if (confirming && confirming.id === id) {
      clearTimeout(confirming.timeout);
      confirming = null;
      items = items.filter((it) => it.id !== id);
      revealedIds.delete(id);
      saveItems();
      render();
      return;
    }
    if (confirming) {
      resetDeleteBtn(confirming.id);
      clearTimeout(confirming.timeout);
    }
    btnEl.textContent = "정말 삭제?";
    btnEl.classList.add("danger-confirm");
    const timeout = setTimeout(() => {
      resetDeleteBtn(id);
      confirming = null;
    }, 3000);
    confirming = { id, timeout };
  }
  function resetDeleteBtn(id) {
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (!card) return;
    const btn = card.querySelectorAll(".icon-btn")[1];
    if (btn) {
      btn.textContent = "🗑";
      btn.classList.remove("danger-confirm");
    }
  }

  function openModal(item) {
    editingId = item ? item.id : null;
    modalTitle.textContent = item ? "질문 수정" : "질문 추가";
    qInput.value = item ? item.q : "";
    aInput.value = item ? item.a : "";
    modalOverlay.hidden = false;
    document.body.classList.add("modal-open");
    qInput.focus();
  }
  function closeModal() {
    modalOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    editingId = null;
    qInput.value = "";
    aInput.value = "";
  }

  addBtn.addEventListener("click", () => openModal(null));
  emptyAddBtn.addEventListener("click", () => openModal(null));
  cancelBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !modalOverlay.hidden)
      saveBtn.click();
  });

  saveBtn.addEventListener("click", () => {
    const q = qInput.value.trim();
    const a = aInput.value.trim();
    if (!q || !a) {
      alert("질문과 답변을 모두 입력해주세요.");
      return;
    }
    if (editingId) {
      const it = items.find((x) => x.id === editingId);
      if (it) {
        it.q = q;
        it.a = a;
      }
    } else {
      items.push({ id: uid(), q, a });
    }
    saveItems();
    closeModal();
    render();
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem(THEME_KEY, theme);
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
      return;
    }
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
  themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  initTheme();
  render();
})();
