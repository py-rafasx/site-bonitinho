const AVATAR_DEFAULT = "/static/svg/default-avatar.svg";
const COLORS = [
    "#f43f5e","#ef4444","#6366f1","#3b82f6","#10b981","#22c55e",
    "#f59e0b","#f97316","#8b5cf6","#a855f7","#0ea5e9","#06b6d4",
    "#ec4899","#d946ef","#84cc16","#14b8a6","#eab308","#64748b"
];

let profile = null;
let postsPage = 1;
let postsLoading = false;
let postsHasMore = true;
let activeTab = "all";
let selectedColor = "";

/* ── Helpers ──────────────────────────────────────────────── */

function getUsernameFromURL() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "perfil") {
        try {
            return decodeURIComponent(parts[1]);
        } catch {
            return parts[1];
        }
    }
    return null;
}

function setAvatar(img, avatar) {
    if (!avatar || avatar === "default-avatar.svg") {
        img.src = AVATAR_DEFAULT;
    } else {
        img.src = "/avatars/" + avatar;
        img.onerror = () => { img.src = AVATAR_DEFAULT; };
    }
}

function setCover(img, cover) {
    if (cover) {
        img.src = "/covers/" + cover;
        img.style.display = "";
    } else {
        img.removeAttribute("src");
        img.style.display = "none";
    }
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr) ? dateStr : dateStr + "Z";
    const d = new Date(normalized);
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return months[d.getMonth()] + " " + d.getFullYear();
}

function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}

function profileCacheKey(username) {
    return "profileState:" + username;
}

function saveProfileState() {
    if (!profile?.username) return;
    try {
        sessionStorage.setItem(profileCacheKey(profile.username), JSON.stringify({
            profile,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            activeTab,
            selectedColor,
        }));
    } catch { /* ignore */ }
}

function applyProfileData(data) {
    document.title = data.username + " — MikanNet";
    setAvatar(document.getElementById("avatarImg"), data.avatar);
    setCover(document.getElementById("coverImg"), data.cover);
    const display = data.display_name || data.username;
    const nameEl = document.getElementById("profileName");
    nameEl.textContent = display;
    if (data.color) nameEl.style.color = data.color;
    document.getElementById("topbarName").textContent = display;
    document.getElementById("topbarCount").textContent = data.posts_count + " posts";
    document.getElementById("profileHandle").textContent = "@" + data.username;
    renderStats(data);
    renderActions(data);
    renderDetails(data);
    updateBioDisplay();
    loadPosts(data.username);
    if (data.is_me) {
        document.getElementById("btnCoverEdit").hidden = false;
        document.getElementById("btnAvatarEdit").hidden = false;
        document.getElementById("tabBlocked").hidden = false;
    }
}

function restoreProfileUI(state) {
    if (typeof state.scrollX === "number" || typeof state.scrollY === "number") {
        requestAnimationFrame(() => window.scrollTo(state.scrollX || 0, state.scrollY || 0));
    }
}

/* ── Load Profile ─────────────────────────────────────────── */

async function loadProfile(forceRefresh = false) {
    const username = getUsernameFromURL();
    if (!username) {
        const me = await fetchCurrentMe();
        if (me?.user) {
            location.replace("/perfil/" + encodeURIComponent(me.user.username));
        } else {
            location.href = "/login";
        }
        return;
    }

    const cacheKey = profileCacheKey(username);
    if (!forceRefresh) {
        try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
            if (cached?.profile) {
                profile = cached.profile;
                applyProfileData(cached.profile);
                restoreProfileUI(cached);
                return;
            }
        } catch { /* ignore */ }
    }

    const data = await fetch("/api/profile/" + encodeURIComponent(username)).then(r => r.json()).catch(() => null);
    if (!data || data.error) {
        const msg = data?.error === "profile not available"
            ? "Este perfil não está disponível"
            : "Perfil não encontrado";
        document.getElementById("profilePage").innerHTML =
            '<div style="text-align:center;padding:64px 24px;color:var(--text-muted)">' + msg + '</div>';
        return;
    }

    profile = data;
    applyProfileData(data);

    document.querySelectorAll(".stat-link").forEach(el => {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => openUserList(el.dataset.list));
    });

    saveProfileState();
}

/* ── Stats ────────────────────────────────────────────────── */

function renderStats(data) {
    document.getElementById("profileStats").innerHTML =
        "<span class='stat-link' data-list='following'><strong>" + data.following_count + "</strong> Seguindo</span>" +
        "<span class='stat-link' data-list='followers'><strong>" + data.followers_count + "</strong> Seguidores</span>";
}

/* ── Bio ──────────────────────────────────────────────────── */

function updateBioDisplay() {
    const bioEl = document.getElementById("profileBio");
    const pinned = profile?.pinned_details || [];
    const showBio = pinned.includes("bio");
    if (profile.bio && showBio) {
        bioEl.textContent = profile.bio;
        bioEl.hidden = false;
        bioEl.classList.toggle("editable", !!profile.is_me);
    } else {
        bioEl.textContent = "";
        bioEl.hidden = true;
    }
}

document.getElementById("profileBio").addEventListener("click", () => {
    if (!profile || !profile.is_me) return;
    document.getElementById("bioOverlay").classList.add("open");
});

document.getElementById("bioClose").addEventListener("click", () => {
    document.getElementById("bioOverlay").classList.remove("open");
});

document.getElementById("bioOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});

document.getElementById("bioEdit").addEventListener("click", () => {
    document.getElementById("bioOverlay").classList.remove("open");
    openEditModal();
});

document.getElementById("bioDelete").addEventListener("click", async () => {
    document.getElementById("bioOverlay").classList.remove("open");
    const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: "" }),
    });
    const data = await res.json();
    if (data.error) { showAlert(data.error, "Erro"); return; }
    profile.bio = "";
    updateBioDisplay();
});

