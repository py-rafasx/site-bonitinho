let current = 0;
let likedImages = new Set();
let allImages = [];
let sortMode = localStorage.getItem("sortMode") || "likes";
let singleVoteMode = false;
let nsfwFilter = localStorage.getItem("nsfwFilter") || "blur";
let myUserId = null;
let myUser = null;
let followingIds = [];

function askConfirm(msg, confirmLabel = "Excluir") {
    return new Promise(resolve => {
        const el = document.getElementById("confirmMsg");
        const modal = document.getElementById("confirmModal");
        if (!el || !modal) { resolve(false); return; }
        el.textContent = msg;
        const yesBtn = document.getElementById("confirmYes");
        if (yesBtn) yesBtn.textContent = confirmLabel;
        modal.classList.add("open");
        const cleanup = (val) => {
            modal.classList.remove("open");
            document.getElementById("confirmYes").onclick = null;
            document.getElementById("confirmNo").onclick = null;
            resolve(val);
        };
        document.getElementById("confirmYes").onclick = () => cleanup(true);
        document.getElementById("confirmNo").onclick = () => cleanup(false);
    });
}

async function loadLikes() {
    try {
        const res = await fetch("/api/likes");
        const data = await res.json();
        likedImages = new Set(data.likes || []);
    } catch { /* not logged in */ }
}

async function loadSingleVoteFlag() {
    try {
        const res = await fetch("/api/singlevote");
        const data = await res.json();
        singleVoteMode = data.enabled || false;
        const feedEl = document.getElementById("feedSingleVote");
        if (feedEl) feedEl.style.display = singleVoteMode ? "" : "none";
        const badge = document.getElementById("singleVoteBadge");
        if (badge) badge.hidden = !singleVoteMode;
        renderFeed();
    } catch { /* ignore */ }
}

async function initFeedState() {
    await fetchMyUserId();
    await loadLikes();
    await loadSingleVoteFlag();
}

async function fetchMyUserId() {
    try {
        const me = await fetch("/api/auth/me");
        const meData = await me.json();
        if (meData.user) {
            myUserId = meData.user.id;
            myUser = meData.user;
            window.currentUserIsAdmin = meData.user.is_admin || false;
        }
    } catch { /* not logged in */ }
}

async function loadCarousel(skipScroll = false) {
    const res = await fetch("/api/images");
    const images = await res.json();
    allImages = images;
    updateLastTimestamp();

    await fetchMyUserId();

    await fetchFollowingIds();

    renderGrid();

    if (!images.length) return;

    await loadLikes();
    await loadSingleVoteFlag();
    renderFeed();
    syncSortSelects();
    if (!skipScroll) {
        highlightPostFromUrl();
    }
}

function highlightPostFromUrl() {
    const params = new URLSearchParams(location.search);
    const name = params.get("img") || params.get("image");
    if (!name) return;
    const target = allImages.find(p =>
        p.name === name || (p.media || []).some(m => m.name === name)
    );
    if (!target) return;
    const card = document.querySelector(`.feed-card[data-name="${CSS.escape(target.name)}"]`);
    if (!card) return;

    let active = true;
    const jumpToCard = () => {
        if (!active) return;
        const rect = card.getBoundingClientRect();
        const y = rect.top + window.scrollY - (window.innerHeight - rect.height) / 2;
        window.scrollTo(0, Math.max(0, y));
    };

    requestAnimationFrame(() => {
        jumpToCard();
        card.style.boxShadow = "0 0 0 2px #378ee9";
        setTimeout(() => { card.style.boxShadow = ""; }, 2000);

        const cards = Array.from(document.querySelectorAll(".feed-card"));
        const idx = cards.indexOf(card);
        const medias = [];
        cards.slice(0, idx).forEach(c =>
            c.querySelectorAll("img, video").forEach(m => medias.push(m))
        );
        medias.forEach(m => {
            m.addEventListener("load", jumpToCard, { once: true });
            m.addEventListener("loadeddata", jumpToCard, { once: true });
            m.addEventListener("error", jumpToCard, { once: true });
        });
        window.addEventListener("load", jumpToCard, { once: true });

        setTimeout(() => { active = false; }, 8000);
    });
}

function escText(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function sortedImages() {
    let imgs = [...allImages];
    if (nsfwFilter === "hide") {
        imgs = imgs.filter(i => !i.nsfw);
    }
    if (sortMode.startsWith("eleicao")) {
        imgs = imgs.filter(i => i.eleicao);
    } else if (sortMode.startsWith("following_")) {
        const followSet = new Set((followingIds || []).map(Number));
        imgs = imgs.filter(i => followSet.has(Number(i.owner_id)));
    }
    const byLikes = sortMode === "likes" || sortMode === "following_likes" || sortMode === "eleicao_likes";
    return imgs.sort((a, b) => {
        if (!byLikes) {
            return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        }
        return (b.likes || 0) - (a.likes || 0);
    });
}

function getExpandedSlides() {
    const images = sortedImages();
    const result = [];
    images.forEach(img => {
        if (img.media && img.media.length > 1) {
            img.media.forEach(m => {
                result.push({ name: m.name, nsfw: img.nsfw, post_type: img.post_type, caption: img.caption, media_type: m.media_type || img.media_type });
            });
        } else {
            result.push({ name: img.name, nsfw: img.nsfw, post_type: img.post_type, caption: img.caption, media_type: img.media_type });
        }
    });
    return result;
}

function renderGrid() {
    const thumbs = document.getElementById("gridThumbs");
    if (!thumbs) return;
    const slides = getExpandedSlides();
    thumbs.innerHTML = slides.map((img, idx) => {
        const isText = img.post_type === "text";
        const isVideo = !isText && (img.media_type === "video" || /\.(mp4|webm|mov)$/i.test(img.name));
        const aboveFold = idx < 12;
        let media = "";
        if (isText) {
            const txt = (img.caption || "").trim().slice(0, 80) || "Texto";
            media = `<div class="grid-text-preview">${escText(txt)}</div>`;
        } else if (isVideo) {
            media = `<video src="/images/${escText(img.name)}" muted preload="metadata" playsinline fetchpriority="${aboveFold ? "high" : "low"}"></video><span class="grid-play-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5.14v14l11-7-11-7z"/></svg></span>`;
        } else {
            const imgAttr = aboveFold ? ' fetchpriority="high" loading="eager"' : ' fetchpriority="low" loading="lazy"';
            media = `<img src="/thumbs/${escText(img.name)}" alt=""${imgAttr} decoding="async">`;
        }
    return `
        <button class="grid-thumb ${isText ? "grid-thumb-text" : ""} ${isVideo ? "grid-thumb-video" : ""}" data-name="${escText(img.name)}">
            ${media}
        </button>`;
    }).join("");

    thumbs.querySelectorAll(".grid-thumb").forEach(btn => {
        btn.addEventListener("click", () => {
            const card = document.querySelector(`.feed-card[data-name="${CSS.escape(btn.dataset.name)}"]`);
            if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                card.style.boxShadow = "0 0 0 2px #6366f1";
                setTimeout(() => { card.style.boxShadow = ""; }, 2000);
            }
            closeGrid();
        });
    });
}

function setSortMode(mode) {
    const valid = ["likes", "recent", "following_likes", "following_recent", "eleicao", "eleicao_likes", "eleicao_recent"];
    if (!valid.includes(mode)) return;
    sortMode = mode;
    localStorage.setItem("sortMode", mode);
    syncSortSelects();
    if (sortMode.startsWith("following_") && !followingIds.length) {
        fetchFollowingIds().then(() => { renderGrid(); renderFeed(); });
    } else {
        renderGrid();
        renderFeed();
    }
}

async function fetchFollowingIds() {
    try {
        const res = await fetch("/api/auth/following");
        if (res.ok) {
            const data = await res.json();
            followingIds = Array.isArray(data) ? data : [];
        }
    } catch { /* ignore */ }
}

function syncSortSelects() {
    document.querySelectorAll(".sort-select").forEach(sel => { sel.value = sortMode; });
    const forYou = document.getElementById("tabForYou");
    const following = document.getElementById("tabFollowing");
    const isFollowing = sortMode.startsWith("following_");
    const isEleicao = sortMode.startsWith("eleicao");
    if (forYou && following) {
        forYou.classList.toggle("active", !isFollowing && !isEleicao);
        following.classList.toggle("active", isFollowing);
    }
    document.querySelectorAll(".feed-tab-option").forEach(opt => {
        opt.classList.toggle("active", opt.dataset.mode === sortMode);
    });
    document.querySelectorAll(".header-section").forEach(section => {
        if (section.id === "headerSection1") section.classList.toggle("active", !isFollowing && !isEleicao);
        if (section.id === "headerSection2") section.classList.toggle("active", isFollowing);
        if (section.id === "headerSection3") section.classList.toggle("active", isEleicao);
    });
    document.querySelectorAll("#paraVoceSortMenu button").forEach(btn => {
        btn.classList.toggle("active", !isFollowing && !isEleicao && btn.dataset.sort === (sortMode === "likes" ? "popular" : "recente"));
    });
    document.querySelectorAll("#seguindoSortMenu button").forEach(btn => {
        btn.classList.toggle("active", isFollowing && btn.dataset.sort === (sortMode.endsWith("_likes") ? "popular" : "recente"));
    });
    document.querySelectorAll("#eleicaoSortMenu button").forEach(btn => {
        btn.classList.toggle("active", isEleicao && btn.dataset.sort === (sortMode.endsWith("_likes") ? "popular" : "recente"));
    });
}

function openGrid() {
    document.getElementById("gridOverlay")?.classList.add("open");
}

function closeGrid() {
    document.getElementById("gridOverlay")?.classList.remove("open");
}

document.getElementById("grid-btn")?.addEventListener("click", openGrid);

document.getElementById("gridClose")?.addEventListener("click", closeGrid);

const followingMenu = document.getElementById("followingMenu");

function closeFollowingMenu() {
    followingMenu?.classList.remove("open");
}

document.getElementById("tabForYou")?.addEventListener("click", () => {
    closeFollowingMenu();
    setSortMode("likes");
});

document.getElementById("tabFollowing")?.addEventListener("click", () => {
    followingMenu?.classList.toggle("open");
});

document.getElementById("tabAddPost")?.addEventListener("click", () => {
    document.getElementById("composerModal")?.classList.add("open");
});

document.querySelectorAll(".feed-tab-option").forEach(opt => {
    opt.addEventListener("click", () => {
        setSortMode(opt.dataset.mode);
        closeFollowingMenu();
    });
});

document.addEventListener("click", e => {
    if (!e.target.closest("#tabFollowingWrap")) closeFollowingMenu();
});

document.getElementById("gridOverlay")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeGrid();
});

/* === Feed view (scroll mode) === */
function avatarUrl(a) {
    return (!a || a === "default-avatar.svg") ? "/static/svg/default-avatar.svg" : `/avatars/${a}`;
}

function initFeedCarousel(el) {
    const slides = el.querySelectorAll(".feed-carousel-slide");
    const dots = el.querySelectorAll(".feed-carousel-dot");
    let idx = 0;

    function goTo(i) {
        if (i < 0 || i >= slides.length) return;
        slides[idx].classList.remove("active");
        dots[idx].classList.remove("active");
        idx = i;
        slides[idx].classList.add("active");
        dots[idx].classList.add("active");
    }

    function step(dir) {
        goTo(idx + dir);
    }

    slides[0]?.classList.add("active");

    dots.forEach((d, i) => d.addEventListener("click", () => goTo(i)));

    el.closest(".feed-card-wrap")?.querySelectorAll(".feed-carousel-arrow[data-carousel-direction]").forEach(btn => {
        btn.addEventListener("click", () => step(Number(btn.dataset.carouselDirection || 0)));
    });

    let startX = 0;
    el.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) {
            if (dx < 0 && idx < slides.length - 1) goTo(idx + 1);
            else if (dx > 0 && idx > 0) goTo(idx - 1);
        }
    }, { passive: true });
}

const FEED_BATCH = 6;
let feedRenderedCount = 0;
let feedObserver = null;

function renderFeed() {
    const feed = document.getElementById("feedView");
    if (!feed) return;
    const imgs = sortedImages();
    feedRenderedCount = 0;
    feed.innerHTML = "";
    stopFeedObserver();
    if (typeof window.resetFeedNavIndex === "function") window.resetFeedNavIndex();
    const params = new URLSearchParams(location.search);
    if (params.get("img") || params.get("image")) {
        // com destaque (img na URL): renderiza tudo para conseguir rolar até o post
        feed.innerHTML = imgs.map(feedCardHTML).join("");
        feedRenderedCount = imgs.length;
        initFeedMedia(feed);
        return;
    }
    appendFeedBatch(feed, imgs);
    setupFeedObserver(feed, imgs);
}

