const headerSections = document.querySelectorAll(".header-section");

const TAB_SORT_KEY = "tabSorts";
const TAB_DEFAULTS = {
    headerSection1: "recent",
    headerSection2: "following_recent",
    headerSection3: "eleicao_recent",
};

const SORT_MODES = {
    headerSection1: { popular: "likes", recent: "recent" },
    headerSection2: { popular: "following_likes", recent: "following_recent" },
    headerSection3: { popular: "eleicao_likes", recent: "eleicao_recent" },
};

function loadTabSorts() {
    try {
        const raw = localStorage.getItem(TAB_SORT_KEY);
        if (raw) return { ...TAB_DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return { ...TAB_DEFAULTS };
}

function saveTabSort(tabId, mode) {
    const sorts = loadTabSorts();
    sorts[tabId] = mode;
    localStorage.setItem(TAB_SORT_KEY, JSON.stringify(sorts));
}

function getTabSort(tabId) {
    return loadTabSorts()[tabId] || TAB_DEFAULTS[tabId];
}

function isPopularMode(mode) {
    return mode === "likes" || mode.endsWith("_likes");
}

function syncHeaderSortIcons() {
    const sorts = loadTabSorts();
    headerSections.forEach((section) => {
        const btn = section.querySelector(".header-section-arrow");
        if (!btn) return;
        const mode = sorts[section.id] || TAB_DEFAULTS[section.id];
        const popular = isPopularMode(mode);
        btn.dataset.mode = popular ? "popular" : "recent";
        const currentLabel = popular ? "Popular" : "Recente";
        const nextLabel = popular ? "Recente" : "Popular";
        const title = `Ordenar por: ${currentLabel} — clique para ${nextLabel}`;
        btn.title = title;
        btn.setAttribute("aria-label", title);
    });
}

// envolve setSortMode para persistir por aba
(function wrapSetSort(){
    if (typeof window.setSortMode === "function" && !window.setSortMode._wrapped) {
        const orig = window.setSortMode;
        window.setSortMode = function(mode){
            orig(mode);
            const active = document.querySelector(".header-section.active");
            if (active) saveTabSort(active.id, mode);
            syncHeaderSortIcons();
        };
        window.setSortMode._wrapped = true;
        // também expõe como global para carousel
        if (typeof setSortMode !== "undefined") setSortMode = window.setSortMode;
    }
})();

// inicializa sortMode com o da aba ativa
(function initTabSort(){
    const active = document.querySelector(".header-section.active");
    if (active && typeof sortMode !== "undefined") {
        const saved = getTabSort(active.id);
        if (saved && typeof window.setSortMode === "function") {
            setTimeout(()=> window.setSortMode(saved), 0);
        }
    }
    syncHeaderSortIcons();
})();

headerSections.forEach((section) => {
    section.addEventListener("click", () => {
        headerSections.forEach((s) => s.classList.remove("active"));
        section.classList.add("active");
        if (typeof setSortMode !== "function") return;
        const tabSort = getTabSort(section.id);
        setSortMode(tabSort);
    });
});

// Toggle de ordenação (Popular <-> Recente) de cada aba
headerSections.forEach((section) => {
    const btn = section.querySelector(".header-section-arrow");
    const modes = SORT_MODES[section.id];
    if (!btn || !modes) return;
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof setSortMode !== "function") return;
        const next = isPopularMode(getTabSort(section.id)) ? modes.recent : modes.popular;
        headerSections.forEach((s) => s.classList.toggle("active", s === section));
        setSortMode(next);
    });
});