/* ── Actions ──────────────────────────────────────────────── */

async function openUserList(type) {
    if (!profile) return;
    const overlay = document.getElementById("listOverlay");
    const title = document.getElementById("listTitle");
    const body = document.getElementById("listBody");

    title.textContent = type === "followers" ? "Seguidores" : type === "following" ? "Seguindo" : "Bloqueados";
    body.innerHTML = '<div class="list-empty">Carregando...</div>';
    overlay.classList.add("open");

    const endpoints = {
        followers: "/api/profile/" + encodeURIComponent(profile.username) + "/followers",
        following: "/api/profile/" + encodeURIComponent(profile.username) + "/following-list",
        blocked: "/api/auth/blocked",
    };

    const res = await fetch(endpoints[type]).then(r => r.json()).catch(() => []);
    if (!Array.isArray(res) || !res.length) {
        body.innerHTML = '<div class="list-empty">' +
            (type === "blocked" ? "Ninguém bloqueado" : "Nenhum " + (type === "followers" ? "seguidor" : "seguindo") + " encontrado") +
            '</div>';
        return;
    }

    if (type === "blocked") {
        body.innerHTML = res.map(u =>
            '<div class="list-user">' +
                '<img class="list-user-avatar" src="' + avatarSrc(u.avatar) + '" alt="" onerror="this.src=\'' + AVATAR_DEFAULT + '\'">' +
                '<span class="list-user-name" title="@' + esc(u.username) + '">' + esc(u.display_name || u.username) + ' <small style="color:var(--text-muted)">@' + esc(u.username) + '</small></span>' +
                '<button class="list-unblock" data-username="' + esc(u.username) + '">Desbloquear</button>' +
            '</div>'
        ).join("");
        body.querySelectorAll(".list-unblock").forEach(btn => {
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                try {
                    await fetch("/api/auth/block/" + encodeURIComponent(btn.dataset.username), { method: "POST" });
                    openUserList("blocked");
                } catch { btn.disabled = false; }
            });
        });
        return;
    }

    body.innerHTML = res.map(u =>
        '<a class="list-user" href="/perfil/' + esc(u.username) + '">' +
            '<img class="list-user-avatar" src="' + avatarSrc(u.avatar) + '" alt="" onerror="this.src=\'' + AVATAR_DEFAULT + '\'">' +
            '<span class="list-user-name" style="color:' + esc(u.color || 'var(--text)') + '">' + esc(u.display_name || u.username) + ' <small style="color:var(--text-muted)">@' + esc(u.username) + '</small></span>' +
        '</a>'
    ).join("");
}

function avatarSrc(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return AVATAR_DEFAULT;
    return "/avatars/" + avatar;
}

document.getElementById("listClose").addEventListener("click", () => {
    document.getElementById("listOverlay").classList.remove("open");
    syncTabsActive();
});
document.getElementById("listOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove("open");
        syncTabsActive();
    }
});

function renderActions(data) {
    const el = document.getElementById("actionButtons");
    if (data.is_me) {
        el.innerHTML = "";
        document.getElementById("btnEdit").hidden = false;
        document.getElementById("btnEdit").addEventListener("click", openEditModal);
        return;
    }

    if (data.is_blocked) {
        el.innerHTML =
            '<button class="action-btn action-btn-danger" id="btnBlock" style="grid-column: 1 / -1">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Desbloquear' +
            '</button>';
        document.getElementById("btnBlock").addEventListener("click", toggleBlock);
        return;
    }

    el.innerHTML =
        '<button class="action-btn action-btn-primary' + (data.is_following ? " following" : "") + '" id="btnFollow">' +
            (data.is_following ?
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Seguindo' :
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Seguir') +
        '</button>' +
        '<button class="action-btn action-btn-danger" id="btnBlock">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Bloquear' +
        '</button>';

    document.getElementById("btnFollow").addEventListener("click", toggleFollow);
    document.getElementById("btnBlock").addEventListener("click", toggleBlock);
}

async function toggleBlock() {
    const res = await fetch("/api/auth/block/" + encodeURIComponent(profile.username), { method: "POST" });
    const data = await res.json();
    if (!res.ok) return;

    profile.is_blocked = data.blocked;
    renderActions(profile);
    loadPosts(profile.username);
}

async function toggleFollow() {
    const res = await fetch("/api/auth/follow/" + encodeURIComponent(profile.username), { method: "POST" });
    const data = await res.json();
    if (!res.ok) return;

    profile.is_following = data.following;
    profile.followers_count = data.followers_count;
    renderStats(profile);

    const btn = document.getElementById("btnFollow");
    btn.classList.toggle("following", data.following);
    btn.innerHTML = data.following ?
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Seguindo' :
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Seguir';
}

/* ── Details ──────────────────────────────────────────────── */

function renderDetails(data) {
    const list = document.getElementById("detailsList");
    let html = "";
    const pinned = data.pinned_details || [];
    const show = (k) => pinned.includes(k);

    if (data.location && show("location")) {
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>' +
            '<span class="detail-text">' + esc(data.location) + '</span></div>';
    }

    if (data.birthday && /^\d{4}-\d{2}-\d{2}$/.test(data.birthday) && show("birthday")) {
        const [y, m, d] = data.birthday.split("-");
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>' +
            '<span class="detail-text">Nascido em ' + esc(d + "/" + m + "/" + y) + '</span></div>';
    }

    if (data.marital_status && show("birthday")) {
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span>' +
            '<span class="detail-text">' + esc(data.marital_status) + '</span></div>';
    }

    if (data.social_links && data.social_links.length && show("contact")) {
        data.social_links.forEach(l=>{
            const safeUrl = esc(l.url);
            const safeName = esc(l.name);
            html += '<div class="detail-item">' +
                '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>' +
                '<a class="detail-text" href="'+safeUrl+'" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">'+safeName+'</a></div>';
        });
    }

    if (data.education && show("education")) {
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6"/><path d="M22 10a10 10 0 0 0-20 0"/><path d="M12 10V6"/></svg></span>' +
            '<span class="detail-text">' + esc(data.education) + '</span></div>';
    }

    if (data.hobbies && data.hobbies.length && show("hobbies")) {
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 12.5l-2 2-1-1"/></svg></span>' +
            '<span class="detail-text">' + data.hobbies.map(h=>esc(h)).join(" · ") + '</span></div>';
    }

    if ((data.category || data.price || data.hours) && show("work")) {
        const workTxt = [data.category, data.price, data.hours].filter(Boolean).map(esc).join(" · ");
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg></span>' +
            '<span class="detail-text">' + workTxt + '</span></div>';
    }

    if (data.created_at && show("joined")) {
        const joined = formatDate(data.created_at);
        if (joined) {
            html += '<div class="detail-item">' +
                '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>' +
                '<span class="detail-text">Ingressou em ' + joined + '</span></div>';
        }
    }

    list.innerHTML = html;
}

/* ── Tabs ─────────────────────────────────────────────────── */

function syncTabsActive() {
    document.querySelectorAll(".profile-tabs .tab").forEach(t => {
        const isActive = t.dataset.tab === activeTab;
        t.classList.toggle("active", isActive);
        t.setAttribute("aria-selected", String(isActive));
    });
}

document.getElementById("profileTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab || !tab.dataset.tab) return;

    if (tab.dataset.tab === "blocked") {
        const overlay = document.getElementById("listOverlay");
        if (overlay.classList.contains("open")) {
            overlay.classList.remove("open");
            syncTabsActive();
        } else {
            document.querySelectorAll(".profile-tabs .tab").forEach(t => {
                if (t !== tab) {
                    t.classList.remove("active");
                    t.setAttribute("aria-selected", "false");
                }
            });
            tab.classList.add("active");
            tab.setAttribute("aria-selected", "true");
            openUserList("blocked");
        }
        return;
    }

    activeTab = tab.dataset.tab;
    syncTabsActive();
    postsPage = 1;
    postsHasMore = true;
    document.getElementById("postsGrid").innerHTML = "";
    if (typeof allImages !== "undefined") allImages.length = 0;
    document.getElementById("postsEnd").hidden = true;
    if (profile) loadPosts(profile.username);
});