function appendFeedBatch(feed, imgs) {
    const next = imgs.slice(feedRenderedCount, feedRenderedCount + FEED_BATCH);
    if (!next.length) return false;
    const batch = document.createElement("div");
    batch.innerHTML = next.map(feedCardHTML).join("");
    initFeedMedia(batch);
    while (batch.firstChild) feed.appendChild(batch.firstChild);
    feedRenderedCount += next.length;
    return true;
}

function setupFeedObserver(feed, imgs) {
    stopFeedObserver();
    let sentinel = document.getElementById("feedSentinel");
    if (!sentinel) {
        sentinel = document.createElement("div");
        sentinel.id = "feedSentinel";
        feed.parentNode.insertBefore(sentinel, feed.nextSibling);
    }
    feedObserver = new IntersectionObserver((entries) => {
        if (!entries.some(e => e.isIntersecting)) return;
        if (!appendFeedBatch(feed, imgs)) stopFeedObserver();
    }, { rootMargin: "900px 0px" });
    feedObserver.observe(sentinel);
}

function stopFeedObserver() {
    if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
    const sentinel = document.getElementById("feedSentinel");
    if (sentinel) sentinel.remove();
}

function feedCardHTML(img, i) {
    const liked = likedImages.has(img.name);
    const likes = img.likes || 0;
    const comments = img.comments || 0;
    const isText = img.post_type === "text";
    const isVideo = img.post_type === "video";
    const isMulti = img.media && img.media.length > 1;
    const nsfwClass = (img.nsfw && nsfwFilter === "blur") ? " nsfw-blur" : "";
    const aboveFold = typeof i === "number" && i < 3;

    let mediaSection = "";
    if (!isText) {
        if (isMulti) {
            const slides = img.media.map((m, slideI) => {
                if (m.media_type === "video") {
                    return `<div class="feed-carousel-slide">${createVideoPlayerHTML("/images/" + escText(m.name), slideI === 0 && aboveFold)}</div>`;
                }
                const prio = slideI === 0
                    ? (aboveFold ? ' fetchpriority="high"' : '')
                    : ' loading="lazy" fetchpriority="low"';
                return `<div class="feed-carousel-slide"><img src="/images/${escText(m.name)}" alt=""${prio} decoding="async" class="${nsfwClass.trim()}"></div>`;
            }).join("");
            const dots = img.media.map((_, dI) => `<span class="feed-carousel-dot${dI === 0 ? ' active' : ''}" data-idx="${dI}"></span>`).join("");
            mediaSection = `<div class="feed-carousel" data-post="${escText(img.post_id)}">${slides}<div class="feed-carousel-dots">${dots}</div></div>`;
        } else if (isVideo) {
            mediaSection = `<div class="feed-img">${createVideoPlayerHTML("/images/" + escText(img.name), aboveFold)}</div>`;
        } else {
            const imgAttr = aboveFold ? ' fetchpriority="high" loading="eager"' : ' fetchpriority="low" loading="lazy"';
            mediaSection = `<div class="feed-img${img.nsfw ? ' nsfw-container' : ''}"><img src="/images/${escText(img.name)}" alt=""${imgAttr} decoding="async" class="${nsfwClass.trim()}">${img.nsfw && nsfwFilter === "blur" ? '<button class="nsfw-reveal-btn" type="button">Mostrar imagem</button>' : ''}</div>`;
        }
    }

    const downloadBtn = isText ? "" : `<button class="feed-download" data-name="${escText(img.name)}" type="button" title="Baixar"><span class="ico ico-download" aria-hidden="true"></span></button>`;

    const capText = img.caption || "";
    const capLong = capText.length > 300;
    const captionHtml = `
        <div class="feed-caption${isText ? ' feed-caption-text' : ''}${capLong ? ' has-toggle clamped' : ''}">${escText(capText)}</div>
        ${capLong ? '<button class="feed-caption-toggle" type="button">Ver mais</button>' : ""}
    `;
    
    const tagNsfwHtml = img.nsfw ? `
        <span class="feed-nsfw-badge"><span class="ico ico-nsfw" aria-hidden="true"></span> NSFW</span>` : '';
        
    const tagEleicaoHtml = img.eleicao ? `
        <span class="feed-eleicao-badge"><span class="ico ico-eleicao" aria-hidden="true"></span> Eleição</span>` : '';

    const userPlaceholder = myUser && myUser.display_name ? `Comente como ${myUser.display_name}` : "Adicione um comentário...";
    const carouselControls = isMulti ? `
        <button class="feed-carousel-arrow feed-carousel-arrow-left" type="button" aria-label="Imagem anterior" data-carousel-direction="-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg></button>
        <button class="feed-carousel-arrow feed-carousel-arrow-right" type="button" aria-label="Próxima imagem" data-carousel-direction="1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>` : "";
    return `
    <div class="feed-card-wrap${isMulti ? ' has-feed-carousel' : ''}">
    ${carouselControls}
    <article class="feed-card${isText ? ' feed-card-text' : ''}" data-name="${escText(img.name)}" data-post-id="${escText(img.post_id || img.name)}">
        <div class="feed-owner">
            <img class="feed-avatar" src="${avatarUrl(img.owner_avatar)}" alt="" onerror="this.src='/static/svg/default-avatar.svg'" data-owner="${escText(img.owner || "")}">
            <div class="feed-owner-meta">
                <div class="feed-owner-line">
                    <span class="feed-owner-name" data-owner="${escText(img.owner || "")}">${escText(img.owner_display_name || img.owner || "\u2014")}</span>
                    <span class="feed-owner-handle" data-owner="${escText(img.owner || "")}">@${escText(img.owner || "\u2014")}</span>
                </div>
                ${img.created_at ? `<span class="feed-time">&middot; ${feedTimeAgo(img.created_at)}</span>` : ""}
            </div>
            <div class="feed-owner-flags">
                ${tagNsfwHtml}
                ${tagEleicaoHtml}
                ${myUserId && img.owner_id === myUserId ? `
                    <div class="post-owner-actions feed-owner-actions">
                        <button type="button" class="post-menu-btn" title="Opções" aria-label="Opções do post" aria-expanded="false" aria-haspopup="menu"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
                        <div class="post-menu" hidden role="menu">
                            <button type="button" class="post-menu-item post-edit" role="menuitem" aria-label="Editar post" data-name="${escText(img.name)}" data-caption="${escText(img.caption || "")}" data-nsfw="${img.nsfw ? "1" : "0"}" data-eleicao="${img.eleicao ? "1" : "0"}">Editar</button>
                            <button type="button" class="post-menu-item post-delete" role="menuitem" aria-label="Excluir post" data-name="${escText(img.name)}">Excluir</button>
                        </div>
                    </div>
                ` : ""}
            </div>
        </div>
        ${captionHtml}
        ${mediaSection}
        <div class="feed-actions">
            <button class="feed-like ${liked ? "liked" : ""}" data-name="${escText(img.name)}" type="button">
                <span class="ico ${liked ? "ico-upvote-filled" : "ico-upvote"}" aria-hidden="true"></span>
            </button>
            <span class="feed-likes" data-name="${escText(img.name)}" role="button">${likes > 0 ? likes : ""}</span>
            <button class="feed-comment-toggle" data-name="${escText(img.name)}" type="button">
                <span class="ico ico-comments" aria-hidden="true"></span>
            </button>
            <span class="feed-comment-count">${comments > 0 ? comments : ""}</span>
            ${downloadBtn}
        </div>
        <div class="feed-likers"></div>
        <div class="feed-comments" hidden>
            <div class="feed-comments-list"></div>
            <div class="feed-reply-indicator"><span class="feed-reply-text"></span><button type="button" class="feed-reply-cancel">&times;</button></div>
            <form class="comment-form feed-comment-form">
                <div class="comment-avatar"${myUser && myUser.username ? ` data-comment-username="${escText(myUser.username)}"` : ""}>
                    <img src="${myUser && myUser.avatar ? feedAvatarUrl(myUser.avatar) : '/static/svg/default-avatar.svg'}" alt="Avatar">
                </div>
                <div class="comment-box">
                    <div class="comment-media-preview" hidden></div>
                    <textarea class="comment-textarea" placeholder="${userPlaceholder}" rows="1" autocomplete="off"></textarea>
                    <div class="comment-form-actions">
                        <input type="file" class="comment-media-input" accept="image/*,image/webp,video/mp4,video/webm,video/quicktime,.gif" hidden>
                        
                        <!-- Câmera / Imagem -->
                        <button type="button" class="comment-media-btn" title="Câmera">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M0 0h24v24H0V0z" fill="none"></path><path d="M18 20H4V6h9V4H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-9h-2v9zm-7.79-3.17l-1.96-2.36L5.5 18h11l-3.54-4.71zM20 4V1h-2v3h-3c.01.01 0 2 0 2h3v2.99c.01.01 2 0 2 0V6h3V4h-3z"></path></svg>
                        </button>

                        <!-- Imagem / GIF -->
                        <button type="button" class="comment-gif-btn" title="Imagem / GIF">
                            <svg viewBox="0 0 24 24">
                                <path d="M5 3h14a2 2 0 0 1 2 2v9a7 7 0 0 1-7 7H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
                                <path d="M14 21v-5a2 2 0 0 1 2-2h5"/>
                                <circle cx="9" cy="10" r="1"/>
                                <circle cx="15" cy="10" r="1"/>
                                <path d="M8 14c1.2 1.5 2.8 1.5 4 0"/>
                            </svg>
                        </button>

                        <!-- Enviar -->
                        <button type="submit" class="feed-create-send feed-comment-send" title="Enviar" disabled>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </article>
    </div>`;
}

function initFeedMedia(root) {
    root.querySelectorAll(".feed-carousel").forEach(initFeedCarousel);
    root.querySelectorAll(".video-player").forEach(initVideoPlayer);
}

function setLikeIcon(btn, liked) {
    const ico = btn && btn.querySelector(".ico");
    if (!ico) return;
    ico.classList.toggle("ico-upvote-filled", liked);
    ico.classList.toggle("ico-upvote", !liked);
}

async function toggleFeedLike(btn) {
    const name = btn.dataset.name;
    if (!name) return;

    const wasLiked = likedImages.has(name);
    const delta = wasLiked ? -1 : 1;
    if (wasLiked) likedImages.delete(name);
    else likedImages.add(name);
    const liked = !wasLiked;

    btn.classList.toggle("liked", liked);
    setLikeIcon(btn, liked);

    const countEl = btn.parentElement.querySelector(".feed-likes");
    const before = parseInt(countEl.textContent) || 0;
    const after = Math.max(0, before + delta);
    countEl.textContent = after > 0 ? after : "";

    const img = allImages.find(x => x.name === name);
    if (img) img.likes = Math.max(0, (img.likes || 0) + delta);

    let prevUnlikedName = null;
    let prevUnlikedImg = null;
    if (singleVoteMode && liked && img && img.eleicao) {
        for (const n of likedImages) {
            if (n === name) continue;
            const cand = allImages.find(x => x.name === n);
            if (!cand || !cand.eleicao) continue;
            prevUnlikedName = n;
            likedImages.delete(n);
            prevUnlikedImg = cand;
            if (prevUnlikedImg) prevUnlikedImg.likes = Math.max(0, (prevUnlikedImg.likes || 0) - 1);
            const prevBtn = document.querySelector(`.feed-like[data-name="${CSS.escape(n)}"]`);
            if (prevBtn) {
                prevBtn.classList.remove("liked");
                setLikeIcon(prevBtn, false);
            }
            const prevCountEl = document.querySelector(`.feed-likes[data-name="${CSS.escape(n)}"]`);
            if (prevCountEl) {
                const pv = parseInt(prevCountEl.textContent) || 0;
                prevCountEl.textContent = Math.max(0, pv - 1) > 0 ? Math.max(0, pv - 1) : "";
            }
            break;
        }
    }

    try {
        const res = await fetch(`/api/likes/${encodeURIComponent(name)}`, { method: "POST" });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (data.liked !== liked) {
            await loadLikes();
            renderFeed();
        }
    } catch {
        if (wasLiked) likedImages.add(name);
        else likedImages.delete(name);
        btn.classList.toggle("liked", wasLiked);
        setLikeIcon(btn, wasLiked);
        countEl.textContent = before > 0 ? before : "";
        if (img) img.likes = Math.max(0, (img.likes || 0) - delta);
        if (prevUnlikedName) {
            likedImages.add(prevUnlikedName);
            if (prevUnlikedImg) prevUnlikedImg.likes = (prevUnlikedImg.likes || 0) + 1;
            const prevBtn = document.querySelector(`.feed-like[data-name="${CSS.escape(prevUnlikedName)}"]`);
            if (prevBtn) {
                prevBtn.classList.add("liked");
                setLikeIcon(prevBtn, true);
            }
            const prevCountEl = document.querySelector(`.feed-likes[data-name="${CSS.escape(prevUnlikedName)}"]`);
            if (prevCountEl) {
                const pv = parseInt(prevCountEl.textContent) || 0;
                prevCountEl.textContent = pv + 1 > 0 ? pv + 1 : "";
            }
        }
    }
}

