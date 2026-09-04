(function () {
  const STORAGE_KEY = `interviewQnA.items.v1`;
  const THEME_KEY = "interviewQnA.theme.v1";

  let items = loadItems();
  const revealedIds = new Set();
  let editingId = null;
  let confirming = null; // { id, btnEl, timeout }
  let activeTab = "common";
  let keywordSubFilter = "all"; // 'all' | 'common' | 'major' — 키워드 탭 안에서의 하위 필터
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
  const importBtn = document.getElementById("importBtn");
  const importOverlay = document.getElementById("importOverlay");
  const importCatInput = document.getElementById("importCatInput");
  const importInput = document.getElementById("importInput");
  const importPreview = document.getElementById("importPreview");
  const importCancelBtn = document.getElementById("importCancelBtn");
  const importConfirmBtn = document.getElementById("importConfirmBtn");

  const backupBtn = document.getElementById("backupBtn");
  const backupOverlay = document.getElementById("backupOverlay");
  const backupCloseBtn = document.getElementById("backupCloseBtn");
  const exportBtn = document.getElementById("exportBtn");
  const backupFileInput = document.getElementById("backupFileInput");
  const importMergeCheckbox = document.getElementById("importMergeCheckbox");
  const syncIndicator = document.getElementById("syncIndicator");
  const syncStatusText = document.getElementById("syncStatusText");
  const firebaseConfigInput = document.getElementById("firebaseConfigInput");
  const syncCodeInput = document.getElementById("syncCodeInput");
  const generateCodeBtn = document.getElementById("generateCodeBtn");
  const connectSyncBtn = document.getElementById("connectSyncBtn");
  const disconnectSyncBtn = document.getElementById("disconnectSyncBtn");

  const SYNC_CONFIG_KEY = "interviewQnA.syncConfig.v1";
  let syncDocRef = null;
  let syncUnsubscribe = null;
  let applyingRemoteUpdate = false; // 원격에서 받은 데이터를 반영하는 동안, 되돌려 push하지 않도록 막는 플래그

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
  const keywordTabCount = document.getElementById("keywordTabCount");
  const keywordSubfilterBar = document.getElementById("keywordSubfilter");
  const subfilterBtns = document.querySelectorAll(".subfilter-btn");

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
    if (syncDocRef && !applyingRemoteUpdate) {
      syncDocRef
        .set({
          items,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .catch((err) => {
          console.error("sync push failed", err);
          setSyncIndicator("error", "동기화 오류: 저장 실패");
        });
    }
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getVisibleItems() {
    return items.filter((it) => it.category === activeTab);
  }

  function render() {
    commonCount.textContent = items.filter(
      (it) => it.category === "common",
    ).length;
    majorCount.textContent = items.filter(
      (it) => it.category === "major",
    ).length;
    keywordTabCount.textContent = items.filter(
      (it) => it.keywords && it.keywords.length > 0,
    ).length;

    const isKeywordsTab = activeTab === "keywords";
    listEl.classList.toggle("keyword-mode", isKeywordsTab);
    addBtn.textContent = isKeywordsTab ? "+ 카드 추가" : "+ 질문 추가";
    importBtn.hidden = isKeywordsTab;
    keywordSubfilterBar.hidden = !isKeywordsTab;
    listEl.innerHTML = "";

    if (isKeywordsTab) {
      const filtered =
        keywordSubFilter === "all"
          ? items
          : items.filter((it) => it.category === keywordSubFilter);
      const subLabel =
        keywordSubFilter === "all" ? "" : CATEGORY_LABELS[keywordSubFilter];
      countLabel.textContent = subLabel
        ? `${subLabel} 키워드 카드 총 ${filtered.length}개`
        : `키워드 카드 총 ${filtered.length}개`;
      const hasItems = filtered.length > 0;
      emptyState.hidden = hasItems;
      emptyState.querySelector("p").textContent = subLabel
        ? `아직 등록된 ${subLabel}이 없어요. + 카드 추가로 만들어보세요.`
        : "아직 등록된 질문이 없어요. + 카드 추가로 만들어보세요.";
      emptyAddBtn.hidden = false;
      toggleAllBtn.hidden = !hasItems;
      filtered.forEach((item) => listEl.appendChild(buildFlipCard(item)));
    } else {
      const visible = getVisibleItems();
      countLabel.textContent = `${CATEGORY_LABELS[activeTab]} 총 ${visible.length}개`;
      const hasItems = visible.length > 0;
      emptyState.hidden = hasItems;
      emptyState.querySelector("p").textContent =
        `아직 등록된 ${CATEGORY_LABELS[activeTab]}이 없어요. 첫 질문을 추가해보세요.`;
      emptyAddBtn.hidden = false;
      toggleAllBtn.hidden = !hasItems;
      visible.forEach((item, idx) => listEl.appendChild(buildCard(item, idx)));
    }
    updateToggleAllLabel();
  }

  function buildFlipCard(item) {
    const card = document.createElement("div");
    card.className = "flip-card";
    card.dataset.id = item.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "클릭하면 키워드가 보입니다");

    const controls = document.createElement("div");
    controls.className = "flip-card-controls";

    const dragHandle = document.createElement("span");
    dragHandle.className = "flip-card-handle";
    dragHandle.textContent = "⠿";
    dragHandle.title = "드래그해서 순서 변경";
    dragHandle.addEventListener("mousedown", () => {
      card.draggable = true;
    });
    dragHandle.addEventListener("click", (e) => e.stopPropagation());

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "수정";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal({ mode: "main", item });
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = "삭제";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteClick(item.id, deleteBtn, () => {
        items = items.filter((it) => it.id !== item.id);
        revealedIds.delete(item.id);
        saveItems();
        render();
      });
    });

    controls.append(dragHandle, editBtn, deleteBtn);

    const inner = document.createElement("div");
    inner.className = "flip-card-inner";

    const front = document.createElement("div");
    front.className = "flip-card-front";
    const tag = document.createElement("span");
    tag.className = "flip-card-tag";
    tag.textContent = CATEGORY_LABELS[item.category] || "";
    const qText = document.createElement("p");
    qText.className = "flip-card-question";
    qText.textContent = item.q;
    const hint = document.createElement("span");
    hint.className = "flip-card-hint";
    hint.textContent = "클릭해서 뒤집기";
    front.append(tag, qText, hint);

    const back = document.createElement("div");
    back.className = "flip-card-back";
    const hasKeywords = item.keywords && item.keywords.length > 0;
    if (hasKeywords) {
      const chips = document.createElement("div");
      chips.className = "flip-card-chips";
      item.keywords.forEach((k) => {
        const chip = document.createElement("span");
        chip.className = "flip-card-chip";
        chip.textContent = k;
        chips.appendChild(chip);
      });
      back.appendChild(chips);
    } else {
      const empty = document.createElement("p");
      empty.className = "flip-card-empty";
      empty.textContent = "등록된 키워드가 없어요";
      back.appendChild(empty);
    }

    inner.append(front, back);
    card.append(controls, inner);

    function flip() {
      card.classList.toggle("flipped");
      updateToggleAllLabel();
    }
    card.addEventListener("click", flip);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        flip();
      }
    });

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      card.draggable = false;
    });

    return card;
  }

  // 그리드 안에서 드래그 중인 카드를 삽입할 위치를 찾는다 (커서보다 아래에 있는 카드 중 가장 가까운 것).
  function getDragAfterElement(container, x, y) {
    const candidates = [
      ...container.querySelectorAll(".flip-card:not(.dragging)"),
    ];
    return candidates.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offsetY = y - box.top - box.height / 2;
        const offsetX = x - box.left - box.width / 2;
        const offset = Math.hypot(offsetX, offsetY);
        if (offsetY < 0 && offset < closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Infinity, element: null },
    ).element;
  }

  listEl.addEventListener("dragover", (e) => {
    if (activeTab !== "keywords") return;
    const dragging = listEl.querySelector(".flip-card.dragging");
    if (!dragging) return;
    e.preventDefault();
    const afterElement = getDragAfterElement(listEl, e.clientX, e.clientY);
    if (afterElement == null) {
      listEl.appendChild(dragging);
    } else {
      listEl.insertBefore(dragging, afterElement);
    }
  });
  listEl.addEventListener("drop", (e) => {
    if (activeTab !== "keywords") return;
    e.preventDefault();
    const newOrderIds = Array.from(listEl.querySelectorAll(".flip-card")).map(
      (el) => el.dataset.id,
    );
    reorderItems(newOrderIds);
    saveItems();
    render();
  });

  // newOrderIds는 현재 화면에 보이는(하위 필터가 적용된) 카드들의 새 순서다.
  // 화면에 없는(다른 구분의) 항목은 원래 있던 자리에 그대로 두고, 보이는 항목들만 새 순서로 맞춰 끼워넣는다.
  function reorderItems(newOrderIds) {
    const visibleSet = new Set(newOrderIds);
    const queue = newOrderIds
      .map((id) => items.find((it) => it.id === id))
      .filter(Boolean);
    let i = 0;
    items = items.map((it) => (visibleSet.has(it.id) ? queue[i++] : it));
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
    answerWrap.className = "answer-wrap qa-answer";
    const answerInner = document.createElement("div");
    answerInner.className = "answer-inner";
    const answerBody = document.createElement("p");
    answerBody.className = "answer-body";
    answerBody.textContent =
      item.a || "(답변 미작성 — ✎ 버튼으로 답변을 추가해보세요)";
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
    answerWrap.className = "answer-wrap fu-answer";
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
    if (activeTab === "keywords") {
      const anyUnflipped = Array.from(
        document.querySelectorAll(".flip-card"),
      ).some((c) => !c.classList.contains("flipped"));
      toggleAllBtn.textContent = anyUnflipped ? "전체 뒤집기" : "전체 앞면으로";
      return;
    }
    const anyHidden = getVisibleItems().some((it) => !revealedIds.has(it.id));
    toggleAllBtn.textContent = anyHidden ? "전체 보기" : "전체 숨기기";
  }

  toggleAllBtn.addEventListener("click", () => {
    if (activeTab === "keywords") {
      const cards = document.querySelectorAll(".flip-card");
      const anyUnflipped = Array.from(cards).some(
        (c) => !c.classList.contains("flipped"),
      );
      cards.forEach((c) => c.classList.toggle("flipped", anyUnflipped));
      updateToggleAllLabel();
      return;
    }
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

  subfilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      keywordSubFilter = btn.dataset.sub;
      subfilterBtns.forEach((b) => b.classList.toggle("active", b === btn));
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
      catInput.value = item
        ? item.category
        : activeTab === "keywords"
          ? "common"
          : activeTab;
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
    if (e.key === "Escape") {
      if (!modalOverlay.hidden) closeModal();
      if (!importOverlay.hidden) closeImportModal();
      if (!backupOverlay.hidden) closeBackupModal();
    }
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

  function parseImportText(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const results = [];

    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) continue; // 마크다운 헤딩(섹션 제목)은 건너뜀
      if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line)) continue; // 표 구분선(|---|---|) 건너뜀

      let question = "";
      let keywordsRaw = "";

      if (line.includes("|")) {
        let cells = line.split("|").map((c) => c.trim());
        if (cells[0] === "") cells.shift();
        if (cells[cells.length - 1] === "") cells.pop();
        if (cells.length === 0) continue;
        const joined = cells.join(" ");
        if (
          /^(번호|no\.?|#)$/i.test(cells[0]) ||
          (joined.includes("질문") &&
            (joined.includes("키워드") || joined.includes("답변")))
        )
          continue; // 헤더 행 건너뜀

        if (cells.length >= 3) {
          question = cells[1];
          keywordsRaw = cells.slice(2).join(", ");
        } else if (cells.length === 2) {
          question = cells[0];
          keywordsRaw = cells[1];
        } else {
          question = cells[0];
        }
      } else if (line.includes("\t")) {
        const parts = line.split("\t").map((s) => s.trim());
        question = parts[0];
        keywordsRaw = parts.slice(1).join(", ");
      } else if (line.includes("::")) {
        const idx = line.indexOf("::");
        question = line.slice(0, idx).trim();
        keywordsRaw = line.slice(idx + 2).trim();
      } else {
        question = line;
      }

      question = question.replace(/^\d+[.)]\s*/, "").trim();
      if (!question) continue;

      const keywords = keywordsRaw
        ? keywordsRaw
            .replace(/[()]/g, ",")
            .split(/[,·/]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      results.push({ q: question, keywords });
    }
    return results;
  }

  function updateImportPreview() {
    const parsed = parseImportText(importInput.value);
    importPreview.textContent = `${parsed.length}개 항목 인식됨`;
  }
  importInput.addEventListener("input", updateImportPreview);

  function openImportModal() {
    importCatInput.value = activeTab === "major" ? "major" : "common";
    importInput.value = "";
    updateImportPreview();
    importOverlay.hidden = false;
    document.body.classList.add("modal-open");
    importInput.focus();
  }
  function closeImportModal() {
    importOverlay.hidden = true;
    document.body.classList.remove("modal-open");
  }
  importBtn.addEventListener("click", openImportModal);
  importCancelBtn.addEventListener("click", closeImportModal);
  importOverlay.addEventListener("click", (e) => {
    if (e.target === importOverlay) closeImportModal();
  });

  importConfirmBtn.addEventListener("click", () => {
    const parsed = parseImportText(importInput.value);
    if (parsed.length === 0) {
      alert("인식된 질문이 없어요. 형식을 확인해주세요.");
      return;
    }
    const category = importCatInput.value === "major" ? "major" : "common";
    parsed.forEach((p) => {
      items.push({
        id: uid(),
        q: p.q,
        a: "",
        category,
        followups: [],
        keywords: p.keywords,
      });
    });
    saveItems();
    closeImportModal();
    activeTab = category;
    tabBtns.forEach((b) => {
      const match = b.dataset.cat === category;
      b.classList.toggle("active", match);
      b.setAttribute("aria-selected", match ? "true" : "false");
    });
    render();
  });

  function openBackupModal() {
    backupFileInput.value = "";
    const savedConfig = loadSyncConfig();
    if (savedConfig) {
      firebaseConfigInput.value = JSON.stringify(
        savedConfig.firebaseConfig,
        null,
        2,
      );
      syncCodeInput.value = savedConfig.syncCode;
    }
    backupOverlay.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeBackupModal() {
    backupOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    backupFileInput.value = "";
  }
  backupBtn.addEventListener("click", openBackupModal);
  backupCloseBtn.addEventListener("click", closeBackupModal);
  backupOverlay.addEventListener("click", (e) => {
    if (e.target === backupOverlay) closeBackupModal();
  });

  // ---- 실시간 동기화 (Firebase Firestore) ----

  function loadSyncConfig() {
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveSyncConfig(config) {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  }
  function clearSyncConfig() {
    localStorage.removeItem(SYNC_CONFIG_KEY);
  }

  function setSyncIndicator(state, text) {
    syncIndicator.classList.remove("on", "error");
    if (state === "on") {
      syncIndicator.classList.add("on");
      syncIndicator.textContent = "🟢 동기화 중";
    } else if (state === "error") {
      syncIndicator.classList.add("error");
      syncIndicator.textContent = "⚠ 동기화 오류";
    } else {
      syncIndicator.textContent = "🔌 동기화 꺼짐";
    }
    if (text) syncStatusText.textContent = text;
  }

  // Firebase 콘솔에서 복사한 firebaseConfig는 키에 따옴표가 없는 JS 객체 리터럴이라
  // 순수 JSON.parse로는 못 읽는다. Function 생성자로 느슨하게 평가한다 (본인이 콘솔에서 복사한 값만 붙여넣는다는 전제).
  // 붙여넣은 텍스트 어디에 있든 "firebaseConfig = { ... }" 객체 부분만 중괄호 짝을 맞춰 추출한다.
  // import문, 주석, initializeApp(...) 같은 나머지 코드가 같이 붙어있어도 무시된다.
  function extractConfigObjectText(text) {
    const nameIdx = text.indexOf("firebaseConfig");
    const searchFrom = nameIdx !== -1 ? nameIdx : 0;
    const braceStart = text.indexOf("{", searchFrom);
    if (braceStart === -1) return null;
    let depth = 0;
    for (let i = braceStart; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) return text.slice(braceStart, i + 1);
      }
    }
    return null;
  }

  function parseFirebaseConfig(text) {
    try {
      const objText = extractConfigObjectText(text.trim());
      if (!objText) return null;
      const fn = new Function("return (" + objText + ")");
      const cfg = fn();
      if (cfg && typeof cfg === "object" && cfg.projectId) return cfg;
      return null;
    } catch (e) {
      return null;
    }
  }

  function startSync(config, syncCode, isInitialConnect) {
    try {
      const app = firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp(config);
      const db = firebase.firestore(app);
      syncDocRef = db.collection("qna_sync").doc(syncCode);
    } catch (e) {
      setSyncIndicator("error", "동기화 오류: Firebase 설정을 확인해주세요.");
      syncDocRef = null;
      return;
    }

    if (syncUnsubscribe) {
      syncUnsubscribe();
      syncUnsubscribe = null;
    }

    const attachListener = () => {
      syncUnsubscribe = syncDocRef.onSnapshot(
        (snap) => {
          if (snap.metadata.hasPendingWrites) return; // 이 기기가 방금 쓴 내용이 그대로 echo된 것 — 무시
          if (!snap.exists) return;
          const data = snap.data();
          if (!Array.isArray(data.items)) return;
          applyingRemoteUpdate = true;
          items = data.items;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
          render();
          applyingRemoteUpdate = false;
          setSyncIndicator("on", `동기화 중이에요. 코드: ${syncCode}`);
        },
        (err) => {
          console.error("sync listen error", err);
          setSyncIndicator("error", "동기화 오류: " + err.message);
        },
      );
    };

    if (isInitialConnect) {
      syncDocRef
        .get()
        .then((snap) => {
          if (snap.exists && Array.isArray(snap.data().items)) {
            const remoteItems = snap.data().items;
            const existingIds = new Set(items.map((it) => it.id));
            const toAdd = remoteItems.filter((it) => !existingIds.has(it.id));
            items = items.concat(toAdd);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            render();
          }
          // 이 기기의 (병합된) 데이터를 다시 올려서 양쪽을 맞춘다.
          syncDocRef
            .set({
              items,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            })
            .then(() => {
              attachListener();
              setSyncIndicator("on", `동기화 중이에요. 코드: ${syncCode}`);
            })
            .catch((err) => {
              console.error("initial sync push failed", err);
              setSyncIndicator("error", "동기화 오류: " + err.message);
            });
        })
        .catch((err) => {
          console.error("initial sync fetch failed", err);
          setSyncIndicator("error", "동기화 오류: " + err.message);
        });
    } else {
      attachListener();
    }
  }

  function stopSync() {
    if (syncUnsubscribe) {
      syncUnsubscribe();
      syncUnsubscribe = null;
    }
    syncDocRef = null;
    clearSyncConfig();
    setSyncIndicator(
      "off",
      "동기화가 꺼져 있어요. Firebase 설정과 동기화 코드를 넣고 연결하세요.",
    );
    connectSyncBtn.hidden = false;
    disconnectSyncBtn.hidden = true;
  }

  generateCodeBtn.addEventListener("click", () => {
    const code = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    syncCodeInput.value = code;
  });

  connectSyncBtn.addEventListener("click", () => {
    const config = parseFirebaseConfig(firebaseConfigInput.value.trim());
    if (!config) {
      alert(
        "Firebase 설정을 읽을 수 없어요. 콘솔에서 복사한 firebaseConfig를 그대로 붙여넣어주세요.",
      );
      return;
    }
    const syncCode = syncCodeInput.value.trim();
    if (!syncCode) {
      alert('동기화 코드를 입력하거나 "코드 생성" 버튼으로 만들어주세요.');
      return;
    }
    saveSyncConfig({ firebaseConfig: config, syncCode });
    connectSyncBtn.hidden = true;
    disconnectSyncBtn.hidden = false;
    setSyncIndicator("off", "연결하는 중...");
    startSync(config, syncCode, true);
  });

  disconnectSyncBtn.addEventListener("click", () => {
    stopSync();
  });

  (function initSyncOnLoad() {
    const saved = loadSyncConfig();
    if (saved && saved.firebaseConfig && saved.syncCode) {
      connectSyncBtn.hidden = true;
      disconnectSyncBtn.hidden = false;
      startSync(saved.firebaseConfig, saved.syncCode, false);
    }
  })();

  exportBtn.addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview_qna_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  function normalizeImportedItems(list) {
    list.forEach((it) => {
      if (it.category !== "common" && it.category !== "major")
        it.category = "common";
      if (!Array.isArray(it.followups)) it.followups = [];
      if (!Array.isArray(it.keywords)) it.keywords = [];
      if (!it.id) it.id = uid();
      if (typeof it.a !== "string") it.a = "";
      it.followups.forEach((fu) => {
        if (!Array.isArray(fu.keywords)) fu.keywords = [];
        if (!fu.id) fu.id = uid();
      });
    });
    return list;
  }

  backupFileInput.addEventListener("change", () => {
    const file = backupFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        alert(
          "파일을 읽는 중 문제가 발생했어요. 올바른 백업(.json) 파일인지 확인해주세요.",
        );
        return;
      }
      const incoming = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.items)
          ? parsed.items
          : null;
      if (!incoming) {
        alert("올바른 백업 파일이 아니에요.");
        return;
      }
      normalizeImportedItems(incoming);

      if (importMergeCheckbox.checked) {
        const existingIds = new Set(items.map((it) => it.id));
        const toAdd = incoming.filter((it) => !existingIds.has(it.id));
        items = items.concat(toAdd);
        saveItems();
        closeBackupModal();
        render();
        alert(
          `${toAdd.length}개 항목을 새로 병합했어요. (중복 ${incoming.length - toAdd.length}개는 건너뜀)`,
        );
      } else {
        const ok = confirm(
          `현재 기기에 저장된 데이터를 모두 지우고 ${incoming.length}개 항목으로 덮어씁니다. 계속할까요?`,
        );
        if (!ok) return;
        items = incoming;
        saveItems();
        closeBackupModal();
        render();
      }
    };
    reader.readAsText(file);
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