/* ── Posts ────────────────────────────────────────────────── */

let feedStateReady = false;

async function ensureFeedState() {
    if (feedStateReady) return;
    if (typeof initFeedState !== "function" || typeof feedCardHTML !== "function") return;
    await initFeedState();
    feedStateReady = true;
}

async function loadPosts(username) {
    if (postsLoading || !postsHasMore) return;
    postsLoading = true;
    document.getElementById("postsLoading").hidden = false;

    const data = await fetch("/api/profile/" + encodeURIComponent(username) + "/posts?page=" + postsPage)
        .then(r => r.json()).catch(() => null);

    await ensureFeedState();

    postsLoading = false;
    document.getElementById("postsLoading").hidden = true;
    if (!data || !data.posts) return;

    const grid = document.getElementById("postsGrid");
    const cards = [];
    for (const post of data.posts) {
        if (activeTab === "photos" && post.post_type !== "image") continue;
        if (nsfwFilter === "hide" && post.nsfw) continue;
        allImages.push(post);
        cards.push(post);
    }

    grid.insertAdjacentHTML("beforeend", cards.map(feedCardHTML).join(""));
    initFeedMedia(grid);

    postsHasMore = data.has_more;
    postsPage++;

    if (!data.has_more && grid.children.length === 0) {
        document.getElementById("postsEnd").hidden = false;
    }
}

const postsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && profile) loadPosts(profile.username);
}, { rootMargin: "300px" });
postsObserver.observe(document.getElementById("postsLoading"));

const postsGridEl = document.getElementById("postsGrid");
if (postsGridEl && typeof bindFeedEvents === "function") {
    bindFeedEvents(postsGridEl);
}

/* ── Back ─────────────────────────────────────────────────── */

document.getElementById("btnBack").addEventListener("click", () => {
    const state = getSavedNavState();
    if (state?.url && state.path !== location.pathname) {
        location.href = state.url;
        return;
    }
    location.href = "/";
});

/* ── Edit Modal ───────────────────────────────────────────── */

function openEditModal() {
    if (!profile) return;
    document.getElementById("editDisplayName").value = profile.display_name || profile.username || "";
    document.getElementById("editUsername").value = profile.username;
    const emEl = document.getElementById("editEmail");
    if (emEl) emEl.value = profile.email || "";
    document.getElementById("editBio").value = profile.bio || "";
    const loc = profile.location || "";
    const loc1 = document.getElementById("editLocation");
    const loc2 = document.getElementById("editLocation2");
    if (loc1) loc1.value = loc;
    if (loc2) loc2.value = loc;
    document.getElementById("editBirthday").value = profile.birthday || "";
    document.getElementById("editMarital").value = profile.marital_status || "";
    const catEl = document.getElementById("editCategory");
    if (catEl) catEl.value = profile.category || "";
    const priceEl = document.getElementById("editPrice");
    if (priceEl) priceEl.value = profile.price || "";
    const hoursEl = document.getElementById("editHours");
    if (hoursEl) hoursEl.value = profile.hours || "";
    const eduEl = document.getElementById("editEducation");
    if (eduEl) eduEl.value = profile.education || "";
    const hobEl = document.getElementById("editHobbies");
    if (hobEl) hobEl.value = (profile.hobbies || []).join(", ");
    // reset segurança
    ["secCurrent","secNew","secConfirm"].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=""; });
    const secMsg=document.getElementById("secMsg"); if(secMsg) secMsg.textContent="";
    const recMsg=document.getElementById("recoveryMsg"); if(recMsg) recMsg.textContent="";
    const recBox=document.getElementById("recoveryCodes"); if(recBox){ recBox.style.display="none"; recBox.innerHTML=""; }
    document.getElementById("bioCounter").textContent = (profile.bio || "").length + "/110";
    selectedColor = profile.color || "";
    buildEditColors();
    // reset colapsável de cor para fechado
    const colorTrigger = document.getElementById("editColorsTrigger");
    const colorWrap = document.getElementById("editColorsWrap");
    if (colorTrigger) colorTrigger.setAttribute("aria-expanded", "false");
    if (colorWrap) colorWrap.hidden = true;
    updateEditColorsPreview();
    const savedNsfw = localStorage.getItem("nsfwFilter") || "blur";
    const radio = document.querySelector(`input[name="nsfw"][value="${savedNsfw}"]`);
    if (radio) radio.checked = true;
    updateNsfwDesc();
    loadSocialLinks(profile.social_links || []);
    buildPinnedChooser(profile.pinned_details || []);
    updateHobbiesPreview();
    // reset tabs para apresentacao
    document.querySelectorAll(".edit-tab").forEach(t=>t.classList.remove("active"));
    document.querySelector('.edit-tab[data-tab="apresentacao"]')?.classList.add("active");
    document.querySelectorAll(".edit-panel").forEach(p=>p.classList.remove("active"));
    document.querySelector('.edit-panel[data-panel="apresentacao"]')?.classList.add("active");
    document.getElementById("editOverlay").classList.add("open");
}