async function toggleFeedLikers(el) {
    const name = el.dataset.name;
    const card = el.closest(".feed-card");
    const box = card.querySelector(".feed-likers");
    if (box.classList.contains("open")) { box.classList.remove("open"); box.innerHTML = ""; return; }
    box.innerHTML = "Carregando...";
    box.classList.add("open");
    try {
        const res = await fetch(`/api/likers/${encodeURIComponent(name)}`);
        const likers = await res.json();
        box.innerHTML = likers.length
            ? likers.map(u => `<span class="liker-tag">@${escText(u.username)}</span>`).join("")
            : `<span class="liker-tag" style="color:#a1a1aa">Ninguém ainda</span>`;
    } catch { box.classList.remove("open"); box.innerHTML = ""; }
}

function userColorFeed(username) {
    const colors = ["#FA8128", "#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#84cc16"];
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    return colors[hash % colors.length];
}

function feedAvatarUrl(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return "/static/svg/default-avatar.svg";
    return `/avatars/${avatar}`;
}

function feedTimeAgo(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "Z");
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function renderFeedNode(c, depth, currentUserId, isAdmin, myCommentLikes) {
    const canDelete = isAdmin || currentUserId === c.user_id;
    const cls = ["comment"];
    if (depth > 0) cls.push("comment-reply");
    if (depth === 1) cls.push("comment-depth-1");
    if (depth >= 2) cls.push("comment-depth-2");

    const liked = myCommentLikes.has(c.id);
    const likes = c.likes || 0;

    let html = `<div class="${cls.join(" ")}" data-id="${c.id}">`;
    html += `<div class="comment-main">`;
    html += `<div class="comment-avatar" data-comment-username="${escText(c.username)}"><img src="${feedAvatarUrl(c.avatar)}" alt=""></div>`;
    html += `<div class="comment-body">`;
    html += `<div class="comment-bubble">`;
    html += `<div class="comment-user-row" data-comment-username="${escText(c.username)}"><span class="comment-user" style="color:${c.color || userColorFeed(c.username)}">${escText(c.display_name || c.username)}</span><span class="comment-handle">@${escText(c.username)}</span></div>`;
    html += `<span class="comment-text">${escText(c.text).replace(/@(\w+)/g, '<span class="comment-mention">@$1</span>')}</span>`;
    if (c.media_name) {
        if (c.media_type === "video") {
            html += `<div class="comment-media" style="margin-top:6px;">${createVideoPlayerHTML("/comment-media/" + escText(c.media_name))}</div>`;
        } else {
            html += `<div class="comment-media" style="margin-top:6px;"><img src="/comment-media/${escText(c.media_name)}" alt="" loading="lazy" style="max-width:180px;max-height:140px;border-radius:8px;object-fit:cover;display:block;"></div>`;
        }
    }
    html += `</div>`;
    html += `<div class="comment-meta">`;
    html += `<span class="comment-time">${feedTimeAgo(c.created_at)}</span>`;
    if (currentUserId) {
        html += `<button class="comment-like-btn${liked ? " liked" : ""}" data-id="${c.id}"><svg width="12" height="12" viewBox="0 0 20 20" fill="${liked ? "var(--accent)" : "none"}" stroke="${liked ? "var(--accent)" : "currentColor"}" stroke-width="2"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10z"/></svg></button>`;
        html += `<span class="comment-like-count" data-id="${c.id}"${likes > 0 ? "" : " style='display:none'"}>${likes || ""}</span>`;
        html += `<div class="comment-likers" data-id="${c.id}" hidden></div>`;
        html += `<button class="comment-reply-btn" data-id="${c.id}" data-user="${escText(c.username)}">Responder</button>`;
    }
    html += `</div></div>`;
    const canEdit = currentUserId === c.user_id;
    if (canEdit || canDelete) {
        html += `<div class="comment-owner-actions">`;
        html += `<button type="button" class="comment-menu-btn" title="Opções" aria-label="Opções do comentário" aria-expanded="false" aria-haspopup="menu"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>`;
        html += `<div class="comment-menu" hidden role="menu">`;
        if (canEdit) {
            html += `<button type="button" class="comment-menu-item comment-edit" role="menuitem" aria-label="Editar comentário" data-id="${c.id}" data-text="${escText(c.text)}">Editar</button>`;
        }
        if (canDelete) {
            html += `<button type="button" class="comment-menu-item comment-delete" role="menuitem" aria-label="Excluir comentário" data-id="${c.id}">Excluir</button>`;
        }
        html += `</div></div>`;
    }
    html += `</div>`;

    if (c.replies && c.replies.length) {
        html += `<div class="comment-children">`;
        html += c.replies.map(r => renderFeedNode(r, depth + 1, currentUserId, isAdmin, myCommentLikes)).join("");
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function buildFeedTree(comments) {
    const map = new Map();
    const roots = [];
    comments.forEach(c => map.set(c.id, { ...c, replies: [] }));
    comments.forEach(c => {
        const node = map.get(c.id);
        if (c.parent_id && map.has(c.parent_id)) {
            map.get(c.parent_id).replies.push(node);
        } else {
            roots.push(node);
        }
    });
    return roots;
}

async function loadFeedComments(card) {
    const name = card.dataset.name;
    const list = card.querySelector(".feed-comments-list");
    let feedCurrentUserId = null;
    let feedIsAdmin = false;
    let feedMyLikes = new Set();
    try {
        const me = await fetch("/api/auth/me");
        const meData = await me.json();
        if (meData.user) {
            feedCurrentUserId = meData.user.id;
            feedIsAdmin = meData.user.is_admin || false;
        }
    } catch { /* ignore */ }
    try {
        const likesRes = await fetch("/api/comment-likes");
        const likesData = await likesRes.json();
        feedMyLikes = new Set(likesData.likes || []);
    } catch { /* ignore */ }
    try {
        const res = await fetch(`/api/comments/${encodeURIComponent(name)}`);
        const comments = await res.json();

        const img = allImages.find(x => x.name === name);
        if (img) img.comments = comments.length;
        const countEl = card.querySelector(".feed-comment-count");
        if (countEl) countEl.textContent = comments.length > 0 ? comments.length : "";

        if (!comments.length) {
            list.innerHTML = `<div class="comment"><div class="comment-main"><div class="comment-body"><span class="comment-text" style="color:var(--text-muted)">Nenhum comentário ainda</span></div></div></div>`;
            return;
        }
        const tree = buildFeedTree(comments);
        list.innerHTML = tree.map(c => renderFeedNode(c, 0, feedCurrentUserId, feedIsAdmin, feedMyLikes)).join("");
        list.querySelectorAll(".video-player").forEach(initVideoPlayer);
    } catch { list.innerHTML = ""; }
}

function toggleFeedComments(btn) {
    const card = btn.closest(".feed-card");
    const box = card.querySelector(".feed-comments");
    if (box.hidden) {
        box.hidden = false;
        loadFeedComments(card);
    } else {
        box.hidden = true;
    }
}

function onFeedClick(e) {
    if (e.target.closest(".video-player")) return;

    const cAuthor = e.target.closest("[data-comment-username]");
    if (cAuthor && cAuthor.dataset.commentUsername) {
        goToProfile(cAuthor.dataset.commentUsername);
        return;
    }

    const ownerEl = e.target.closest("[data-owner]");
    if (ownerEl && ownerEl.dataset.owner) {
        goToProfile(ownerEl.dataset.owner);
        return;
    }

    const feedImg = e.target.closest(".feed-img img");
    if (feedImg) {
        const card = feedImg.closest(".feed-card");
        if (card && typeof openLightbox === "function") {
            const name = card.dataset.name;
            const sorted = sortedImages();
            const idx = sorted.findIndex(x => x.name === name);
            openLightbox(idx >= 0 ? idx : 0, sorted);
        }
        return;
    }

    const feedReplyBtn = e.target.closest(".comment-reply-btn");
    if (feedReplyBtn) {
        e.stopPropagation();
        const commentId = parseInt(feedReplyBtn.dataset.id);
        const username = feedReplyBtn.dataset.user;
        const card = feedReplyBtn.closest(".feed-card");
        feedReplyParentId = commentId;
        const indicator = card.querySelector(".feed-reply-indicator");
        const indicatorText = card.querySelector(".feed-reply-text");
        if (indicator && indicatorText) {
            indicatorText.textContent = `Respondendo a @${username}`;
            indicator.classList.add("visible");
        }
        const textarea = card.querySelector(".feed-comment-form textarea");
        if (textarea) {
            textarea.placeholder = `Responder @${username}...`;
            textarea.focus();
        }
        return;
    }

    const feedReplyCancel = e.target.closest(".feed-reply-cancel");
    if (feedReplyCancel) {
        e.stopPropagation();
        const card = feedReplyCancel.closest(".feed-card");
        feedReplyParentId = null;
        const indicator = card.querySelector(".feed-reply-indicator");
        if (indicator) indicator.classList.remove("visible");
        const textarea = card.querySelector(".feed-comment-form textarea");
        if (textarea) textarea.placeholder = "Adicione um comentario...";
        return;
    }

    const commentEditBtn = e.target.closest(".comment-edit");
    if (commentEditBtn) {
        e.stopPropagation();
        const id = commentEditBtn.dataset.id;
        const currentText = commentEditBtn.dataset.text || "";

        const commentEl = commentEditBtn.closest(".comment") || document.querySelector(`.comment[data-id="${id}"]`);
        const bubble = commentEl?.querySelector(".comment-bubble");
        if (!bubble || bubble.dataset.editing === "1") return;

        const originalHTML = bubble.innerHTML;
        bubble.dataset.editing = "1";
        bubble.classList.add("editing");
        commentEl.classList.add("editing");

        bubble.innerHTML = `
            <div class="comment-edit-form">
                <div class="comment-edit-row">
                    <textarea class="comment-edit-textarea">${currentText}</textarea>
                    <button type="button" class="comment-edit-btn" title="Salvar"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
                </div>
                <span class="comment-edit-hint">Pressione Esc para <a href="#" class="comment-edit-cancel-link">cancelar</a></span>
            </div>
        `;

        const textarea = bubble.querySelector(".comment-edit-textarea");

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        function adjustHeight() {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
        }
        adjustHeight();
        textarea.addEventListener("input", adjustHeight);

        function restore() {
            document.removeEventListener("keydown", onKey);
            bubble.classList.remove("editing");
            commentEl.classList.remove("editing");
            bubble.dataset.editing = "0";
            bubble.innerHTML = originalHTML;
        }

        function save() {
            const text = textarea.value.trim();
            if (!text) return;
            fetch(`/api/comments/id/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
                credentials: "include"
            })
                .then(res => res.json())
                .then(data => {
                    if (data.id) {
                        const feedCard = commentEl.closest(".feed-card");
                        if (feedCard) loadFeedComments(feedCard);
                    }
                })
                .catch(err => console.error("Erro ao editar comentário:", err));
        }

        function onKey(ev) {
            if (ev.key === "Escape") {
                ev.preventDefault();
                restore();
            } else if (ev.key === "Enter" && !ev.shiftKey && document.activeElement === textarea) {
                ev.preventDefault();
                save();
            }
        }

        document.addEventListener("keydown", onKey);

        bubble.querySelector(".comment-edit-btn").onclick = save;
        bubble.querySelector(".comment-edit-cancel-link").onclick = ev => {
            ev.preventDefault();
            restore();
        };
        return;
    }

    const feedDeleteBtn = e.target.closest(".comment-delete");
    if (feedDeleteBtn) {
        e.stopPropagation();
        const delId = feedDeleteBtn.dataset.id;
        const commentEl = document.querySelector(`.comment[data-id="${delId}"]`);
        // some na hora (otimista) — igual ao post
        if (commentEl) { commentEl.style.transition = "opacity 0.2s"; commentEl.style.opacity = "0"; setTimeout(() => commentEl.remove(), 220); }
        closeAllMenus();
        fetch(`/api/comments/id/${delId}`, { method: "DELETE" })
            .then(() => {
                const el = document.querySelector(`.comment[data-id="${delId}"]`);
                if (el) el.remove();
                const feedCard = (commentEl || el)?.closest(".feed-card") || document.querySelector(".feed-card");
                if (feedCard) loadFeedComments(feedCard);
            })
            .catch(() => { if (commentEl) { commentEl.style.opacity = "1"; } });
        return;
    }

    const revealBtn = e.target.closest(".nsfw-reveal-btn");
    if (revealBtn) {
        e.stopPropagation();
        const container = revealBtn.closest(".feed-img");
        if (container) {
            container.querySelector("img")?.classList.remove("nsfw-blur");
            revealBtn.remove();
            container.classList.remove("nsfw-container");
        }
        return;
    }

    const postEditBtn = e.target.closest(".post-edit, .feed-edit");
    if (postEditBtn) {
        e.stopPropagation();
        const name = postEditBtn.dataset.name;
        const currentCaption = postEditBtn.dataset.caption || "";
        const currentNsfw = postEditBtn.dataset.nsfw === "1";
        const currentEleicao = postEditBtn.dataset.eleicao === "1";
        
        const card = postEditBtn.closest(".feed-card");
        const postId = card?.dataset.postId;
        let postData = card ? allImages.find(x => x.post_id === postId || x.name === name) : null;
        if (!postData) {
            postData = allImages.find(x => x.name === name || (x.media || []).some(m => m.name === name));
        }
        if (!postData) {
            postData = { media: [{ name, media_type: "image" }], post_id: postId || name };
        }

        let mediaList = [...postData.media];
        let mediaToRemove = [];
        let newFiles = [];
        let selectedZip = null;
        let editNsfwActive = currentNsfw;
        let editEleicaoActive = currentEleicao;

        const modal = document.createElement("div");
        modal.className = "confirm-overlay";
        modal.style.cssText = "position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem;";

        modal.innerHTML = `
            <div class="edit-post-modal" role="dialog" aria-label="Editar postagem">
                <div class="edit-post-header">
                    <span class="edit-post-title">Editar postagem</span>
                    <button type="button" class="edit-post-close" title="Fechar">&times;</button>
                </div>
                <textarea id="editPostCaption" class="composer-text" rows="4" maxlength="2000" placeholder="No que voce esta pensando?">${currentCaption}</textarea>
                <div id="editMediaPreviews" class="composer-media-previews"></div>
                <div class="feed-create-toolbar edit-post-toolbar">
                    <input type="file" id="editFileInput" multiple accept="image/*,video/mp4,video/webm,video/quicktime" hidden>
                    ${window.currentUserIsAdmin ? `<input type="file" id="editZipInput" accept=".zip,application/zip" hidden>` : ""}
                    <button type="button" class="feed-create-icon edit-icon-eleicao${currentEleicao ? " active" : ""}" id="editEleicaoToggle" title="Marcar como Eleicao" aria-label="Marcar como Eleicao">
                        <svg width="30" height="15" viewBox="0 2 32 16" fill="currentColor" aria-hidden="true">
<path fill-rule="evenodd" d="M5 2h22c2.761 0 5 2.239 5 5v6c0 2.761-2.239 5-5 5H5c-2.761 0-5-2.239-5-5V7c0-2.761 2.239-5 5-5Zm0 2C3.343 4 2 5.343 2 7v6c0 1.657 1.343 3 3 3h22c1.657 0 3-1.343 3-3V7c0-1.657-1.343-3-3-3H5Z"/>
<path d="M4.5 7h1.5l1 4.1L8 7h1.5l-1.6 6H6.1L4.5 7Z"/>
<path fill-rule="evenodd" d="M10.5 7h2c.828 0 1.5.672 1.5 1.5v3c0 .828-.672 1.5-1.5 1.5h-2c-.828 0-1.5-.672-1.5-1.5v-3c0-.828.672-1.5 1.5-1.5Zm0 1.3v3.4h1.4V8.3h-1.4Z"/>
<path d="M14.5 7h4v1.3h-1.3V13h-1.4V8.3h-1.3V7Z"/>
<path d="M19 7h3.3v1.3h-1.9v1h1.6v1.3h-1.6v1.1h1.9V13H19V7Z"/>
<path d="M24.8 8.5h1.3v1.1h1.1v1.3h-1.1V12h-1.3v-1.1h-1.1V9.6h1.1V8.5Z"/>
                        </svg>
                    </button>
                    <div class="feed-create-divider"></div>
                    <button type="button" class="feed-create-icon edit-icon-nsfw${currentNsfw ? " active" : ""}" id="editNsfwToggle" title="Marcar como NSFW" aria-label="Marcar como NSFW">
                        <svg width="20" height="21" viewBox="452 29.333 1133.333 1078.667" aria-hidden="true"><path fill="currentColor" d="M 540.225 140.346 C 545.508 139.898 552.392 139.858 557.708 139.842 L 972.783 139.809 L 1109.66 139.855 C 1131.88 139.877 1155.47 138.317 1177.5 140.267 C 1183.26 140.776 1189.25 142.757 1193.36 146.995 C 1198.23 152.007 1199.46 159.133 1199.4 165.871 C 1199.3 177.476 1194.46 186.536 1183.06 190.341 C 1168.04 195.35 1083.42 192.654 1061.64 192.68 L 707.136 192.984 L 600.103 192.901 C 582.503 192.869 564.556 192.55 547.105 193.151 C 537.206 194.231 528.662 203.113 528.514 212.847 C 528.052 243.182 528.251 273.445 528.211 303.72 L 528.243 490.286 L 527.933 1015.55 C 528.999 1017.47 530.605 1019.93 531.922 1021.68 C 535.678 1026.61 541.235 1029.84 547.376 1030.68 C 554.607 1031.63 571.413 1031.25 579.304 1031.25 L 636.419 1031.24 L 833.327 1031.26 L 1219.39 1031.22 C 1284.66 1031.2 1349.91 1031.23 1415.21 1031.03 C 1438.4 1030.96 1438.55 1016.33 1438.66 997.277 C 1438.7 991.02 1438.6 984.528 1438.65 978.263 L 1439.21 911.25 L 1439.44 555.126 C 1439.62 529.374 1439.64 503.62 1439.51 477.868 C 1439.43 468.653 1438.48 450.689 1438.89 442.343 C 1439.07 438.843 1439.83 435.399 1441.16 432.156 C 1451.96 405.854 1488.56 416.936 1490.12 428.769 C 1493.78 456.396 1492.25 521.532 1492.21 547.233 L 1492.21 837.848 L 1492.26 954.854 C 1492.31 975.57 1492.85 997.002 1492.07 1017.51 C 1490.5 1040 1480.42 1058.67 1461.99 1071.49 C 1439.6 1087.08 1418.02 1085.37 1392.28 1085.42 L 1338.27 1085.46 L 1138.59 1085.63 L 743.476 1085.27 L 614.308 1085.24 C 581.742 1085.26 533.682 1090.42 506.668 1072.54 C 490.873 1061.98 480.013 1045.48 476.554 1026.8 C 473.813 1012.76 474.985 956.524 474.89 938.415 L 474.764 716.348 L 474.658 268.493 C 474.665 210.998 466.437 153.921 540.225 140.346 z"></path><path fill="currentColor" d="M 587.6 499.532 L 640.487 499.769 L 704.697 648.041 C 705.46 631.836 704.741 615.233 704.744 598.944 C 704.973 565.893 704.855 532.841 704.389 499.792 L 756.083 500.114 L 756.293 760.537 C 740.189 760.712 720.633 761.331 704.651 760.719 C 687.264 725.463 671.929 687.186 654.678 651.666 C 651.523 645.17 641.963 621.335 638.915 616.787 C 634.219 620.787 640.647 753.252 636.414 759.765 L 632.75 761.232 L 631.762 760.938 C 621.379 759.861 599.499 760.568 588.017 760.444 L 587.6 499.532 z"></path><path fill="currentColor" d="M 810.03 496.329 C 810.95 496.235 811.86 496.157 812.78 496.095 C 871.78 492.154 895.94 521.312 898.73 577.222 C 883 577.955 863.28 577.455 847.24 577.492 C 847.19 575.989 847.11 574.487 846.99 572.987 C 846.43 565.332 843.58 556.195 837.21 551.647 C 811.18 533.056 782.429 564.965 806.06 587.994 C 813.31 595.053 826.54 599.423 835.77 603.969 C 849.33 610.005 861.75 616.046 874.06 624.509 C 908.74 648.348 910.01 705.245 886.33 737.216 C 872.52 755.853 852.92 761.96 830.58 764.9 C 829.11 764.981 827.63 765.041 826.16 765.081 C 768.896 766.664 741.764 738.374 740.348 681.711 C 757.725 681.587 775.102 681.678 792.477 681.983 C 794.262 731.697 854.29 721.457 847.36 684.246 C 843.09 661.309 795.046 651.568 776.973 637.806 C 761.476 626.005 749.438 614.337 745.788 593.006 C 737.777 542.474 757.994 505.42 810.03 496.329 z"></path><path fill="currentColor" d="M 985.459 500.105 C 997.949 499.342 1018.001 500.02 1031.232 500.015 L 1124.129 499.979 C 1123.81 517.783 1123.642 535.589 1123.625 553.396 L 1040.465 553.454 C 1040.917 570.662 1041.166 587.875 1041.21 605.089 C 1065.26 604.981 1089.31 605.098 1113.358 605.44 C 1113.286 622.823 1113.531 640.205 1114.095 657.579 L 1093.896 657.29 L 1040.726 657.277 C 1040.996 691.685 1041.094 726.094 1041.02 760.503 C 1024.354 761.205 1002.444 760.78 985.691 760.588 C 984.85 734.095 985.673 706.251 985.577 679.623 L 985.459 500.105 z"></path><path fill="currentColor" d="M 1109.29 499.845 L 1165.6 499.949 C 1170.19 534.794 1175.95 569.379 1180.63 604.252 C 1182.49 614.149 1186.4 661.393 1190.41 666.477 C 1192.29 664.667 1203.16 591.147 1204.56 582.858 C 1209.63 554.253 1214.36 528.931 1218.41 499.95 C 1234.74 499.579 1252.34 499.913 1268.77 499.918 C 1269.81 512.121 1275.08 549.424 1277.88 561.644 C 1278.98 575.766 1290.73 656.159 1295.15 666.607 C 1296.76 653.604 1299.59 641.169 1301.23 628.333 C 1306.73 586.483 1312.52 541.467 1319.91 499.935 C 1336.23 499.962 1354.66 499.555 1370.79 500.079 C 1365.01 526.449 1361.44 550.852 1356.84 577.341 L 1342.45 655.885 C 1336.97 686.389 1326.91 730.668 1324.07 760.33 C 1307.24 760.431 1284.27 761.294 1267.96 760.546 C 1264.44 727.161 1256.64 693.489 1251.24 660.346 C 1250.51 655.835 1249.87 650.347 1248.92 645.981 C 1249.46 640.275 1243.84 612.65 1242.27 605.854 C 1240.33 612.597 1235.81 629.354 1236.24 636.01 C 1227.81 673.379 1222.51 712.777 1215.38 750.474 C 1214.44 755.414 1214.92 758.836 1210.29 760.973 L 1208.18 760.59 C 1191.82 759.984 1173.08 760.402 1156.54 760.392 C 1152.11 733.611 1145.89 704.99 1140.9 678.077 C 1129.52 618.819 1118.98 559.402 1109.29 499.845 z"></path><path fill="currentColor" d="M 1404.33 51.3557 C 1405.56 51.3099 1406.78 51.2792 1408.01 51.2636 C 1412.15 51.2151 1415.24 51.3353 1419.19 52.5844 C 1447.82 61.653 1444.59 91.8808 1444.64 115.704 C 1444.68 134.021 1444.5 151.812 1444.36 169.852 C 1473.92 170.48 1508.12 168.199 1537.34 171.081 C 1562.11 173.524 1572.96 210.461 1554.19 229.529 C 1549.48 234.233 1543.55 237.524 1537.07 239.031 C 1528.49 241.007 1507.31 240.232 1497.11 240.172 L 1444.01 240.073 C 1443.76 259.118 1444.36 278.428 1444.26 297.492 C 1444.21 306.376 1444.85 319.521 1443.57 327.999 C 1442.73 333.581 1440.76 338.933 1437.78 343.728 C 1431.88 353.023 1424.28 357.256 1413.82 359.62 C 1412.65 359.651 1411.48 359.669 1410.31 359.673 C 1400.21 359.702 1391.57 357.052 1384.32 349.699 C 1379.54 344.763 1376.27 338.557 1374.92 331.819 C 1373.05 322.855 1373.74 303.266 1373.79 292.93 L 1373.83 240.109 C 1350.03 239.575 1326.01 240.44 1302.19 240.231 C 1295.3 240.17 1288.07 240.597 1281.3 239.23 C 1274.72 237.934 1268.65 234.817 1263.76 230.236 C 1250.41 217.521 1249.59 193.688 1262.97 180.636 C 1268.04 175.785 1274.35 172.443 1281.21 170.985 C 1289.88 169.092 1307.91 169.768 1317.51 169.788 L 1374.17 169.914 C 1373.59 142.24 1373.38 110.134 1374.63 82.3828 C 1375.36 66.245 1388.51 54.8599 1404.33 51.3557 z"></path></svg>
                    </button>
                    <div class="feed-create-divider"></div>
                    ${window.currentUserIsAdmin ? `<button type="button" class="feed-create-icon" id="editZipBtn" title="Enviar ZIP" aria-label="Enviar ZIP">
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 22H4c-1.103 0-2-.897-2-2V4c0-1.103.897-2 2-2h9.414L20 8.586V20c0 1.103-.897 2-2 2ZM4 4v16h14V9h-6V4H4Zm10 0v3h3l-3-3Z"/><path d="M5 10h4.5v1.3L7 14h2.5v1.5H5v-1.3l2.5-2.7H5V10Z"/><path d="M10.5 10H12v5.5h-1.5V10Z"/><path d="M13 10h2.7c1.2 0 1.8.7 1.8 1.8s-.6 1.8-1.8 1.8h-1.2v1.9H13V10Zm1.5 1.3v1h1c.3 0 .5-.2.5-.5s-.2-.5-.5-.5h-1Z"/><path d="M11 17h2v1h-2v-1Zm0 1.5h2v1h-2v-1Zm0 1.5h2v1h-2v-1Z"/></svg>
                    </button>` : ""}
                    <div class="feed-create-divider"></div>
                    <button type="button" class="feed-create-icon" id="editAddMediaBtn" title="Adicionar midia" aria-label="Adicionar midia">
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 20H4V6h9V4H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-9h-2v9zm-7.79-3.17l-1.96-2.36L5.5 18h11l-3.54-4.71zM20 4V1h-2v3h-3c.01.01 0 2 0 2h3v2.99c.01.01 2 0 2 0V6h3V4h-3z"/></svg>
                    </button>
                    <button type="button" class="feed-create-send" id="editPostSave" title="Salvar" aria-label="Salvar">
<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
                </div>
        `;
        document.body.appendChild(modal);

        const previewsContainer = modal.querySelector("#editMediaPreviews");
        const fileInput = modal.querySelector("#editFileInput");
        const zipInput = modal.querySelector("#editZipInput");
        const saveBtn = modal.querySelector("#editPostSave");

        modal.querySelector(".edit-post-close").onclick = () => modal.remove();

        modal.querySelector("#editNsfwToggle").onclick = e => {
            editNsfwActive = !editNsfwActive;
            e.currentTarget.classList.toggle("active", editNsfwActive);
        };

        modal.querySelector("#editEleicaoToggle").onclick = e => {
            editEleicaoActive = !editEleicaoActive;
            e.currentTarget.classList.toggle("active", editEleicaoActive);
        };

        modal.querySelector("#editAddMediaBtn").onclick = () => fileInput.click();
        const editZipBtn = modal.querySelector("#editZipBtn");
        if (editZipBtn) {
            editZipBtn.onclick = () => {
                if (!window.currentUserIsAdmin) {
                    showAlert("Apenas administradores podem enviar arquivos ZIP.");
                    return;
                }
                zipInput?.click();
            };
        }

        if (zipInput) {
            zipInput.onchange = () => {
                if (!window.currentUserIsAdmin) {
                    showAlert("Apenas administradores podem enviar arquivos ZIP.");
                    zipInput.value = "";
                    return;
                }
                const file = zipInput.files[0];
                if (!file) return;
                selectedZip = file;
                renderEditPreviews();
            };
        }

        function renderEditPreviews() {
            previewsContainer.innerHTML = "";

            // Chip do ZIP selecionado
            if (selectedZip) {
                const chip = document.createElement("div");
                chip.className = "composer-preview-item";
                chip.style.cssText = "position: relative; width: 60px; height: 60px; border-radius: 4px; overflow: hidden; background: var(--surface-2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px; box-sizing: border-box;";
                const icon = document.createElement("span");
                icon.className = "ico ico-zip";
                icon.style.cssText = "opacity: .7;";
                const label = document.createElement("span");
                label.textContent = selectedZip.name;
                label.style.cssText = "font-size: 0.5rem; color: var(--text-secondary); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center;";
                chip.appendChild(icon);
                chip.appendChild(label);
                const removeBtn = document.createElement("button");
                removeBtn.className = "composer-remove";
                removeBtn.type = "button";
                removeBtn.innerHTML = "&times;";
                removeBtn.onclick = () => {
                    selectedZip = null;
                    renderEditPreviews();
                };
                chip.appendChild(removeBtn);
                previewsContainer.appendChild(chip);
            }

            // Renderiza mídias atuais
            mediaList.forEach(m => {
                // Posts de texto não têm mídia para pré-visualizar (o texto é editado no textarea)
                if (m.media_type === "text") return;
                const div = document.createElement("div");
                div.className = "composer-preview-item";
                div.style.cssText = "position: relative; width: 60px; height: 60px; border-radius: 4px; overflow: hidden; background: #000;";
                if (m.media_type === "video") {
                    const vid = document.createElement("video");
                    vid.src = `/images/${m.name}`;
                    vid.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(vid);
                } else {
                    const img = document.createElement("img");
                    img.src = `/images/${m.name}`;
                    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(img);
                }
                const removeBtn = document.createElement("button");
                removeBtn.className = "composer-remove";
                removeBtn.type = "button";
                removeBtn.innerHTML = "&times;";
                removeBtn.onclick = () => {
                    mediaToRemove.push(m.name);
                    mediaList = mediaList.filter(x => x.name !== m.name);
                    renderEditPreviews();
                };
                div.appendChild(removeBtn);
                previewsContainer.appendChild(div);
            });

            // Renderiza novas mídias adicionadas
            newFiles.forEach((file, idx) => {
                const div = document.createElement("div");
                div.className = "composer-preview-item";
                div.style.cssText = "position: relative; width: 60px; height: 60px; border-radius: 4px; overflow: hidden; background: #000;";
                const isVideo = file.type.startsWith("video/");
                if (isVideo) {
                    const vid = document.createElement("video");
                    vid.src = URL.createObjectURL(file);
                    vid.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(vid);
                } else {
                    const img = document.createElement("img");
                    img.src = URL.createObjectURL(file);
                    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(img);
                }
                const removeBtn = document.createElement("button");
                removeBtn.className = "composer-remove";
                removeBtn.type = "button";
                removeBtn.innerHTML = "&times;";
                removeBtn.onclick = () => {
                    newFiles.splice(idx, 1);
                    renderEditPreviews();
                };
                div.appendChild(removeBtn);
                previewsContainer.appendChild(div);
            });
        }

        fileInput.onchange = () => {
            const files = Array.from(fileInput.files);
            if (!files.length) return;
            for (const file of files) {
                if (file.type.startsWith("video/")) {
                    const vid = document.createElement("video");
                    vid.preload = "metadata";
                    vid.src = URL.createObjectURL(file);
                    vid.onloadedmetadata = () => {
                        if (vid.duration > 120) {
                            showAlert("Vídeo muito longo (máximo 2 minutos).");
                            URL.revokeObjectURL(vid.src);
                            return;
                        }
                        newFiles.push(file);
                        renderEditPreviews();
                    };
                } else {
                    newFiles.push(file);
                }
            }
            renderEditPreviews();
            fileInput.value = "";
        };

        renderEditPreviews();

        saveBtn.addEventListener("click", async () => {
            const caption = modal.querySelector("#editPostCaption").value.trim();
            saveBtn.disabled = true;

            // mediaList já exclui os itens marcados para remoção
            const textMediaItem = (postData.media || []).find(m => m.media_type === "text");
            const wasTextPost = !!textMediaItem;
            const realMediaCount = mediaList.filter(m => m.media_type !== "text").length;
            const finalMediaCount = realMediaCount + newFiles.length;

            if (finalMediaCount === 0 && !caption) {
                showAlert("O post precisa de pelo menos uma mídia ou um texto.");
                saveBtn.disabled = false;
                return;
            }

            try {
                if (finalMediaCount === 0 && !wasTextPost) {
                    // Sem mídias restantes: converte o post em post de texto
                    const res = await fetch(`/api/my-posts/${encodeURIComponent(name)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            caption,
                            nsfw: editNsfwActive,
                            eleicao: editEleicaoActive,
                            convert_to_text: true
                        }),
                        credentials: "include"
                    });
                    const data = await res.json();
                    if (data.ok) {
                        modal.remove();
                        if (typeof loadCarousel === "function") {
                            await loadCarousel(true);
                        } else {
                            location.reload();
                        }
                    }
                    return;
                }

                // 1. Upload de novas mídias primeiro (evita bloqueio de "última mídia" nas remoções)
                let uploadedFirstName = null;
                if (newFiles.length > 0) {
                    const form = new FormData();
                    form.append("post_id", postData.post_id);
                    form.append("caption", caption);
                    form.append("nsfw", editNsfwActive ? "1" : "0");
                    form.append("eleicao", editEleicaoActive ? "1" : "0");
                    
                    // Reaproveita função de compressão se disponível
                    const compressor = typeof compressImage === "function" ? compressImage : async (f) => f;
                    
                    for (const file of newFiles) {
                        if (file.type.startsWith("video/")) {
                            form.append("images", file, file.name);
                        } else {
                            try {
                                const compressed = await compressor(file);
                                let name = file.name;
                                if (compressed !== file) {
                                    const ext = file.type === "image/png" ? ".png" : ".jpg";
                                    name = file.name.replace(/\.[^.]+$/, "") + ext;
                                }
                                form.append("images", compressed, name);
                            } catch {
                                form.append("images", file, file.name);
                            }
                        }
                    }
                    if (window.currentUserIsAdmin && selectedZip) {
                        form.append("zip", selectedZip);
                    }
                    const upRes = await fetch("/api/upload", {
                        method: "POST",
                        body: form,
                        credentials: "include"
                    });
                    const upData = await upRes.json();
                    if (Array.isArray(upData.saved) && upData.saved.length > 0) {
                        uploadedFirstName = upData.saved[0];
                    }
                }

                // 2. Post de texto promovido a post com mídia: remove a linha de texto
                //    (apenas se o upload realmente criou as novas linhas)
                if (wasTextPost && textMediaItem && uploadedFirstName) {
                    await fetch(`/api/my-images/${encodeURIComponent(textMediaItem.name)}/single`, {
                        method: "DELETE",
                        credentials: "include"
                    });
                }

                // 3. Remove mídias deletadas
                if (mediaToRemove.length > 0) {
                    await Promise.all(mediaToRemove.map(imgName =>
                        fetch(`/api/my-images/${encodeURIComponent(imgName)}/single`, {
                            method: "DELETE",
                            credentials: "include"
                        })
                    ));
                }

                // 4. Atualiza dados do post (caption, nsfw, eleicao)
                //    Se a linha original era de texto e foi removida na promoção,
                //    o PUT passa a mirar a primeira mídia recém-enviada.
                const putTarget = uploadedFirstName || name;
                const res = await fetch(`/api/my-posts/${encodeURIComponent(putTarget)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        caption,
                        nsfw: editNsfwActive,
                        eleicao: editEleicaoActive
                    }),
                    credentials: "include"
                });
                const data = await res.json();
                
                if (data.ok) {
                    modal.remove();
                    if (typeof loadCarousel === "function") {
                        await loadCarousel(true);
                    } else {
                        location.reload();
                    }
                }
            } catch (err) {
                console.error("Erro ao salvar post:", err);
                saveBtn.disabled = false;
            }
        });
        return;
    }

    const capClick = e.target.closest(".feed-caption-toggle, .feed-caption");
    if (capClick) {
        e.stopPropagation();
        // não alterna se o usuário estava selecionando texto
        if (window.getSelection && String(window.getSelection()).length) return;

        const card = capClick.closest(".feed-card");
        const cap = card?.querySelector(".feed-caption");
        const btn = card?.querySelector(".feed-caption-toggle");
        // só alterna se o post tiver legenda longa (possui botão de toggle)
        if (!cap || !btn) return;

        const nowClamped = cap.classList.toggle("clamped");
        btn.textContent = nowClamped ? "Ver mais" : "Ver menos";
        return;
    }

    const postDeleteBtn = e.target.closest(".post-delete, .feed-delete");
    if (postDeleteBtn) {
        e.stopPropagation();
        const name = postDeleteBtn.dataset.name;
        const escName = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name.replace(/["\\]/g, "\\$&");
        askConfirm("Apagar este post?").then(ok => {
            if (!ok) return;
            // remoção otimista: some na hora (evita bug do portal fora do card)
            const optimisticCards = document.querySelectorAll(`.feed-card[data-name="${escName}"]`);
            // também tenta por post_id caso seja post multi
            let postId = null;
            try { postId = postDeleteBtn.closest(".feed-card")?.dataset.postId || null; } catch {}
            if (!postId) {
                const found = allImages.find(x => x.name === name);
                if (found) postId = found.post_id;
            }
            fetch(`/api/my-images/${encodeURIComponent(name)}`, { method: "DELETE", credentials: "include" })
                .then(res => res.json())
                .then(data => {
                    if (data.ok) {
                        allImages = allImages.filter(x => x.name !== name && x.post_id !== postId);
                        // remove do DOM tanto no feed quanto no perfil (postsGrid)
                        optimisticCards.forEach(el => el.remove());
                        if (postId) {
                            document.querySelectorAll(`.feed-card[data-post-id="${escName}"]`).forEach(el => el.remove());
                            // fallback: remove por postId real
                            const escPid = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(postId) : postId;
                            document.querySelectorAll(`.feed-card[data-post-id="${escPid}"]`).forEach(el => el.remove());
                        }
                        // fallback direto se optimistic não pegou (portal fora do card)
                        const leftover = document.querySelector(`.feed-card[data-name="${escName}"]`);
                        if (leftover) leftover.remove();
                        if (document.getElementById("feedView")) renderFeed();
                        try { if (typeof renderGrid === "function") renderGrid(); } catch {}
                    } else {
                        // reverte se falhou (recarrega)
                        if (document.getElementById("feedView")) renderFeed();
                        else location.reload();
                    }
                })
                .catch(() => {
                    optimisticCards.forEach(el => el.style.opacity = "0.5");
                });
            // some na hora mesmo antes da resposta
            optimisticCards.forEach(el => { el.style.transition = "opacity 0.2s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 220); });
            if (postId) {
                const escPid = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(postId) : postId;
                document.querySelectorAll(`.feed-card[data-post-id="${escPid}"]`).forEach(el => { el.style.transition = "opacity 0.2s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 220); });
            }
        });
        return;
    }

    const likeBtn = e.target.closest(".feed-like");
    if (likeBtn) { toggleFeedLike(likeBtn); return; }
    const likersEl = e.target.closest(".feed-likes");
    if (likersEl) { toggleFeedLikers(likersEl); return; }
    const commentBtn = e.target.closest(".feed-comment-toggle");
    if (commentBtn) { toggleFeedComments(commentBtn); return; }
    const dlBtn = e.target.closest(".feed-download");
    if (dlBtn) { downloadFeedImage(dlBtn.dataset.name); return; }
}

function downloadFeedImage(name) {
    if (!name) return;
    const a = document.createElement("a");
    a.href = `/images/${name}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

const RECENT_GIFS_KEY = "mikanet_recent_gifs";
const RECENT_GIFS_MAX = 30;

function normalizeRecentEntry(entry) {
    if (entry && typeof entry === "object" && typeof entry.name === "string" && entry.name) {
        return { name: entry.name, thumb: entry.thumb ? String(entry.thumb) : null };
    }
    if (typeof entry === "string" && entry) {
        return { name: entry, thumb: null };
    }
    return null;
}

function getRecentGifs() {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_GIFS_KEY) || "[]");
        if (!Array.isArray(list)) return [];
        return list.map(normalizeRecentEntry).filter(Boolean);
    } catch { return []; }
}

