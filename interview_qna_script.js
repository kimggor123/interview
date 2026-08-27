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
  const keywordsInput = document.getElementById("keywordsInput");
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
        if (!Array.isArray(it.keywords)) it.keywords = [];
        it.followups.forEach((fu) => {
          if (!Array.isArray(fu.keywords)) fu.keywords = [];
        });
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

    const testSection = buildTestSection(item);

    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.append(revealBtn, testSection.toggleBtn);

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

    body.append(
      header,
      actionRow,
      answerWrap,
      testSection.panelOuter,
      followupsSection,
    );
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

    const testSection = buildTestSection(fu);

    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.append(revealBtn, testSection.toggleBtn);

    const answerWrap = document.createElement("div");
    answerWrap.className = "answer-wrap";
    const answerInner = document.createElement("div");
    answerInner.className = "answer-inner";
    const answerBody = document.createElement("p");
    answerBody.className = "answer-body";
    answerBody.textContent = fu.a;
    answerInner.appendChild(answerBody);
    answerWrap.appendChild(answerInner);

    row.append(header, actionRow, answerWrap, testSection.panelOuter);
    return row;
  }

  function buildTestSection(item) {
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "test-toggle-btn";
    toggleBtn.textContent = "✏️ 암기 테스트";

    const panelOuter = document.createElement("div");
    panelOuter.className = "test-panel-outer";
    const panelInner = document.createElement("div");
    panelInner.className = "test-panel-inner";
    const panelContent = document.createElement("div");
    panelContent.className = "test-panel-content";

    const textarea = document.createElement("textarea");
    textarea.className = "test-input";
    textarea.name = `test-answer-${item.id}`;
    textarea.autocomplete = "off";
    textarea.rows = 4;
    textarea.placeholder = "정답을 보지 말고, 기억나는 대로 답변을 적어보세요";

    const gradeBtn = document.createElement("button");
    gradeBtn.className = "test-grade-btn";
    gradeBtn.textContent = "채점하기";

    const resultBox = document.createElement("div");
    resultBox.className = "test-result";
    resultBox.hidden = true;

    function grade() {
      const userText = textarea.value.trim();
      if (!userText) {
        textarea.focus();
        return;
      }
      const { percent, missing, missingKeywords } = compareAnswers(
        userText,
        item.a,
        item.keywords,
      );
      renderTestResult(resultBox, percent, missing, missingKeywords);
    }
    gradeBtn.addEventListener("click", grade);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) grade();
    });

    panelContent.append(textarea, gradeBtn, resultBox);
    panelInner.appendChild(panelContent);
    panelOuter.appendChild(panelInner);

    toggleBtn.addEventListener("click", () => {
      const isOpen = panelOuter.classList.toggle("open");
      toggleBtn.classList.toggle("active", isOpen);
      toggleBtn.textContent = isOpen ? "✏️ 테스트 닫기" : "✏️ 암기 테스트";
      if (isOpen) textarea.focus();
    });

    return { toggleBtn, panelOuter };
  }

  // 흔히 쓰이는 조사/어미를 길이가 긴 것부터 우선 매칭하도록 정렬해둔다.
  const SUFFIXES = [
    "이라고는",
    "에서부터",
    "으로부터",
    "에게서는",
    "으로써는",
    "스럽습니다",
    "했습니다",
    "합니다",
    "됩니다",
    "입니다",
    "였습니다",
    "에게서",
    "으로써",
    "이라는",
    "이지만",
    "인데도",
    "하지만",
    "으로는",
    "에서는",
    "에서도",
    "에게는",
    "에게도",
    "이라고",
    "했다",
    "한다",
    "된다",
    "이다",
    "였다",
    "하며",
    "되며",
    "이며",
    "하고",
    "되고",
    "이고",
    "하는",
    "되는",
    "했던",
    "했음",
    "했고",
    "으로",
    "에서",
    "에게",
    "한테",
    "까지",
    "부터",
    "마다",
    "보다",
    "처럼",
    "같이",
    "조차",
    "마저",
    "밖에",
    "만큼",
    "대로",
    "이나",
    "이랑",
    "다",
    "음",
    "함",
    "됨",
    "임",
    "고",
    "며",
    "나",
    "랑",
    "과",
    "와",
    "의",
    "도",
    "만",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "로",
    "야",
  ].sort((a, b) => b.length - a.length);

  function stripSuffix(token) {
    if (!token || token.length <= 1) return token;
    for (const suf of SUFFIXES) {
      if (token.length > suf.length && token.endsWith(suf)) {
        const stem = token.slice(0, token.length - suf.length);
        if (stem.length >= 1) return stem;
      }
    }
    return token;
  }

  function normalizeTokens(text) {
    return text
      .replace(/[.,!?~"'“”‘’()\[\]{}·:;\-_/\\]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map(stripSuffix);
  }

  // 문자 2-gram 기반 Dice 계수: 형태가 살짝 달라도(오탈자, 못 벗겨낸 어미 등) 부분적으로 점수를 인정한다.
  function getBigrams(str) {
    if (str.length < 2) return [str];
    const grams = [];
    for (let i = 0; i < str.length - 1; i++) grams.push(str.slice(i, i + 2));
    return grams;
  }
  function diceSimilarity(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const gramsA = getBigrams(a);
    const gramsB = getBigrams(b);
    const countB = {};
    gramsB.forEach((g) => {
      countB[g] = (countB[g] || 0) + 1;
    });
    let overlap = 0;
    gramsA.forEach((g) => {
      if (countB[g] > 0) {
        overlap++;
        countB[g]--;
      }
    });
    return (2 * overlap) / (gramsA.length + gramsB.length);
  }

  const SOFT_MATCH_THRESHOLD = 0.5; // 이 값 이상 유사하면 "맞춘 단어"로 인정
  const KEYWORD_MATCH_THRESHOLD = 0.7; // 키워드 판별은 조금 더 엄격하게
  const KEYWORD_WEIGHT = 3; // 핵심 키워드는 일반 단어보다 3배 비중

  function compareAnswers(userText, answerText, keywords) {
    const userTokens = normalizeTokens(userText);
    const answerTokens = normalizeTokens(answerText);
    if (answerTokens.length === 0)
      return { percent: 0, missing: [], missingKeywords: [] };

    const keywordStems = (keywords || [])
      .map((k) => stripSuffix(k.trim()))
      .filter(Boolean);

    let weightedScore = 0;
    let weightTotal = 0;
    const missing = [];
    const missingKeywords = [];

    answerTokens.forEach((ansTok) => {
      let best = 0;
      userTokens.forEach((userTok) => {
        const sim = diceSimilarity(ansTok, userTok);
        if (sim > best) best = sim;
      });

      const isKeyword = keywordStems.some(
        (k) => diceSimilarity(k, ansTok) >= KEYWORD_MATCH_THRESHOLD,
      );
      const weight = isKeyword ? KEYWORD_WEIGHT : 1;

      weightedScore += best * weight;
      weightTotal += weight;

      if (best < SOFT_MATCH_THRESHOLD) {
        missing.push(ansTok);
        if (isKeyword) missingKeywords.push(ansTok);
      }
    });

    const percent =
      weightTotal > 0 ? Math.round((weightedScore / weightTotal) * 100) : 0;
    const dedupe = (arr) => {
      const seen = new Set();
      return arr.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
    };

    return {
      percent,
      missing: dedupe(missing),
      missingKeywords: dedupe(missingKeywords),
    };
  }

  function renderTestResult(box, percent, missing, missingKeywords) {
    box.hidden = false;
    box.innerHTML = "";

    const percentLabel = document.createElement("div");
    percentLabel.className = "test-percent";
    percentLabel.textContent = `일치율 ${percent}%`;

    const barTrack = document.createElement("div");
    barTrack.className = "test-bar-track";
    const barFill = document.createElement("div");
    barFill.className = "test-bar-fill";
    barFill.style.width = percent + "%";
    barFill.classList.add(
      percent >= 80 ? "great" : percent >= 50 ? "okay" : "low",
    );
    barTrack.appendChild(barFill);

    box.append(percentLabel, barTrack);

    if (missingKeywords && missingKeywords.length > 0) {
      const kwBox = document.createElement("div");
      kwBox.className = "test-missing test-missing-keywords";
      const label = document.createElement("span");
      label.className = "test-missing-label";
      label.textContent = "⚠ 핵심 키워드 누락: ";
      const words = document.createElement("span");
      words.className = "test-missing-words";
      words.textContent = missingKeywords.join(", ");
      kwBox.append(label, words);
      box.appendChild(kwBox);
    }

    const restMissing = missingKeywords
      ? missing.filter((t) => !missingKeywords.includes(t))
      : missing;
    if (restMissing.length > 0) {
      const missingBox = document.createElement("div");
      missingBox.className = "test-missing";
      const label = document.createElement("span");
      label.className = "test-missing-label";
      label.textContent = "놓친 단어: ";
      const words = document.createElement("span");
      words.className = "test-missing-words";
      const shown = restMissing.slice(0, 20);
      words.textContent =
        shown.join(", ") +
        (restMissing.length > shown.length
          ? ` 외 ${restMissing.length - shown.length}개`
          : "");
      missingBox.append(label, words);
      box.appendChild(missingBox);
    }

    if (
      (!missingKeywords || missingKeywords.length === 0) &&
      restMissing.length === 0
    ) {
      const perfect = document.createElement("div");
      perfect.className = "test-perfect";
      perfect.textContent = "핵심 단어를 모두 포함했어요! 🎉";
      box.appendChild(perfect);
    }
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
    keywordsInput.value = item && item.keywords ? item.keywords.join(", ") : "";
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
    keywordsInput.value = "";
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
    const keywords = keywordsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
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
          it.keywords = keywords;
        }
      } else {
        items.push({ id: uid(), q, a, category, followups: [], keywords });
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
            fu.keywords = keywords;
          }
        } else {
          parent.followups.push({ id: uid(), q, a, keywords });
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