// Tabs laterais
document.querySelectorAll(".edit-tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
        const target = tab.dataset.tab;
        if(!target) return;
        document.querySelectorAll(".edit-tab").forEach(t=>t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".edit-panel").forEach(p=>{
            p.classList.toggle("active", p.dataset.panel===target);
        });
    });
});

// Sync localização entre abas
document.getElementById("editLocation")?.addEventListener("input", e=>{
    const v=e.target.value;
    const other=document.getElementById("editLocation2");
    if(other) other.value=v;
});
document.getElementById("editLocation2")?.addEventListener("input", e=>{
    const v=e.target.value;
    const other=document.getElementById("editLocation");
    if(other) other.value=v;
});

// Social links
function createSocialRow(name="", url="") {
    const row = document.createElement("div");
    row.className = "social-row";
    row.style.cssText = "display:flex;gap:6px;align-items:center;";
    row.innerHTML = `
        <input type="text" placeholder="Nome (ex: Instagram)" value="${name.replace(/"/g,'&quot;')}" class="social-name" style="flex:0 0 110px;padding:8px 10px;border:none;border-bottom:1.5px solid var(--border);background:transparent;font-size:0.875rem;outline:none;">
        <input type="text" placeholder="https://..." value="${url.replace(/"/g,'&quot;')}" class="social-url" style="flex:1;padding:8px 10px;border:none;border-bottom:1.5px solid var(--border);background:transparent;font-size:0.875rem;outline:none;">
        <button type="button" class="social-remove" style="width:28px;height:28px;border:none;background:var(--surface-2);border-radius:50%;cursor:pointer;color:var(--text-muted);font-size:1rem;line-height:1;">×</button>
    `;
    row.querySelector(".social-remove").addEventListener("click", ()=> row.remove());
    return row;
}
function loadSocialLinks(links) {
    const list = document.getElementById("socialLinksList");
    if (!list) return;
    list.innerHTML = "";
    (links || []).forEach(l => list.appendChild(createSocialRow(l.name||"", l.url||"")));
}
document.getElementById("btnAddSocial")?.addEventListener("click", ()=>{
    const list = document.getElementById("socialLinksList");
    if (!list) return;
    if (list.children.length >= 5) return showAlert("Máximo 5 links");
    list.appendChild(createSocialRow());
});

// Pinned details
const PINNED_OPTS = [
    {key:"bio", label:"Bio"},
    {key:"location", label:"Localização"},
    {key:"birthday", label:"Data de nascimento"},
    {key:"work", label:"Trabalho"},
    {key:"education", label:"Educação"},
    {key:"hobbies", label:"Hobbies"},
    {key:"contact", label:"Contato"},
    {key:"joined", label:"Ingressou em"},
];
function buildPinnedChooser(pinned) {
    const c = document.getElementById("pinnedChooser");
    if (!c) return;
    c.innerHTML = "";
    PINNED_OPTS.forEach(o=>{
        const row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:0.8125rem;color:var(--text-soft);";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = o.key;
        cb.checked = pinned.includes(o.key);
        cb.addEventListener("change", updatePinnedPreview);
        row.appendChild(cb);
        row.appendChild(document.createTextNode(o.label));
        c.appendChild(row);
    });
    updatePinnedPreview();
}
function updatePinnedPreview() {
    const box = document.getElementById("pinnedPreview");
    const chosen = Array.from(document.querySelectorAll("#pinnedChooser input:checked")).map(i=>i.value);
    if (!box) return;
    if (!chosen.length) { box.textContent = "Nenhum detalhe fixado"; box.style.color="var(--text-muted)"; return; }
    const labels = chosen.map(k=> PINNED_OPTS.find(o=>o.key===k)?.label || k);
    box.textContent = labels.join(" · ");
    box.style.color="var(--text)";
}
function updateHobbiesPreview() {
    const inp = document.getElementById("editHobbies");
    const box = document.getElementById("hobbiesPreview");
    if (!inp || !box) return;
    const vals = inp.value.split(",").map(s=>s.trim()).filter(Boolean).slice(0,10);
    if (!vals.length) { box.innerHTML = ""; return; }
    box.innerHTML = vals.map(v=> `<span style="background:var(--surface-2);padding:4px 8px;border-radius:9999px;font-size:0.75rem;color:var(--text-soft);">${esc(v)}</span>`).join("");
}
document.getElementById("editHobbies")?.addEventListener("input", updateHobbiesPreview);
function updateNsfwDesc() {
    const desc = document.getElementById("nsfwDesc");
    if (!desc) return;
    const val = document.querySelector('input[name="nsfw"]:checked')?.value || "blur";
    const map = {
        all: "Mostrar todas as imagens sem filtro",
        blur: "Imagens impróprias aparecem borradas",
        hide: "Imagens impróprias não aparecem"
    };
    desc.textContent = map[val] || "";
}