function addRecentFigurinha(name, thumb) {
    if (!name || typeof name !== "string") return;
    try {
        const clean = getRecentGifs().filter(entry => entry.name !== name);
        clean.unshift(normalizeRecentEntry({ name, thumb: thumb || null }));
        if (clean.length > RECENT_GIFS_MAX) clean.length = RECENT_GIFS_MAX;
        localStorage.setItem(RECENT_GIFS_KEY, JSON.stringify(clean));
    } catch {}
}

function fileToCompressedThumb(file, maxSize = 180, quality = 0.72) {
    return new Promise((resolve) => {
        try {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                try { resolve(canvas.toDataURL("image/jpeg", quality)); }
                catch { resolve(null); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        } catch { resolve(null); }
    });
}

let gifPickerEl = null;

function closeGifPicker() {
    if (gifPickerEl) {
        gifPickerEl.remove();
        gifPickerEl = null;
    }
}

function setReuseGif(form, name) {
    if (!form) return;
    const inp = form.querySelector(".comment-media-input");
    if (inp) inp.value = "";
    form.dataset.reuseGif = name;
    const preview = form.querySelector(".comment-media-preview");
    if (preview) {
        preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="/comment-media/${encodeURIComponent(name)}" style="max-width:120px;max-height:80px;border-radius:8px;object-fit:cover;"><button type="button" class="comment-media-remove" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:#000;color:#fff;cursor:pointer;">×</button></div>`;
        preview.hidden = false;
        const rm = preview.querySelector(".comment-media-remove");
        rm.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            delete form.dataset.reuseGif;
            preview.hidden = true;
            preview.innerHTML = "";
            updateFeedCommentSendBtn(form);
        };
    }
    updateFeedCommentSendBtn(form);
}

