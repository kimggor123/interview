(function () {
  const STORAGE_KEY = "interviewQnA.items.v1";
  const THEME_KEY = "interviewQnA.theme.v1";

  let items = loadItems();
  const revealedIds = new Set();
  let editingId = null;
  let confirming = null; // { id, btnEl, timeout }
  let activeTab = "common";
  let modalMode = "main"; // 'main' | 'followup'
  let modalParentId = null;
  const CATEGORY_LABELS = { common: "공통질문", major: "전공질문" };

  const listEl = document.getElementById("list");
  const emptyState = document.getElementById("emptyState");
  const countLabel = document.getElementById("countLabel");
  const toggleAllBtn = document.getElementById("toggleAllBtn");
  const themeBtn = document.getElementById("themeBtn");
  const addBtn = document.getElementById("addBtn");
  const emptyAddBtn = document.getElementById("emptyAddBtn");

  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const catField = document.getElementById("catField");
  const catInput = document.getElementById("catInput");
  const qInput = document.getElementById("qInput");
  const aInput = document.getElementById("aInput");
  const saveBtn = document.getElementById("saveBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const commonCount = document.getElementById("commonCount");
  const majorCount = document.getElementById("majorCount");

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      list.forEach((it) => {
        if (it.category !== "common" && it.category !== "major")
          it.category = "common";
        if (!Array.isArray(it.followups)) it.followups = [];
      });
      return list;
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

  function getVisibleItems() {
    return items.filter((it) => it.category === activeTab);
  }

  function render() {
    listEl.innerHTML = "";
    const visible = getVisibleItems();
    countLabel.textContent = `${CATEGORY_LABELS[activeTab]} 총 ${visible.length}개`;
    commonCount.textContent = items.filter(
      (it) => it.category === "common",
    ).length;
    majorCount.textContent = items.filter(
      (it) => it.category === "major",
    ).length;
    const hasItems = visible.length > 0;
    emptyState.hidden = hasItems;
    emptyState.querySelector("p").textContent =
      `아직 등록된 ${CATEGORY_LABELS[activeTab]}이 없어요. 첫 질문을 추가해보세요.`;
    toggleAllBtn.hidden = !hasItems;
    visible.forEach((item, idx) => listEl.appendChild(buildCard(item, idx)));
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
    editBtn.addEventListener("click", () => openModal({ mode: "main", item }));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = "삭제";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () =>
      handleDeleteClick(item.id, deleteBtn, () => {
        items = items.filter((it) => it.id !== item.id);
        revealedIds.delete(item.id);
        saveItems();
        render();
      }),
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

    const followupsSection = buildFollowupsSection(item);

    body.append(header, revealBtn, answerWrap, followupsSection);
    card.append(rings, body);
    return card;
  }

  function buildFollowupsSection(item) {
    const section = document.createElement("div");
    section.className = "followups";

    const followupsHeader = document.createElement("div");
    followupsHeader.className = "followups-header";

    const title = document.createElement("span");
    title.className = "followups-title";
    const followups = item.followups || [];
    title.textContent = `꼬리질문 ${followups.length}개`;

    const addFollowupBtn = document.createElement("button");
    addFollowupBtn.className = "add-followup-btn";
    addFollowupBtn.textContent = "+ 꼬리질문";
    addFollowupBtn.addEventListener("click", () =>
      openModal({ mode: "followup", parentId: item.id }),
    );

    followupsHeader.append(title, addFollowupBtn);
    section.appendChild(followupsHeader);

    followups.forEach((fu, i) =>
      section.appendChild(buildFollowupItem(fu, i, item)),
    );
    return section;
  }

  function buildFollowupItem(fu, idx, parent) {
    const row = document.createElement("div");
    row.className = "followup-item";
    row.dataset.id = fu.id;
    if (revealedIds.has(fu.id)) row.classList.add("revealed");

    const header = document.createElement("div");
    header.className = "followup-header";

    const tag = document.createElement("span");
    tag.className = "followup-tag";
    tag.textContent = `꼬리질문 ${idx + 1}`;

    const qText = document.createElement("p");
    qText.className = "followup-question";
    qText.textContent = fu.q;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "수정";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", () =>
      openModal({ mode: "followup", parentId: parent.id, item: fu }),
    );

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = "삭제";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () =>
      handleDeleteClick(fu.id, deleteBtn, () => {
        parent.followups = (parent.followups || []).filter(
          (f) => f.id !== fu.id,
        );
        revealedIds.delete(fu.id);
        saveItems();
        render();
      }),
    );

    actions.append(editBtn, deleteBtn);
    header.append(tag, qText, actions);

    const revealBtn = document.createElement("button");
    revealBtn.className = "reveal-btn";
    revealBtn.textContent = revealedIds.has(fu.id)
      ? "🙈 답변 숨기기"
      : "👁 정답 보기";
    revealBtn.addEventListener("click", () =>
      toggleReveal(fu.id, row, revealBtn),
    );

    const answerWrap = document.createElement("div");
    answerWrap.className = "answer-wrap";
    const answerInner = document.createElement("div");
    answerInner.className = "answer-inner";
    const answerBody = document.createElement("p");
    answerBody.className = "answer-body";
    answerBody.textContent = fu.a;
    answerInner.appendChild(answerBody);
    answerWrap.appendChild(answerInner);

    row.append(header, revealBtn, answerWrap);
    return row;
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
    const anyHidden = getVisibleItems().some((it) => !revealedIds.has(it.id));
    toggleAllBtn.textContent = anyHidden ? "전체 보기" : "전체 숨기기";
  }

  toggleAllBtn.addEventListener("click", () => {
    const anyHidden = getVisibleItems().some((it) => !revealedIds.has(it.id));
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

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.cat;
      tabBtns.forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      render();
    });
  });

  function handleDeleteClick(id, btnEl, onConfirm) {
    if (confirming && confirming.id === id) {
      clearTimeout(confirming.timeout);
      confirming = null;
      onConfirm();
      return;
    }
    if (confirming) {
      resetDeleteBtn(confirming.btnEl);
      clearTimeout(confirming.timeout);
    }
    btnEl.textContent = "정말 삭제?";
    btnEl.classList.add("danger-confirm");
    const timeout = setTimeout(() => {
      resetDeleteBtn(btnEl);
      confirming = null;
    }, 3000);
    confirming = { id, btnEl, timeout };
  }
  function resetDeleteBtn(btnEl) {
    if (!btnEl) return;
    btnEl.textContent = "🗑";
    btnEl.classList.remove("danger-confirm");
  }

  function openModal(opts) {
    opts = opts || {};
    modalMode = opts.mode || "main";
    modalParentId = opts.parentId || null;
    const item = opts.item || null;
    editingId = item ? item.id : null;

    catField.style.display = modalMode === "main" ? "" : "none";
    if (modalMode === "main") {
      modalTitle.textContent = item ? "질문 수정" : "질문 추가";
      catInput.value = item ? item.category : activeTab;
    } else {
      modalTitle.textContent = item ? "꼬리질문 수정" : "꼬리질문 추가";
    }
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
    modalMode = "main";
    modalParentId = null;
    qInput.value = "";
    aInput.value = "";
  }

  addBtn.addEventListener("click", () => openModal({ mode: "main" }));
  emptyAddBtn.addEventListener("click", () => openModal({ mode: "main" }));
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

    if (modalMode === "main") {
      const category = catInput.value === "major" ? "major" : "common";
      if (editingId) {
        const it = items.find((x) => x.id === editingId);
        if (it) {
          it.q = q;
          it.a = a;
          it.category = category;
        }
      } else {
        items.push({ id: uid(), q, a, category, followups: [] });
      }
    } else {
      const parent = items.find((x) => x.id === modalParentId);
      if (parent) {
        if (!Array.isArray(parent.followups)) parent.followups = [];
        if (editingId) {
          const fu = parent.followups.find((f) => f.id === editingId);
          if (fu) {
            fu.q = q;
            fu.a = a;
          }
        } else {
          parent.followups.push({ id: uid(), q, a });
        }
      }
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