document.querySelectorAll('input[name="nsfw"]').forEach(r => r.addEventListener("change", updateNsfwDesc));

function closeEditModal() {
    document.getElementById("editOverlay").classList.remove("open");
}

const COLOR_NAMES = {
    "#f43f5e": "Rosa avermelhado",
    "#ef4444": "Vermelho",
    "#6366f1": "Índigo",
    "#3b82f6": "Azul",
    "#10b981": "Esmeralda",
    "#22c55e": "Verde",
    "#f59e0b": "Âmbar",
    "#f97316": "Laranja",
    "#8b5cf6": "Violeta",
    "#a855f7": "Roxo",
    "#0ea5e9": "Azul céu",
    "#06b6d4": "Ciano",
    "#ec4899": "Rosa",
    "#d946ef": "Fúcsia",
    "#84cc16": "Lima",
    "#14b8a6": "Turquesa",
    "#eab308": "Amarelo",
    "#64748b": "Cinza"
};

function updateEditColorsPreview() {
    const swatch = document.getElementById("editColorsPreviewSwatch");
    const text = document.getElementById("editColorsPreviewText");
    if (!swatch || !text) return;
    if (selectedColor && COLOR_NAMES[selectedColor]) {
        swatch.style.background = selectedColor;
        swatch.classList.remove("is-empty");
        swatch.style.borderColor = selectedColor;
        text.textContent = COLOR_NAMES[selectedColor];
        text.style.color = selectedColor;
    } else if (selectedColor) {
        swatch.style.background = selectedColor;
        swatch.classList.remove("is-empty");
        swatch.style.borderColor = selectedColor;
        text.textContent = selectedColor;
        text.style.color = selectedColor;
    } else {
        swatch.style.background = "transparent";
        swatch.classList.add("is-empty");
        swatch.style.borderColor = "var(--border)";
        text.textContent = "Padrão";
        text.style.color = "var(--text-muted)";
    }
}

function buildEditColors() {
    const el = document.getElementById("editColors");
    el.innerHTML = "";
    for (const c of COLORS) {
        const row = document.createElement("div");
        row.className = "edit-color-row" + (c === selectedColor ? " selected" : "");
        row.tabIndex = 0;
        row.setAttribute("role", "radio");
        row.setAttribute("aria-checked", String(c === selectedColor));
        row.setAttribute("aria-label", COLOR_NAMES[c] || c);
        const swatch = document.createElement("div");
        swatch.className = "edit-color";
        swatch.style.background = c;
        const nameEl = document.createElement("span");
        nameEl.className = "edit-color-name";
        nameEl.textContent = COLOR_NAMES[c] || c;
        const hexEl = document.createElement("span");
        hexEl.className = "edit-color-hex";
        hexEl.textContent = c;
        row.append(swatch, nameEl, hexEl);
        row.addEventListener("click", () => pickColor(c));
        row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickColor(c); }});
        el.appendChild(row);
    }
    updateEditColorsPreview();
}

function pickColor(c) {
    selectedColor = c;
    document.querySelectorAll(".edit-color-row").forEach(row => {
        const sw = row.querySelector(".edit-color");
        const match = sw && (sw.style.background === c || sw.style.backgroundColor === c || rgbToHex(sw.style.backgroundColor) === c);
        row.classList.toggle("selected", match);
        row.setAttribute("aria-checked", String(match));
    });
    updateEditColorsPreview();
}

// Collapsible toggle for editColors
document.getElementById("editColorsTrigger")?.addEventListener("click", () => {
    const trigger = document.getElementById("editColorsTrigger");
    const wrap = document.getElementById("editColorsWrap");
    if (!trigger || !wrap) return;
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", String(!isOpen));
    wrap.hidden = isOpen;
});

function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith("#")) return rgb;
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return rgb;
    return "#" + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, "0")).join("");
}

document.getElementById("editClose").addEventListener("click", closeEditModal);
document.getElementById("editCancel").addEventListener("click", closeEditModal);
document.getElementById("editOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});

document.getElementById("editBio").addEventListener("input", (e) => {
    document.getElementById("bioCounter").textContent = e.target.value.length + "/110";
});

document.getElementById("editSave").addEventListener("click", async () => {
    const username = document.getElementById("editUsername").value.trim();
    if (username.length < 3) return showAlert("Nome de usuário mínimo 3 caracteres");
    const display_name = document.getElementById("editDisplayName").value.trim().slice(0, 30);
    const email = document.getElementById("editEmail") ? document.getElementById("editEmail").value.trim() : "";

    const locVal = (document.getElementById("editLocation")?.value || document.getElementById("editLocation2")?.value || "").trim();
    const socialLinks = Array.from(document.querySelectorAll("#socialLinksList .social-row")).map(r=>({
        name: r.querySelector(".social-name")?.value.trim() || "",
        url: r.querySelector(".social-url")?.value.trim() || ""
    })).filter(x=>x.name && x.url);
    const hobbiesVal = document.getElementById("editHobbies")?.value || "";
    const hobbiesArr = hobbiesVal.split(",").map(s=>s.trim()).filter(Boolean);
    const pinned = Array.from(document.querySelectorAll("#pinnedChooser input:checked")).map(i=>i.value);
    const body = {
        username,
        display_name,
        email,
        bio: document.getElementById("editBio").value.trim(),
        location: locVal,
        birthday: document.getElementById("editBirthday").value,
        marital_status: document.getElementById("editMarital").value,
        category: document.getElementById("editCategory")?.value.trim() || "",
        price: document.getElementById("editPrice")?.value.trim() || "",
        hours: document.getElementById("editHours")?.value.trim() || "",
        social_links: socialLinks,
        education: document.getElementById("editEducation")?.value.trim() || "",
        hobbies: hobbiesArr,
        pinned_details: pinned,
        color: selectedColor,
    };

    const nsfwRadio = document.querySelector('input[name="nsfw"]:checked');
    if (nsfwRadio) {
        localStorage.setItem("nsfwFilter", nsfwRadio.value);
    }

    const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) { showAlert(data.error, "Erro"); return; }

    closeEditModal();
    if (username !== profile.username) {
        goToProfile(username);
    } else {
        await loadProfile();
    }
});