function removeRecentFigurinha(name) {
    try {
        const clean = getRecentGifs().filter(e => e.name !== name);
        localStorage.setItem(RECENT_GIFS_KEY, JSON.stringify(clean));
    } catch {}
}

function renderRecentFigurinhas(grid, form) {
    const recents = getRecentGifs();
    grid.innerHTML = "";
    recents.forEach(entry => {
        const it = document.createElement("button");
        it.type = "button";
        it.className = "comment-gif-item";
        it.title = (entry.name || "") + " — toque longo para remover";
        const src = entry.thumb || "/comment-media/" + encodeURIComponent(entry.name);
        it.innerHTML = `<img src="${src}" alt="" decoding="async">`;
        it.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (it._longPress) { it._longPress = false; return; }
            closeGifPicker();
            setReuseGif(form, entry.name);
        });
        bindHoldRemove(it, entry.name, grid, form);
        grid.appendChild(it);
    });
    return recents.length;
}

function bindHoldRemove(btn, name, grid, form) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const start = (e) => {
        btn._longPress = false;
        startX = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
        startY = e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY);
        cancel();
        timer = setTimeout(() => {
            timer = null;
            btn._longPress = true;
            promptRemoveFigurinha(grid, form, name);
        }, 500);
    };
    const move = (e) => {
        const x = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
        const y = e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY);
        if (x != null && y != null && (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10)) cancel();
    };
    btn.addEventListener("touchstart", start, { passive: true });
    btn.addEventListener("touchmove", move, { passive: true });
    btn.addEventListener("touchend", cancel);
    btn.addEventListener("touchcancel", cancel);
    btn.addEventListener("mousedown", start);
    btn.addEventListener("mousemove", move);
    btn.addEventListener("mouseup", cancel);
    btn.addEventListener("mouseleave", cancel);
}

async function promptRemoveFigurinha(grid, form, name) {
    const ok = await showConfirm("Remover esta figurinha dos recentes?", "Remover figurinha", "Excluir", "Cancelar", true);
    if (!ok) return;
    removeRecentFigurinha(name);
    if (grid && grid.isConnected) {
        if (renderRecentFigurinhas(grid, form) === 0) closeGifPicker();
    }
}

function openGifPicker(btn) {
    if (gifPickerEl) { closeGifPicker(); return; }
    const recents = getRecentGifs();
    const form = btn.closest("form");
    const inp = form && form.querySelector(".comment-media-input");
    if (!recents.length) {
        if (inp) { inp.accept = "image/*,image/webp,.gif"; inp.click(); }
        return;
    }
    gifPickerEl = document.createElement("div");
    gifPickerEl.className = "comment-gif-picker";
    gifPickerEl.style.position = "fixed";
    gifPickerEl.style.zIndex = "900";
    gifPickerEl.style.width = "calc(100vw - 24px)";
    gifPickerEl.style.maxWidth = "520px";
    gifPickerEl.style.boxSizing = "border-box";
    gifPickerEl.innerHTML = `
        <div class="comment-gif-picker-head">
            <span>Figurinhas recentes</span>
            <button type="button" class="comment-gif-picker-new">Nova</button>
        </div>
        <div class="comment-gif-picker-grid"></div>`;
    const grid = gifPickerEl.querySelector(".comment-gif-picker-grid");
    renderRecentFigurinhas(grid, form);
    document.body.appendChild(gifPickerEl);

    const pickerRect = gifPickerEl.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const pickerW = pickerRect.width || 300;
    const pickerH = pickerRect.height || 200;
    let left = btnRect.left + btnRect.width / 2 - pickerW / 2;
    left = Math.max(8, Math.min(window.innerWidth - pickerW - 8, left));
    let top = btnRect.top - pickerH - 8;
    if (top < 8) top = btnRect.bottom + 8;
    gifPickerEl.style.left = left + "px";
    gifPickerEl.style.top = top + "px";

    gifPickerEl.querySelector(".comment-gif-picker-new").addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeGifPicker();
        if (inp) { inp.accept = "image/*,image/webp,.gif"; inp.click(); }
    });
}

document.addEventListener("click", (e) => {
    if (gifPickerEl && !gifPickerEl.contains(e.target) && !e.target.closest(".comment-gif-btn")) {
        closeGifPicker();
    }
}, true);

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && gifPickerEl) {
        closeGifPicker();
        if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
    }
});

let feedReplyParentId = null;

async function onFeedSubmit(e) {
    if (!e.target.matches(".feed-comment-form")) return;
    e.preventDefault();
    if (typeof mentionDropdown !== "undefined" && mentionDropdown && typeof mentionUsers !== "undefined" && mentionUsers.length) return;
    const form = e.target;
    const textarea = form.querySelector("textarea");
    const text = textarea.value.trim();
    const mediaInput = form.querySelector(".comment-media-input");
    const submitFile = (mediaInput && mediaInput.files && mediaInput.files[0]) || form._pastedMedia || null;
    const hasMedia = !!submitFile;
    const reuseGif = form.dataset.reuseGif || "";
    if (!text && !hasMedia && !reuseGif) return;
    const card = form.closest(".feed-card");
    const name = card.dataset.name;
    let fetchOpts = {};
    if (hasMedia) {
        const fd = new FormData();
        fd.append("text", text);
        if (feedReplyParentId) fd.append("parent_id", feedReplyParentId);
        fd.append("media", submitFile);
        fetchOpts = { method: "POST", body: fd };
    } else {
        const body = { text };
        if (reuseGif) { body.media_name = reuseGif; body.media_type = "image"; }
        if (feedReplyParentId) body.parent_id = feedReplyParentId;
        fetchOpts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    }
    if (feedReplyParentId) {
        feedReplyParentId = null;
        const indicator = card.querySelector(".feed-reply-indicator");
        if (indicator) indicator.classList.remove("visible");
        textarea.placeholder = "Adicione um comentario...";
    }
    if (reuseGif) {
        delete form.dataset.reuseGif;
        const preview = form.querySelector(".comment-media-preview");
        if (preview) { preview.hidden = true; preview.innerHTML = ""; }
    }
    try {
        const res = await fetch(`/api/comments/${encodeURIComponent(name)}`, fetchOpts);
        if (res.ok) {
            const d = await res.json().catch(() => null);
            const mediaName = d && d.media_name;
            if (mediaName) {
                const isGif = mediaName.toLowerCase().endsWith(".gif");
                const isImage = submitFile && submitFile.type && submitFile.type.startsWith("image/");
                if (isGif) {
                    addRecentFigurinha(mediaName);
                } else if (isImage) {
                    const thumb = await fileToCompressedThumb(submitFile);
                    addRecentFigurinha(mediaName, thumb);
                }
            }
            textarea.value = "";
            if (mediaInput) { mediaInput.value = ""; const prev=form.querySelector(".comment-media-preview"); if(prev){ prev.hidden=true; prev.innerHTML=""; } }
            form._pastedMedia = null;
            autoResizeFeed(textarea);
            await loadFeedComments(card);
        } else {
            const d=await res.json().catch(()=>null);
            if(d?.error) showAlert(d.error, "Erro");
        }
    } catch { /* ignore */ }
    if (typeof hideMentionDropdown === "function") hideMentionDropdown();
}