document.getElementById("btnGenCodes")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnGenCodes");
    const box = document.getElementById("recoveryCodes");
    const msg = document.getElementById("recoveryMsg");
    if (!await showConfirm("Gerar novos códigos invalida os anteriores. Continuar?", "Gerar códigos", "Gerar", "Cancelar")) return;
    btn.disabled = true;
    btn.textContent = "Gerando...";
    try {
        const res = await fetch("/api/auth/recovery/generate", { method: "POST" });
        const data = await res.json();
        if (!res.ok) { msg.textContent = data.error || "Erro"; return; }
        const header = `MikanNet - Codigos de Recuperacao\nUsuario: ${profile?.username || ""}\nGerado em: ${new Date().toLocaleString("pt-BR")}\n${"=".repeat(40)}\n`;
        const footer = `\n${"=".repeat(40)}\nCada codigo so pode ser usado uma vez.\nGuarde este arquivo em local seguro.\nPara usar: Login > Esqueci minha senha > informe usuario + codigo + nova senha\nOu acesse /reset\n`;
        const content = header + data.codes.join("\n") + footer;
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mikanet-codigos-${profile?.username || "recuperacao"}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        box.style.display = "none";
        box.innerHTML = "";
        msg.textContent = "Arquivo baixado. Guarde em local seguro. Cada código só funciona uma vez.";
        msg.style.color = "var(--text)";
    } catch { msg.textContent = "Erro de conexão"; }
    finally { btn.disabled = false; btn.textContent = "Gerar novos códigos"; }
});

document.getElementById("btnChangePass")?.addEventListener("click", async () => {
    const cur = document.getElementById("secCurrent")?.value || "";
    const nw = document.getElementById("secNew")?.value || "";
    const cf = document.getElementById("secConfirm")?.value || "";
    const msg = document.getElementById("secMsg");
    if (!cur || !nw) { msg.textContent = "Preencha senha atual e nova"; msg.style.color="var(--danger)"; return; }
    if (nw.length < 4) { msg.textContent = "Nova senha mínimo 4 caracteres"; msg.style.color="var(--danger)"; return; }
    if (nw !== cf) { msg.textContent = "Confirmação não coincide"; msg.style.color="var(--danger)"; return; }
    msg.textContent = "Alterando..."; msg.style.color="var(--text-muted)";
    try {
        const res = await fetch("/api/auth/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_password: cur, new_password: nw })
        });
        const data = await res.json();
        if (!res.ok) { msg.textContent = data.error || "Erro"; msg.style.color="var(--danger)"; return; }
        msg.textContent = "Senha alterada com sucesso!";
        msg.style.color = "#16a34a";
        document.getElementById("secCurrent").value="";
        document.getElementById("secNew").value="";
        document.getElementById("secConfirm").value="";
    } catch { msg.textContent = "Erro de conexão"; msg.style.color="var(--danger)"; }
});

/* ── Cover Upload ─────────────────────────────────────────── */

document.getElementById("btnCoverEdit").addEventListener("click", () => {
    document.getElementById("coverFileInput").click();
});

document.getElementById("coverFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.type === "image/gif") return uploadCoverDirect(file);
    openCoverCrop(file);
});

async function uploadCoverDirect(file) {
    const form = new FormData();
    form.append("cover", file, file.name);
    const res = await fetch("/api/auth/cover", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (data && data.cover) {
        profile.cover = data.cover;
        setCover(document.getElementById("coverImg"), data.cover);
    } else {
        showAlert((data && data.error) || "Erro ao enviar capa");
    }
}

/* ── Cover Crop ───────────────────────────────────────────── */

const coverCropOverlay = document.getElementById("coverCropOverlay");
const coverCropCanvas = document.getElementById("coverCropCanvas");
const coverCropArea = document.getElementById("coverCropArea");
const coverCropCtx = coverCropCanvas.getContext("2d");
let ccImg = null, ccScale = 1, ccImgX = 0, ccImgY = 0, ccDrag = null;
let ccPinchDist = 0, ccPinchScale = 1;

function cropMinScale(img, w, h) {
    return Math.max(w / img.naturalWidth, h / img.naturalHeight);
}
function cropMaxScale(img, w, h) {
    return cropMinScale(img, w, h) * 10;
}
function clampedOffset(x, y, scale, img, w, h) {
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const minX = Math.min(0, w - dw);
    const minY = Math.min(0, h - dh);
    return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
    };
}

function openCoverCrop(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        ccImg = img;
        coverCropOverlay.classList.add("open");
        requestAnimationFrame(() => requestAnimationFrame(() => resetCoverCrop()));
    };
    img.src = url;
}

function resetCoverCrop() {
    const w = coverCropArea.clientWidth;
    const h = coverCropArea.clientHeight;
    if (!w || !h) return;
    ccScale = cropMinScale(ccImg, w, h);
    ccImgX = (w - ccImg.naturalWidth * ccScale) / 2;
    ccImgY = (h - ccImg.naturalHeight * ccScale) / 2;
    drawCoverCrop();
}

function drawCoverCrop() {
    const w = coverCropArea.clientWidth;
    const h = coverCropArea.clientHeight;
    if (!w || !h) return;
    coverCropCanvas.width = w;
    coverCropCanvas.height = h;
    coverCropCtx.clearRect(0, 0, w, h);
    const dw = ccImg.naturalWidth * ccScale;
    const dh = ccImg.naturalHeight * ccScale;
    coverCropCtx.drawImage(ccImg, ccImgX, ccImgY, dw, dh);
}

coverCropArea.addEventListener("pointerdown", (e) => {
    if (e.isPrimary && coverCropArea.hasPointerCapture(e.pointerId) === false) {
        ccDrag = { x: e.clientX, y: e.clientY, sx: ccImgX, sy: ccImgY };
    }
    const pointers = coverCropArea.querySelectorAll(":hover") || [];
    coverCropArea.setPointerCapture(e.pointerId);
    const active = coverCropArea._activePointers || (coverCropArea._activePointers = new Map());
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 2) {
        const pts = [...active.values()];
        ccPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        ccPinchScale = ccScale;
        ccDrag = null;
    }
});
coverCropArea.addEventListener("pointermove", (e) => {
    const active = coverCropArea._activePointers;
    if (active && active.has(e.pointerId)) {
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (active && active.size === 2) {
        const pts = [...active.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (!dist || !ccPinchDist) return;
        const w = coverCropArea.clientWidth;
        const h = coverCropArea.clientHeight;
        const newScale = Math.min(Math.max(ccPinchScale * (dist / ccPinchDist), cropMinScale(ccImg, w, h)), cropMaxScale(ccImg, w, h));
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const rect = coverCropArea.getBoundingClientRect();
        const mx = cx - rect.left;
        const my = cy - rect.top;
        ccImgX = mx - (mx - ccImgX) * (newScale / ccScale);
        ccImgY = my - (my - ccImgY) * (newScale / ccScale);
        ccScale = newScale;
        ({ x: ccImgX, y: ccImgY } = clampedOffset(ccImgX, ccImgY, ccScale, ccImg, w, h));
        drawCoverCrop();
        return;
    }
    if (ccDrag) {
        const w = coverCropArea.clientWidth;
        const h = coverCropArea.clientHeight;
        ccImgX = ccDrag.sx + (e.clientX - ccDrag.x);
        ccImgY = ccDrag.sy + (e.clientY - ccDrag.y);
        ({ x: ccImgX, y: ccImgY } = clampedOffset(ccImgX, ccImgY, ccScale, ccImg, w, h));
        drawCoverCrop();
    }
});
coverCropArea.addEventListener("pointerup", (e) => {
    const active = coverCropArea._activePointers;
    if (active) active.delete(e.pointerId);
    if (active && active.size < 2) ccDrag = null;
});
coverCropArea.addEventListener("pointercancel", (e) => {
    const active = coverCropArea._activePointers;
    if (active) active.delete(e.pointerId);
    ccDrag = null;
});
coverCropArea.addEventListener("wheel", (e) => {
    e.preventDefault();
    const w = coverCropArea.clientWidth;
    const h = coverCropArea.clientHeight;
    const rect = coverCropArea.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(ccScale * factor, cropMinScale(ccImg, w, h)), cropMaxScale(ccImg, w, h));
    ccImgX = mx - (mx - ccImgX) * (newScale / ccScale);
    ccImgY = my - (my - ccImgY) * (newScale / ccScale);
    ccScale = newScale;
    ({ x: ccImgX, y: ccImgY } = clampedOffset(ccImgX, ccImgY, ccScale, ccImg, w, h));
    drawCoverCrop();
}, { passive: false });

function getCoverBlob() {
    return new Promise(resolve => {
        const c = document.createElement("canvas");
        c.width = 1200; c.height = 400;
        const ctx = c.getContext("2d");
        const aw = coverCropArea.clientWidth;
        const ah = coverCropArea.clientHeight;
        const sx = -ccImgX / ccScale;
        const sy = -ccImgY / ccScale;
        const sw = aw / ccScale;
        const sh = ah / ccScale;
        ctx.drawImage(ccImg, sx, sy, sw, sh, 0, 0, 1200, 400);
        c.toBlob(b => resolve(b), "image/jpeg", 0.88);
    });
}

document.getElementById("coverCropClose").addEventListener("click", () => { coverCropOverlay.classList.remove("open"); ccImg = null; });
document.getElementById("coverCropCancel").addEventListener("click", () => { coverCropOverlay.classList.remove("open"); ccImg = null; });

document.getElementById("coverCropConfirm").addEventListener("click", async () => {
    if (!ccImg) return;
    const blob = await getCoverBlob();
    coverCropOverlay.classList.remove("open");
    ccImg = null;
    const form = new FormData();
    form.append("cover", blob, "cover.jpg");
    const res = await fetch("/api/auth/cover", { method: "POST", body: form });
    const data = await res.json();
    if (data.cover) {
        profile.cover = data.cover;
        setCover(document.getElementById("coverImg"), data.cover);
    } else {
        showAlert(data.error || "Erro ao enviar capa");
    }
});

/* ── Avatar Upload ────────────────────────────────────────── */

document.getElementById("btnAvatarEdit").addEventListener("click", () => {
    document.getElementById("avatarFileInput").click();
});

document.getElementById("avatarFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.type === "image/gif") return uploadAvatarDirect(file);
    openAvatarCrop(file);
});