function onFeedInput(e) {
    if (e.target.matches(".feed-comment-form textarea") && typeof handleMentionInput === "function") {
        handleMentionInput(e);
    }
    if (e.target.matches(".feed-comment-form textarea")) {
        autoResizeFeed(e.target);
        updateFeedCommentSendBtn(e.target.closest("form"));
    }
}

function updateFeedCommentSendBtn(form) {
    const btn = form.querySelector(".feed-comment-send");
    if (!btn) return;
    const text = form.querySelector("textarea").value.trim();
    const mediaInput = form.querySelector(".comment-media-input");
    const hasMedia = mediaInput && mediaInput.files && mediaInput.files[0];
    const hasReuse = !!(form.dataset.reuseGif);
    const hasPasted = !!form._pastedMedia;
    btn.disabled = !text && !hasMedia && !hasReuse && !hasPasted;
}

function onFeedKeydown(e) {
    if (e.target.matches(".feed-comment-form textarea") && typeof handleMentionKeydown === "function") {
        const wasOpen = typeof mentionDropdown !== "undefined" && mentionDropdown !== null;
        handleMentionKeydown(e);
        if (wasOpen && e.key === "Enter") return;
    }
    if (e.target.matches(".feed-comment-form textarea") && e.key === "Enter" && !e.shiftKey) {
        if (typeof mentionDropdown !== "undefined" && mentionDropdown) return;
        e.preventDefault();
        e.target.closest("form").requestSubmit();
    }
}

function bindFeedEvents(root) {
    root.addEventListener("click", onFeedClick);
    root.addEventListener("submit", onFeedSubmit);
    root.addEventListener("input", onFeedInput);
    root.addEventListener("keydown", onFeedKeydown);
root.addEventListener("paste", (e) => {
        if (e.target.matches(".feed-comment-form textarea")) {
            const items = Array.from(e.clipboardData?.items || []);
            const fileItem = items.find(i => i.type.startsWith("image/") || i.type.startsWith("video/"));
            if (fileItem) {
                const file = fileItem.getAsFile();
                if (file) {
                    e.preventDefault();
                    const form = e.target.closest("form");
                    const inp = form.querySelector(".comment-media-input");
                    const preview = form?.querySelector(".comment-media-preview");
                    if (!inp || !preview) return;
                    if (file.size > 10 * 1024 * 1024) { showAlert("Arquivo muito grande (máx 10MB)"); return; }
                    const isVideo = file.type.startsWith("video/");
                    let url = null;
                    const attach = () => {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        try { inp.files = dt.files; } catch { /* ignore */ }
                        const mimeExts = {
                            "image/png": ".png",
                            "image/jpeg": ".jpg",
                            "image/jpg": ".jpg",
                            "image/webp": ".webp",
                            "image/avif": ".avif",
                            "image/gif": ".gif",
                            "video/mp4": ".mp4",
                            "video/webm": ".webm",
                            "video/quicktime": ".mov"
                        };
                        const hasExt = file.name && file.name.includes(".") && !file.name.endsWith(".blob");
                        const ext = mimeExts[file.type] || (hasExt ? "." + file.name.split(".").pop().toLowerCase() : ".png");
                        const filename = `pasted_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`;
                        const fileWithName = new File([file], filename, { type: file.type || "image/png" });
                        form._pastedMedia = fileWithName;
                        const rm = () => {
                            form._pastedMedia = null;
                            preview.hidden = true;
                            preview.innerHTML = "";
                            updateFeedCommentSendBtn(form);
                        };
                        if (isVideo) {
                            preview.innerHTML = `<div style="position:relative;display:inline-block;"><video src="${url}" style="max-width:120px;max-height:80px;border-radius:8px;" muted></video><button type="button" class="comment-media-remove" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:#000;color:#fff;cursor:pointer;">×</button></div>`;
                            preview.hidden = false;
                            updateFeedCommentSendBtn(form);
                            preview.querySelector(".comment-media-remove").onclick = rm;
                        } else {
                            preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${url}" style="max-width:120px;max-height:80px;border-radius:8px;object-fit:cover;"><button type="button" class="comment-media-remove" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:#000;color:#fff;cursor:pointer;">×</button></div>`;
                            preview.hidden = false;
                            updateFeedCommentSendBtn(form);
                            preview.querySelector(".comment-media-remove").onclick = () => { URL.revokeObjectURL(url); url = null; rm(); };
                        }
                    };
                    if (isVideo) {
                        url = URL.createObjectURL(file);
                        const v = document.createElement("video");
                        v.preload = "metadata";
                        v.src = url;
                        v.onloadedmetadata = () => {
                            if (v.duration > 120) { showAlert("Vídeo muito longo (máx 2min)"); URL.revokeObjectURL(url); url = null; return; }
                            attach();
                        };
                        if (v.duration !== undefined && !isNaN(v.duration)) {
                            if (v.duration > 120) { showAlert("Vídeo muito longo (máx 2min)"); URL.revokeObjectURL(url); url = null; return; }
                            else { attach(); }
                        }
                    } else {
                        url = URL.createObjectURL(file);
                        const img = document.createElement("img");
                        img.onload = () => {
                            attach();
                            URL.revokeObjectURL(url);
                        };
                        img.onerror = () => {
                            showAlert("Imagem inválida");
                            URL.revokeObjectURL(url);
                            url = null;
                            rm();
                        };
                        img.src = url;
                    }
                }
            }
        }
    });
    root.addEventListener("click", (e)=>{
        const gifBtn = e.target.closest(".comment-gif-btn");
        if (gifBtn) {
            openGifPicker(gifBtn);
            return;
        }
        const mediaBtn = e.target.closest(".comment-media-btn");
        if (mediaBtn) {
            const form = mediaBtn.closest("form");
            const inp = form?.querySelector(".comment-media-input");
            if (inp) { inp.accept = "image/*,image/webp,video/mp4,video/webm,video/quicktime,.gif"; inp.click(); }
            return;
        }
    });
    root.addEventListener("change", (e)=>{
        if (!e.target.matches(".comment-media-input")) return;
        const inp = e.target;
        const file = inp.files[0];
        const form = inp.closest("form");
        const preview = form?.querySelector(".comment-media-preview");
        if (!file || !preview) return;
        if (file.size > 10 * 1024 * 1024) { showAlert("Arquivo muito grande (máx 10MB)"); inp.value=""; preview.hidden=true; updateFeedCommentSendBtn(form); return; }
        const isVideo = file.type.startsWith("video/");
        if (isVideo) {
            const url = URL.createObjectURL(file);
            const v = document.createElement("video");
            v.preload = "metadata";
            v.src = url;
            v.onloadedmetadata = ()=>{
                if (v.duration > 120) { showAlert("Vídeo muito longo (máx 2min)"); inp.value=""; preview.hidden=true; URL.revokeObjectURL(url); updateFeedCommentSendBtn(form); }
                else {
                    preview.innerHTML = `<div style="position:relative;display:inline-block;"><video src="${url}" style="max-width:120px;max-height:80px;border-radius:8px;" muted></video><button type="button" class="comment-media-remove" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:#000;color:#fff;cursor:pointer;">×</button></div>`;
                    preview.hidden = false;
                    updateFeedCommentSendBtn(form);
                    preview.querySelector(".comment-media-remove").onclick = ()=>{ inp.value=""; preview.hidden=true; URL.revokeObjectURL(url); updateFeedCommentSendBtn(form); };
                }
            };
        } else {
            const url = URL.createObjectURL(file);
            preview.innerHTML = `<div style="position:relative;display:inline-block;"><img src="${url}" style="max-width:120px;max-height:80px;border-radius:8px;object-fit:cover;"><button type="button" class="comment-media-remove" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:#000;color:#fff;cursor:pointer;">×</button></div>`;
            preview.hidden = false;
            updateFeedCommentSendBtn(form);
            preview.querySelector(".comment-media-remove").onclick = ()=>{ inp.value=""; preview.hidden=true; URL.revokeObjectURL(url); updateFeedCommentSendBtn(form); };
        }
    });
}

const feedRootEl = document.getElementById("feedView");
if (feedRootEl) bindFeedEvents(feedRootEl);

function autoResizeFeed(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

if (document.getElementById("feedView")) loadCarousel();

/* === Feed card navigation (desktop) === */
(function () {
    const navUp = document.getElementById("feedNavUp");
    const navDown = document.getElementById("feedNavDown");
    if (!navUp || !navDown) return;

    let navIndex = -1; // -1 = sem cursor fixo (ressincroniza com rolagem manual)
    let navTimer = null;

    function getCards() {
        const container = document.getElementById("feedView") || document.getElementById("postsGrid");
        return container ? Array.from(container.querySelectorAll(".feed-card")) : [];
    }

    function navTargetIndex(index) {
        const n = sortedImages().length;
        if (!n) return -1;
        return Math.max(0, Math.min(n - 1, index));
    }

    function ensureRenderedUpTo(index) {
        const feed = document.getElementById("feedView");
        if (!feed) return;
        const list = sortedImages();
        let guard = 0;
        while (feedRenderedCount <= index && guard < list.length + 1) {
            if (!appendFeedBatch(feed, list)) break;
            guard++;
        }
    }

    function goTo(index) {
        const targetIdx = navTargetIndex(index);
        if (targetIdx < 0) return;
        const list = sortedImages();
        const item = list[targetIdx];
        if (!item) return;
        ensureRenderedUpTo(targetIdx);
        const card = document.querySelector(`.feed-card[data-name="${CSS.escape(item.name)}"]`);
        if (!card) return;
        navIndex = targetIdx;
        if (navTimer) clearTimeout(navTimer);
        navTimer = setTimeout(() => { navIndex = -1; }, 700);
        card.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function resyncFromScroll() {
        if (navIndex >= 0) return; // navegando; ignora scroll intermediário
        const cards = getCards();
        if (!cards.length) return;
        const threshold = window.scrollY + window.innerHeight * 0.3;
        let cur = 0;
        for (let i = cards.length - 1; i >= 0; i--) {
            if (cards[i].getBoundingClientRect().top + window.scrollY <= threshold) { cur = i; break; }
        }
        navIndex = cur;
    }

    window.addEventListener("scroll", resyncFromScroll, { passive: true });

    window.resetFeedNavIndex = () => { navIndex = -1; };

    navUp.addEventListener("click", () => {
        if (navIndex < 0) resyncFromScroll();
        goTo(navIndex - 1);
    });
    navDown.addEventListener("click", () => {
        if (navIndex < 0) resyncFromScroll();
        goTo(navIndex + 1);
    });
})();

/* === Real-time new posts polling === */
let lastPostTimestamp = "";
let pendingNewPosts = [];

function checkNewPosts() {
    if (!lastPostTimestamp) return;
    fetch(`/api/images/since?after=${encodeURIComponent(lastPostTimestamp)}`, { credentials: "include" })
        .then(r => r.json())
        .then(newPosts => {
            if (newPosts.length > 0) {
                pendingNewPosts = newPosts;
                showNewPostsBanner(newPosts.length);
            }
        })
        .catch(() => {});
}

function showNewPostsBanner(count) {
    let banner = document.getElementById("newPostsBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "newPostsBanner";
        banner.className = "new-posts-banner";
        banner.innerHTML = `<div class="new-posts-inner"><span class="new-posts-text"></span></div>`;
        banner.addEventListener("click", loadPendingPosts);
        const feed = document.getElementById("feedView");
        if (feed) {
            feed.parentNode.insertBefore(banner, feed);
        }
    }
    banner.querySelector(".new-posts-text").textContent = `${count} novo${count > 1 ? "s" : ""} post${count > 1 ? "s" : ""} \u2022 toque para ver`;
    banner.hidden = false;
}

function loadPendingPosts() {
    if (pendingNewPosts.length === 0) return;
    allImages = [...pendingNewPosts.filter(p => !allImages.some(x => x.post_id === p.post_id)), ...allImages];
    pendingNewPosts = [];
    updateLastTimestamp();
    renderFeed();
    renderGrid();
    const banner = document.getElementById("newPostsBanner");
    if (banner) banner.hidden = true;
}

function updateLastTimestamp() {
    if (allImages.length > 0) {
        const latest = allImages.reduce((a, b) => (a.created_at || "") > (b.created_at || "") ? a : b);
        lastPostTimestamp = latest.created_at || "";
    }
}

setInterval(checkNewPosts, 60000);

/* === Feed create post (compact) === */
let feedCreateFiles = [];
let feedCreateZip = null;
let feedCreateNsfw = false;
let feedCreateEleicao = false;

document.getElementById("feedCreateImg")?.addEventListener("click", () => {
    document.getElementById("feedCreateFile")?.click();
});

document.getElementById("feedCreateZipBtn")?.addEventListener("click", () => {
    if (!window.currentUserIsAdmin) {
        showAlert("Apenas administradores podem enviar arquivos ZIP.");
        return;
    }
    document.getElementById("feedCreateZip")?.click();
});

function setFeedCreateNsfw(active) {
    feedCreateNsfw = active;
    document.getElementById("feedCreateNsfwBtn")?.classList.toggle("active", active);
}

document.getElementById("feedCreateNsfwBtn")?.addEventListener("click", () => {
    setFeedCreateNsfw(!feedCreateNsfw);
});

function setFeedCreateEleicao(active) {
    feedCreateEleicao = active;
    document.getElementById("feedCreateEleicaoBtn")?.classList.toggle("active", active);
}

document.getElementById("feedCreateEleicaoBtn")?.addEventListener("click", () => {
    setFeedCreateEleicao(!feedCreateEleicao);
});

function clearFeedCreateZip() {
    feedCreateZip = null;
    const input = document.getElementById("feedCreateZip");
    if (input) input.value = "";
    const preview = document.getElementById("feedCreateZipPreview");
    if (preview) preview.hidden = true;
    const label = document.getElementById("feedCreateZipLabel");
    if (label) label.textContent = "Arquivo ZIP selecionado";
    const size = document.getElementById("feedCreateZipSize");
    if (size) size.textContent = "";
}

document.getElementById("feedCreateZip")?.addEventListener("change", () => {
    if (!window.currentUserIsAdmin) {
        showAlert("Apenas administradores podem enviar arquivos ZIP.");
        const input = document.getElementById("feedCreateZip");
        if (input) input.value = "";
        return;
    }
    const input = document.getElementById("feedCreateZip");
    const file = input.files[0];
    if (!file) return;
    feedCreateFiles = [];
    renderFeedCreatePreviews();
    feedCreateZip = file;
    const label = document.getElementById("feedCreateZipLabel");
    if (label) label.textContent = file.name;
    const size = document.getElementById("feedCreateZipSize");
    if (size) size.textContent = `${Math.round(file.size / 1024)} KB`;
    const preview = document.getElementById("feedCreateZipPreview");
    if (preview) preview.hidden = false;
    updateFeedCreateBtn();
    input.value = "";
});

document.getElementById("feedCreateZipRemove")?.addEventListener("click", () => {
    clearFeedCreateZip();
    updateFeedCreateBtn();
});

document.getElementById("feedCreateFile")?.addEventListener("change", () => {
    const fileInput = document.getElementById("feedCreateFile");
    const files = Array.from(fileInput.files);
    if (!files.length) return;
    clearFeedCreateZip();
    for (const file of files) {
        if (file.type.startsWith("video/")) {
            const vid = document.createElement("video");
            vid.preload = "metadata";
            vid.src = URL.createObjectURL(file);
            vid.onloadedmetadata = () => {
                if (vid.duration > 120) {
                    showAlert("Video muito longo (maximo 2 minutos).");
                    URL.revokeObjectURL(vid.src);
                    return;
                }
                feedCreateFiles.push(file);
                renderFeedCreatePreviews();
                updateFeedCreateBtn();
            };
        } else {
            feedCreateFiles.push(file);
        }
    }
    renderFeedCreatePreviews();
    updateFeedCreateBtn();
    fileInput.value = "";
});

function renderFeedCreatePreviews() {
    const container = document.getElementById("feedCreatePreviews");
    if (!container) return;
    container.innerHTML = "";
    feedCreateFiles.forEach((file, idx) => {
        const div = document.createElement("div");
        div.className = "composer-preview-item";
        const isVideo = file.type.startsWith("video/");
        if (isVideo) {
            const vid = document.createElement("video");
            vid.src = URL.createObjectURL(file);
            vid.muted = true;
            vid.loop = true;
            vid.playsInline = true;
            div.appendChild(vid);
        } else {
            const img = document.createElement("img");
            img.src = URL.createObjectURL(file);
            div.appendChild(img);
        }
        const removeBtn = document.createElement("button");
        removeBtn.className = "composer-remove";
        removeBtn.type = "button";
        removeBtn.innerHTML = "&times;";
        removeBtn.addEventListener("click", () => {
            feedCreateFiles.splice(idx, 1);
            renderFeedCreatePreviews();
            updateFeedCreateBtn();
        });
        div.appendChild(removeBtn);
        container.appendChild(div);
    });
    if (feedCreateFiles.length > 0) {
        const nsfwBtn = document.createElement("button");
        nsfwBtn.type = "button";
        nsfwBtn.className = "feed-create-nsfw" + (feedCreateNsfw ? " active visible" : " visible");
        nsfwBtn.textContent = "18+";
        nsfwBtn.addEventListener("click", () => {
            setFeedCreateNsfw(!feedCreateNsfw);
        });
        container.appendChild(nsfwBtn);
    }
}

document.getElementById("feedCreateText")?.addEventListener("input", (e) => {
    autoResizeFeedCreate(e.target);
    updateFeedCreateBtn();
});

document.getElementById("feedCreateText")?.addEventListener("paste", (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) feedCreateFiles.push(file);
    }
    renderFeedCreatePreviews();
    updateFeedCreateBtn();
});

function autoResizeFeedCreate(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
}

function updateFeedCreateBtn() {
    const btn = document.getElementById("feedCreateSend");
    const text = document.getElementById("feedCreateText")?.value.trim();
    btn.disabled = !feedCreateFiles.length && !feedCreateZip && !text;
}

document.getElementById("feedCreateSend")?.addEventListener("click", async () => {
    const btn = document.getElementById("feedCreateSend");
    const text = document.getElementById("feedCreateText")?.value.trim();
    if (!feedCreateFiles.length && !feedCreateZip && !text) return;
    btn.disabled = true;

    const form = new FormData();
    for (const file of feedCreateFiles) {
        if (file.type.startsWith("video/")) {
            form.append("images", file, file.name);
        } else {
            let imageToUpload = file;
            let imageName = file.name;
            if (typeof compressImage === "function") {
                try {
                    imageToUpload = await compressImage(file);
                    if (imageToUpload !== file) {
                        const ext = file.type === "image/png" ? ".png" : ".jpg";
                        imageName = file.name.replace(/\.[^.]+$/, "") + ext;
                    }
                } catch { /* keep original */ }
            }
            form.append("images", imageToUpload, imageName);
        }
    }
    if (window.currentUserIsAdmin && feedCreateZip) form.append("zip", feedCreateZip);
    form.append("caption", text);
    if (feedCreateNsfw) form.append("nsfw", "1");
    if (feedCreateEleicao) form.append("eleicao", "1");

    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            feedCreateFiles = [];
            setFeedCreateNsfw(false);
            setFeedCreateEleicao(false);
            clearFeedCreateZip();
            const feedInput = document.getElementById("feedCreateText");
            feedInput.value = "";
            autoResizeFeedCreate(feedInput);
            document.getElementById("feedCreatePreviews").innerHTML = "";
            await loadCarousel(true);
        } else if (res.status === 401) {
            location.href = "/login";
        }
    } catch { /* ignore */ }

    updateFeedCreateBtn();
});