async function uploadAvatarDirect(file) {
    const form = new FormData();
    form.append("avatar", file, file.name);
    const res = await fetch("/api/auth/avatar", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (data && data.avatar) {
        profile.avatar = data.avatar;
        setAvatar(document.getElementById("avatarImg"), data.avatar);
    } else {
        showAlert((data && data.error) || "Erro ao enviar avatar");
    }
}

/* ── Avatar Crop ──────────────────────────────────────────── */

const cropOverlay = document.getElementById("cropOverlay");
const cropCanvas = document.getElementById("cropCanvas");
const cropArea = document.getElementById("cropArea");
const cropCtx = cropCanvas.getContext("2d");
let acImg = null, acScale = 1, acImgX = 0, acImgY = 0, acDrag = null;
let acPinchDist = 0, acPinchScale = 1;

function openAvatarCrop(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        acImg = img;
        cropOverlay.classList.add("open");
        requestAnimationFrame(() => requestAnimationFrame(() => resetAvatarCrop()));
    };
    img.src = url;
}

function resetAvatarCrop() {
    const s = cropArea.clientWidth;
    if (!s) return;
    acScale = cropMinScale(acImg, s, s);
    acImgX = (s - acImg.naturalWidth * acScale) / 2;
    acImgY = (s - acImg.naturalHeight * acScale) / 2;
    drawAvatarCrop();
}

function drawAvatarCrop() {
    const s = cropArea.clientWidth;
    if (!s) return;
    cropCanvas.width = s;
    cropCanvas.height = s;
    cropCtx.clearRect(0, 0, s, s);
    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    cropCtx.clip();
    const dw = acImg.naturalWidth * acScale;
    const dh = acImg.naturalHeight * acScale;
    cropCtx.drawImage(acImg, acImgX, acImgY, dw, dh);
    cropCtx.restore();
}

cropArea.addEventListener("pointerdown", (e) => {
    cropArea.setPointerCapture(e.pointerId);
    const active = cropArea._activePointers || (cropArea._activePointers = new Map());
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 2) {
        const pts = [...active.values()];
        acPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        acPinchScale = acScale;
        acDrag = null;
    } else if (active.size === 1) {
        acDrag = { x: e.clientX, y: e.clientY, sx: acImgX, sy: acImgY };
    }
});
cropArea.addEventListener("pointermove", (e) => {
    const active = cropArea._activePointers;
    if (active && active.has(e.pointerId)) {
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (active && active.size === 2) {
        const pts = [...active.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (!dist || !acPinchDist) return;
        const s = cropArea.clientWidth;
        const newScale = Math.min(Math.max(acPinchScale * (dist / acPinchDist), cropMinScale(acImg, s, s)), cropMaxScale(acImg, s, s));
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const rect = cropArea.getBoundingClientRect();
        const mx = cx - rect.left;
        const my = cy - rect.top;
        acImgX = mx - (mx - acImgX) * (newScale / acScale);
        acImgY = my - (my - acImgY) * (newScale / acScale);
        acScale = newScale;
        ({ x: acImgX, y: acImgY } = clampedOffset(acImgX, acImgY, acScale, acImg, s, s));
        drawAvatarCrop();
        return;
    }
    if (acDrag) {
        const s = cropArea.clientWidth;
        acImgX = acDrag.sx + (e.clientX - acDrag.x);
        acImgY = acDrag.sy + (e.clientY - acDrag.y);
        ({ x: acImgX, y: acImgY } = clampedOffset(acImgX, acImgY, acScale, acImg, s, s));
        drawAvatarCrop();
    }
});
cropArea.addEventListener("pointerup", (e) => {
    const active = cropArea._activePointers;
    if (active) active.delete(e.pointerId);
    if (active && active.size < 2) acDrag = null;
});
cropArea.addEventListener("pointercancel", (e) => {
    const active = cropArea._activePointers;
    if (active) active.delete(e.pointerId);
    acDrag = null;
});
cropArea.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = cropArea.clientWidth;
    const rect = cropArea.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(acScale * factor, cropMinScale(acImg, s, s)), cropMaxScale(acImg, s, s));
    acImgX = mx - (mx - acImgX) * (newScale / acScale);
    acImgY = my - (my - acImgY) * (newScale / acScale);
    acScale = newScale;
    ({ x: acImgX, y: acImgY } = clampedOffset(acImgX, acImgY, acScale, acImg, s, s));
    drawAvatarCrop();
}, { passive: false });

function getAvatarBlob() {
    return new Promise(resolve => {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 256;
        const ctx = c.getContext("2d");
        const s = cropArea.clientWidth;
        ctx.beginPath();
        ctx.arc(128, 128, 128, 0, Math.PI * 2);
        ctx.clip();
        const sx = -acImgX / acScale;
        const sy = -acImgY / acScale;
        const sw = s / acScale;
        ctx.drawImage(acImg, sx, sy, sw, sw, 0, 0, 256, 256);
        c.toBlob(b => resolve(b), "image/png");
    });
}

document.getElementById("cropClose").addEventListener("click", () => { cropOverlay.classList.remove("open"); acImg = null; });
document.getElementById("cropCancel").addEventListener("click", () => { cropOverlay.classList.remove("open"); acImg = null; });

document.getElementById("cropConfirm").addEventListener("click", async () => {
    if (!acImg) return;
    const blob = await getAvatarBlob();
    cropOverlay.classList.remove("open");
    acImg = null;
    const form = new FormData();
    form.append("avatar", blob, "avatar.png");
    const res = await fetch("/api/auth/avatar", { method: "POST", body: form });
    const data = await res.json();
    if (data.avatar) {
        profile.avatar = data.avatar;
        setAvatar(document.getElementById("avatarImg"), data.avatar);
    } else {
        showAlert(data.error || "Erro ao enviar avatar");
    }
});

/* ── Init ─────────────────────────────────────────────────── */

window.addEventListener("pagehide", saveProfileState);
window.addEventListener("pageshow", () => {
    if (profile) restoreProfileUI(readProfileState());
});

function readProfileState() {
    if (!profile?.username) return {};
    try {
        return JSON.parse(sessionStorage.getItem(profileCacheKey(profile.username)) || "null") || {};
    } catch {
        return {};
    }
}

loadProfile();