(async () => {
    try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
            window.currentUserIsAdmin = data.user.is_admin || false;
            const avatar = document.getElementById("feedCreateAvatar");
            if (avatar) {
                const src = (!data.user.avatar || data.user.avatar === "default-avatar.svg")
                    ? "/static/svg/default-avatar.svg" : `/avatars/${data.user.avatar}`;
                avatar.src = src;
                avatar.style.cursor = "pointer";
                avatar.title = "Ver perfil";
                avatar.addEventListener("click", () => {
                    goToProfile(data.user.username);
                });
            }
        }
    } catch { /* ignore */ }
    if (!window.currentUserIsAdmin) {
        const zipBtn = document.getElementById("feedCreateZipBtn");
        if (zipBtn) zipBtn.style.display = "none";
    }
})();

/* === Post & Comment 3-dot menus — distintos, aparência idêntica (portais) === */
const postMenuLayer = document.createElement("div");
postMenuLayer.className = "post-menu";
postMenuLayer.style.cssText = "position: fixed; right: auto; bottom: auto;";
postMenuLayer.hidden = true;
document.body.appendChild(postMenuLayer);

const commentMenuLayer = document.createElement("div");
commentMenuLayer.className = "comment-menu";
commentMenuLayer.style.cssText = "position: fixed; right: auto; bottom: auto;";
commentMenuLayer.hidden = true;
document.body.appendChild(commentMenuLayer);

function closePostMenu() {
    if (postMenuLayer._sourceBtn) postMenuLayer._sourceBtn.setAttribute("aria-expanded", "false");
    postMenuLayer.hidden = true;
    postMenuLayer.innerHTML = "";
    postMenuLayer._sourceBtn = null;
}
function closeCommentMenu() {
    if (commentMenuLayer._sourceBtn) commentMenuLayer._sourceBtn.setAttribute("aria-expanded", "false");
    commentMenuLayer.hidden = true;
    commentMenuLayer.innerHTML = "";
    commentMenuLayer._sourceBtn = null;
}
function closeAllMenus() { closePostMenu(); closeCommentMenu(); }

function openPortalMenu({ layer, btn, inlineMenu }) {
    [...inlineMenu.children].forEach(child => layer.appendChild(child.cloneNode(true)));
    const host = document.getElementById("feedView") || document.getElementById("postsGrid") || document.body;
    if (layer.parentElement !== host) host.appendChild(layer);
    layer._sourceBtn = btn;
    btn.setAttribute("aria-expanded", "true");
    layer.hidden = false;
    const r = btn.getBoundingClientRect();
    const mw = layer.offsetWidth || 130;
    const mh = layer.offsetHeight || 96;
    let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
    if (left < 8) left = 8;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    layer.style.left = left + "px";
    layer.style.top = top + "px";
}

document.addEventListener("click", e => {
    if (e.target.closest(".post-menu-item") && postMenuLayer.contains(e.target)) { closeAllMenus(); return; }
    if (e.target.closest(".comment-menu-item") && commentMenuLayer.contains(e.target)) { closeAllMenus(); return; }

    const postBtn = e.target.closest(".post-menu-btn, .feed-menu-btn");
    if (postBtn) {
        const wasOpen = !postMenuLayer.hidden && postMenuLayer._sourceBtn === postBtn;
        closeAllMenus();
        if (wasOpen) return;
        const inlineMenu = postBtn.closest(".post-owner-actions, .feed-owner-actions")?.querySelector(":scope > .post-menu, :scope > .comment-menu");
        if (!inlineMenu) return;
        openPortalMenu({ layer: postMenuLayer, btn: postBtn, inlineMenu });
        return;
    }

    const commentBtn = e.target.closest(".comment-menu-btn");
    if (commentBtn) {
        const wasOpen = !commentMenuLayer.hidden && commentMenuLayer._sourceBtn === commentBtn;
        closeAllMenus();
        if (wasOpen) return;
        const inlineMenu = commentBtn.closest(".comment-owner-actions")?.querySelector(":scope > .comment-menu");
        if (!inlineMenu) return;
        openPortalMenu({ layer: commentMenuLayer, btn: commentBtn, inlineMenu });
        return;
    }

    closeAllMenus();
});

window.addEventListener("scroll", closeAllMenus, true);
window.addEventListener("resize", closeAllMenus);



