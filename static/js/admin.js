let selected = new Set();
let allPosts = [];
let postFilter = "all";
let postSort = "recent";
let postQuery = "";
const status = document.getElementById("adminStatus");
const statusEleicao = document.getElementById("adminStatusEleicao");

function showStatus(msg) {
    status.textContent = msg;
    if (statusEleicao) statusEleicao.textContent = msg;
    setTimeout(() => {
        status.textContent = "";
        if (statusEleicao) statusEleicao.textContent = "";
    }, 3000);
}

const ACTIONS_HINT = "Selecione as imagens para realizar ações como excluir e remover likes.";
const ACTIONS_HINT_ELECAO = "Selecione as imagens para realizar ações como excluir, remover likes, exportar collage e definir vencedoras.";

function askConfirm(msg, confirmLabel = "Excluir") {
    return new Promise(resolve => {
        document.getElementById("confirmMsg").textContent = msg;
        const yesBtn = document.getElementById("confirmYes");
        yesBtn.textContent = confirmLabel;
        const modal = document.getElementById("confirmModal");
        modal.classList.add("open");
        const cleanup = (val) => {
            modal.classList.remove("open");
            yesBtn.onclick = null;
            document.getElementById("confirmNo").onclick = null;
            resolve(val);
        };
        yesBtn.onclick = () => cleanup(true);
        document.getElementById("confirmNo").onclick = () => cleanup(false);
    });
}

/* === Posts tab === */
function getPostType(post) {
    if (!post.media || !post.media.length) return "text";
    const hasImage = post.media.some(m => m.media_type === "image");
    const hasVideo = post.media.some(m => m.media_type === "video");
    if (hasVideo) return "video";
    if (hasImage) return "image";
    return "text";
}

function getFilteredPosts() {
    let posts = allPosts.filter(p => !p.eleicao);
    if (postFilter !== "all") posts = posts.filter(p => getPostType(p) === postFilter);

    const q = postQuery.trim().toLowerCase();
    if (q) {
        posts = posts.filter(p =>
            (p.owner || "").toLowerCase().includes(q) ||
            (p.caption || "").toLowerCase().includes(q)
        );
    }

    return [...posts].sort((a, b) => {
        if (postSort === "popular") {
            const la = a.likes || 0, lb = b.likes || 0;
            if (la !== lb) return lb - la;
        }
        const da = new Date(a.created_at || 0).getTime() || 0;
        const dbb = new Date(b.created_at || 0).getTime() || 0;
        return dbb - da;
    });
}

async function loadPosts() {
    const res = await fetch("/api/votos");
    allPosts = await res.json();
    renderPosts();
}

function renderPosts() {
    const grid = document.getElementById("adminGrid");
    const list = document.getElementById("adminTextList");
    const posts = getFilteredPosts();

    if (!posts.length) {
        grid.innerHTML = "";
        list.innerHTML = `<div class="admin-empty"><p>Nenhum post encontrado.</p></div>`;
        return;
    }

    grid.innerHTML = posts.map(img => {
        const type = getPostType(img);
        const typeBadge = type === "video" ? '<span class="admin-type-badge admin-type-video">Video</span>' : "";
        const body = type === "text"
            ? `<div class="admin-text-thumb">${esc(img.caption || "")}</div>`
            : type === "video"
                ? `<div class="admin-card-media"><video src="/images/${esc(img.name)}" muted playsinline preload="metadata"></video></div>`
                : `<div class="admin-card-media"><img src="/images/${esc(img.name)}" alt="${esc(img.name)}" loading="lazy"></div>`;
        return `
        <div class="admin-card" data-name="${esc(img.name)}">
            <div class="admin-card-info">
                <span style="font-weight: 700; font-size: 0.75rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">@${esc(img.owner || "\u2014")}</span>
                <div class="admin-card-caption">
                    ${img.caption ? esc(img.caption) : '<span style="color: var(--text-muted); font-style: italic;">Sem legenda</span>'}
                </div>
            </div>
            ${body}
            <input type="checkbox" class="admin-select">
            <div class="admin-card-tags">
                ${typeBadge}
                <button class="admin-nsfw-btn${img.nsfw ? ' active' : ''}" data-name="${esc(img.name)}" title="Marcar NSFW">NSFW</button>
                <button class="admin-eleicao-btn${img.eleicao ? ' active' : ''}" data-name="${esc(img.name)}" title="Marcar Eleição">Eleição</button>
                <span class="admin-card-likes"><span class="ico ico-upvote-filled admin-card-upvote" aria-hidden="true"></span> ${img.likes || 0}${img.likers && img.likers.length ? '<span class="admin-card-arrow"></span>' : ""}</span>
            </div>
            <div class="admin-likers">
                ${img.likers && img.likers.length
                    ? img.likers.map(u => `<span class="admin-liker-tag" data-user-id="${u.id}" data-image="${esc(img.name)}"><span class="admin-liker-name">@${esc(u.username)}</span><span class="ico ico-trash admin-liker-icon" aria-hidden="true"></span></span>`).join("")
                    : `<span style="font-size:0.6875rem;color:#9ca3af">Nenhum like</span>`}
            </div>
        </div>`;
    }).join("");

    list.innerHTML = "";

    document.querySelectorAll(".admin-card").forEach(card => {
        card.addEventListener("click", e => {
            if (e.target.closest(".admin-liker-tag") || e.target.closest(".admin-select") || e.target.closest(".admin-nsfw-btn") || e.target.closest(".admin-eleicao-btn")) return;
            card.classList.toggle("expanded");
        });

        const selectBtn = card.querySelector(".admin-select");
        if (selectBtn) {
            selectBtn.addEventListener("change", e => {
                e.stopPropagation();
                const name = card.dataset.name;
                if (e.target.checked) {
                    selected.add(name);
                    card.classList.add("selected");
                } else {
                    selected.delete(name);
                    card.classList.remove("selected");
                }
            });
        }
    });

    document.querySelectorAll(".admin-nsfw-btn").forEach(nsfwBtn => {
        nsfwBtn.addEventListener("click", async e => {
            e.stopPropagation();
            const name = nsfwBtn.dataset.name;
            const isActive = nsfwBtn.classList.contains("active");
            nsfwBtn.classList.toggle("active");
            try {
                await api("POST", "/api/admin/nsfw", { name, nsfw: !isActive });
                showStatus(isActive ? "NSFW removido" : "Marcado como NSFW");
            } catch { nsfwBtn.classList.toggle("active"); }
        });
    });

    document.querySelectorAll(".admin-eleicao-btn").forEach(eleicaoBtn => {
        eleicaoBtn.addEventListener("click", async e => {
            e.stopPropagation();
            const name = eleicaoBtn.dataset.name;
            const isActive = eleicaoBtn.classList.contains("active");
            eleicaoBtn.classList.toggle("active");
            try {
                await api("POST", "/api/admin/eleicao", { name, eleicao: !isActive });
                showStatus(isActive ? "Eleição removida" : "Marcada como Eleição");
            } catch { eleicaoBtn.classList.toggle("active"); }
        });
    });

    document.querySelectorAll(".admin-liker-tag").forEach(tag => {
        tag.addEventListener("click", async e => {
            e.stopPropagation();
            if (!await askConfirm("Remover este like?")) return;
            await api("DELETE", `/api/admin/likes/${encodeURIComponent(tag.dataset.image)}/${tag.dataset.userId}`);
            showStatus("Like removido");
            loadPosts();
        });
    });
}

/* Filters */
document.querySelectorAll(".admin-filter").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-filter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        postFilter = btn.dataset.filter;
        selected.clear();
        renderPosts();
    });
});

/* Sort dropdown + search */
const postsSortWrap = document.getElementById("postsSort");
if (postsSortWrap) {
    const sortBtn = document.getElementById("postsSortBtn");
    const sortMenu = document.getElementById("postsSortMenu");

    sortBtn.addEventListener("click", e => {
        e.stopPropagation();
        sortMenu.hidden = !sortMenu.hidden;
    });

    sortMenu.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => {
            postSort = b.dataset.sort;
            sortMenu.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
            sortMenu.hidden = true;
            renderPosts();
        });
    });

    document.addEventListener("click", e => {
        if (!postsSortWrap.contains(e.target)) sortMenu.hidden = true;
    });
}

document.getElementById("postsSearch")?.addEventListener("input", e => {
    postQuery = e.target.value;
    renderPosts();
});

/* Select all */
document.getElementById("adminSelectAll").addEventListener("click", () => {
    const cards = document.querySelectorAll("#tabPosts .admin-card");
    const names = [...cards].map(c => c.dataset.name);
    const allSelected = names.length > 0 && names.every(n => selected.has(n));
    cards.forEach(c => {
        const cb = c.querySelector(".admin-select");
        if (allSelected) {
            selected.delete(c.dataset.name);
            c.classList.remove("selected");
            if (cb) cb.checked = false;
        } else {
            selected.add(c.dataset.name);
            c.classList.add("selected");
            if (cb) cb.checked = true;
        }
    });
    document.getElementById("adminSelectAll").textContent = allSelected ? "Selecionar todas" : "Limpar selecao";
});

/* Delete selected */
document.getElementById("adminDeleteSelected").addEventListener("click", async () => {
    if (!selected.size) return showStatus(ACTIONS_HINT);
    if (!await askConfirm(`Excluir ${selected.size} post(s)?`)) return;
    const res = await api("DELETE", "/api/admin/images", { images: [...selected] });
    if (res.ok) {
        showStatus(`${selected.size} excluido(s)`);
        selected.clear();
        loadPosts();
    }
});

/* Remove likes */
document.getElementById("adminRemoveLikes").addEventListener("click", async () => {
    if (!selected.size) return showStatus(ACTIONS_HINT);
    if (!await askConfirm(`Remover likes de ${selected.size} post(s)?`)) return;
    const res = await api("DELETE", "/api/admin/likes", { images: [...selected] });
    if (res.ok) showStatus("Likes removidos");
    loadPosts();
});

/* === Users tab === */
let allUsers = [];

function getUserAvatar(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return "/static/svg/default-avatar.svg";
    return `/avatars/${avatar}`;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "Z");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadApprovalSetting() {
    try {
        const res = await api("GET", "/api/admin/settings/approval");
        const data = await res.json();
        const chk = document.getElementById("settingRequireApproval");
        if (chk) chk.checked = !!data.require_approval;
    } catch {}
}

document.getElementById("settingRequireApproval")?.addEventListener("change", async e => {
    try {
        await api("PUT", "/api/admin/settings/approval", { require_approval: e.target.checked });
        showStatus(e.target.checked ? "Aprovação ativada" : "Aprovação desativada");
    } catch { showStatus("Erro ao salvar"); }
});

function renderUsers(filter = "") {
    const list = document.getElementById("usersList");
    const count = document.getElementById("usersCount");
    const filtered = filter
        ? allUsers.filter(u => u.username.toLowerCase().includes(filter.toLowerCase()))
        : allUsers;

    count.textContent = `${filtered.length} de ${allUsers.length}`;

    if (!filtered.length) {
        list.innerHTML = `<div class="users-empty">${filter ? "Nenhum usuário encontrado" : "Nenhum usuário ainda."}</div>`;
        return;
    }

    list.innerHTML = filtered.map(u => `
        <div class="user-card${!u.is_approved ? ' user-card-pending' : ''}" data-user-id="${u.id}" data-username="${esc(u.username)}" style="cursor:pointer">
            <div class="user-card-row" data-username="${esc(u.username)}" style="cursor:pointer">
                <div class="user-card-avatar" data-username="${esc(u.username)}">
                    <img src="${getUserAvatar(u.avatar)}" alt="${esc(u.username)}" data-username="${esc(u.username)}">
                </div>
                <div class="user-card-info" data-username="${esc(u.username)}">
                    <div class="user-card-name" style="color:${u.color || 'var(--text)'}" data-username="${esc(u.username)}">${esc(u.username)}</div>
                    <div class="user-card-meta" data-username="${esc(u.username)}">
                        <span class="user-card-badge ${u.is_admin ? 'badge-admin' : 'badge-user'}">${u.is_admin ? 'Admin' : 'User'}</span>
                        ${!u.is_approved ? '<span class="user-card-badge badge-pending">Pendente</span>' : ''}
                        <span>${formatDate(u.created_at)}</span>
                    </div>
                </div>
            </div>
            <div class="user-card-actions">
                ${!u.is_approved ? `<button class="admin-btn small" data-approve="${u.id}">Aprovar</button>` : ""}
                ${!u.is_admin ? `<button class="admin-btn primary small" data-promote="${u.id}">Promover</button>` : ""}
                <button class="admin-btn small" data-rename="${u.id}" data-name="${esc(u.username)}">Renomear</button>
                <button class="admin-btn small" data-reset="${u.id}" data-name="${esc(u.username)}">Resetar senha</button>
                <button class="admin-btn danger small" data-delete="${u.id}">Excluir</button>
            </div>
        </div>
    `).join("");

    list.querySelectorAll(".user-card").forEach(card => {
        card.addEventListener("click", (e) => {
            if (e.target.closest("button") || e.target.closest("input")) return;
            const uname = card.dataset.username;
            if (uname) location.href = `/perfil/${encodeURIComponent(uname)}`;
        });
    });

    list.querySelectorAll("[data-approve]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!await askConfirm("Aprovar este usuário?")) return;
            const res = await api("PUT", `/api/admin/users/${btn.dataset.approve}/approve`);
            if (res.ok) {
                showStatus("Usuário aprovado");
                loadUsers();
            } else {
                showStatus("Erro ao aprovar");
            }
        });
    });

    list.querySelectorAll("[data-promote]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!await askConfirm("Tornar este usuário admin?", "Promover")) return;
            await api("PUT", `/api/admin/users/${btn.dataset.promote}/promote`);
            showStatus("Usuário promovido a admin");
            loadUsers();
        });
    });

    list.querySelectorAll("[data-rename]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const card = btn.closest(".user-card");
            const nameEl = card.querySelector(".user-card-name");
            const infoEl = card.querySelector(".user-card-info");
            const currentName = btn.dataset.name;

            const input = document.createElement("input");
            input.type = "text";
            input.className = "user-card-rename-input";
            input.value = currentName;
            input.minLength = 3;

            nameEl.replaceWith(input);
            input.focus();
            input.select();

            let isSaving = false;
            const restore = () => {
                const el = card.querySelector(".user-card-rename-input");
                if (el) el.replaceWith(nameEl);
            };

            const save = async () => {
                if (isSaving) return;
                const newName = input.value.trim();
                if (newName.length < 3) { showStatus("Mínimo 3 caracteres"); restore(); return; }
                if (newName === currentName) { restore(); return; }
                isSaving = true;
                const res = await api("PUT", `/api/admin/users/${btn.dataset.rename}/rename`, { username: newName });
                const data = await res.json().catch(() => null);
                if (res.ok) {
                    showStatus("Usuário renomeado");
                    loadUsers();
                } else {
                    showStatus(data?.error || "Erro ao renomear");
                    isSaving = false;
                    restore();
                }
            };

            input.addEventListener("keydown", e => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") restore();
            });
            input.addEventListener("blur", save);
        });
    });

    list.querySelectorAll("[data-reset]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const newPass = await showPrompt(`Digite a nova senha para @${btn.dataset.name}`, "", "Resetar senha", "Redefinir", "Nova senha (mín. 4)");
            if (newPass === null) return;
            if (!newPass || newPass.trim().length < 4) { showStatus("Mínimo 4 caracteres"); return; }
            const res = await api("PUT", `/api/admin/users/${btn.dataset.reset}/reset-password`, { password: newPass.trim() });
            const data = await res.json().catch(()=>null);
            if (res.ok) showStatus(`Senha de @${btn.dataset.name} redefinida`);
            else showStatus(data?.error || "Erro ao resetar");
        });
    });

    list.querySelectorAll("[data-delete]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!await askConfirm("Excluir este usuário?")) return;
            await api("DELETE", `/api/admin/users/${btn.dataset.delete}`);
            showStatus("Usuário excluído");
            loadUsers();
        });
    });
}

async function loadUsers() {
    const list = document.getElementById("usersList");
    list.innerHTML = `<div class="users-empty">Carregando...</div>`;
    const res = await fetch("/api/admin/users");
    allUsers = await res.json();
    const search = document.getElementById("usersSearch");
    renderUsers(search.value);
}

document.getElementById("usersSearch").addEventListener("input", e => {
    renderUsers(e.target.value);
});

/* === Turnos tab === */
async function loadTurnos() {
    const res = await fetch("/api/admin/turnos");
    const data = await res.json();
    const grid = document.getElementById("turnoGrid");

    document.getElementById("turnoNumber").textContent = data.current_round;
    document.getElementById("turnoActiveCount").textContent = data.active_count;

    const modeRes = await fetch("/api/admin/turnos/mode");
    const mode = await modeRes.json();
    document.getElementById("turnoSingleVote").checked = mode.single_vote_mode;

    grid.innerHTML = data.images.map(img => `
        <div class="admin-card">
            <img src="/images/${img.name}" alt="${img.name}" loading="lazy">
            <div class="admin-card-info">
                <span>${esc(img.owner || "—")}</span>
                <span><span class="ico ico-upvote-filled admin-card-upvote" aria-hidden="true"></span> ${img.likes || 0}</span>
            </div>
        </div>
    `).join("");

    const history = document.getElementById("turnosHistory");
    history.innerHTML = data.history.length
        ? `<p>Histórico:</p>` + data.history.map(h =>
            `<span class="turnos-history-item">Turno ${h.round_number}: top ${h.cutoff}</span>`
          ).join("")
        : "";
}

document.getElementById("turnoAdvance").addEventListener("click", async () => {
    const cutoff = parseInt(document.getElementById("turnoCutoff").value, 10);
    if (!cutoff || cutoff < 1) {
        showStatus("Informe um número válido");
        return;
    }
    if (!await askConfirm(`Avançar turno mantendo as ${cutoff} mais curtidas?`, "Confirmar")) return;
    const res = await api("POST", "/api/admin/turnos/advance", { cutoff });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        showStatus(data?.error || "Erro ao avançar turno");
        return;
    }
    showStatus(`Turno ${data.round} avançado: ${data.passed.length} passaram, ${data.removed.length} removidas`);
    loadTurnos();
});

document.getElementById("turnoSingleVote").addEventListener("change", async e => {
    const res = await api("POST", "/api/admin/turnos/mode", { enabled: e.target.checked });
    const data = await res.json().catch(() => null);
    showStatus(data?.single_vote_mode ? "Modo voto único ativado" : "Modo voto único desativado");
});

document.getElementById("turnoReset").addEventListener("click", async () => {
    if (!await askConfirm("Resetar turnos? Limpa apenas o histórico.", "Resetar")) return;
    await api("POST", "/api/admin/turnos/reset");
    showStatus("Turnos resetados");
    loadTurnos();
});

/* === Tab switching === */
let currentTab = "posts";
let currentSubtab = "posts";

document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentTab = tab.dataset.tab;
        document.getElementById("tabPosts").style.display = currentTab === "posts" ? "" : "none";
        document.getElementById("tabUsers").style.display = currentTab === "users" ? "" : "none";
        document.getElementById("tabEleicao").style.display = currentTab === "eleicao" ? "" : "none";
        document.getElementById("actionsPosts").style.display = currentTab === "posts" ? "" : "none";
        document.getElementById("actionsUsers").style.display = "none";
        if (currentTab === "posts") loadPosts();
        if (currentTab === "users") {
            loadUsers();
            loadApprovalSetting();
        }
        if (currentTab === "eleicao") {
            if (currentSubtab === "turnos") loadTurnos();
            else loadEleicaoPosts();
        }
    });
});

/* === Subtab switching (Eleição) === */
document.querySelectorAll(".admin-subtab").forEach(subtab => {
    subtab.addEventListener("click", () => {
        document.querySelectorAll(".admin-subtab").forEach(s => s.classList.remove("active"));
        subtab.classList.add("active");
        currentSubtab = subtab.dataset.subtab;
        document.getElementById("subtabTurnos").style.display = currentSubtab === "turnos" ? "" : "none";
        document.getElementById("subtabPosts").style.display = currentSubtab === "posts" ? "" : "none";
        if (currentSubtab === "turnos") loadTurnos();
        else if (currentSubtab === "posts") loadEleicaoPosts();
    });
});

/* === Eleicao posts subtab === */
let selectedEleicao = new Set();
let winnerNames = new Set();

function renderEleicaoPosts() {
    const grid = document.getElementById("eleicaoPostsGrid");
    const posts = allPosts.filter(p => p.eleicao && !winnerNames.has(p.name));

    const q = postQuery.trim().toLowerCase();
    const filtered = q
        ? posts.filter(p =>
            (p.owner || "").toLowerCase().includes(q) ||
            (p.caption || "").toLowerCase().includes(q)
        )
        : posts;

    const sorted = [...filtered].sort((a, b) => {
        if (postSort === "popular") {
            const la = a.likes || 0, lb = b.likes || 0;
            if (la !== lb) return lb - la;
        }
        const da = new Date(a.created_at || 0).getTime() || 0;
        const dbb = new Date(b.created_at || 0).getTime() || 0;
        return dbb - da;
    });

    if (!sorted.length) {
        grid.innerHTML = `<div class="admin-empty"><p>Nenhum post com tag Eleição.</p></div>`;
        return;
    }

    grid.innerHTML = sorted.map(img => {
        const type = getPostType(img);
        const typeBadge = type === "video" ? '<span class="admin-type-badge admin-type-video">Video</span>' : "";
        const body = type === "text"
            ? `<div class="admin-text-thumb">${esc(img.caption || "")}</div>`
            : type === "video"
                ? `<div class="admin-card-media"><video src="/images/${esc(img.name)}" muted playsinline preload="metadata"></video></div>`
                : `<div class="admin-card-media"><img src="/images/${esc(img.name)}" alt="${esc(img.name)}" loading="lazy"></div>`;
        return `
        <div class="admin-card" data-name="${esc(img.name)}">
            <div class="admin-card-info">
                <span style="font-weight: 700; font-size: 0.75rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">@${esc(img.owner || "\u2014")}</span>
                <div class="admin-card-caption">
                    ${img.caption ? esc(img.caption) : '<span style="color: var(--text-muted); font-style: italic;">Sem legenda</span>'}
                </div>
            </div>
            ${body}
            <input type="checkbox" class="admin-select">
            <div class="admin-card-tags">
                ${typeBadge}
                <button class="admin-nsfw-btn${img.nsfw ? ' active' : ''}" data-name="${esc(img.name)}" title="Marcar NSFW">NSFW</button>
                <button class="admin-eleicao-btn active" data-name="${esc(img.name)}" title="Marcar Eleição">Eleição</button>
                <span class="admin-card-likes"><span class="ico ico-upvote-filled admin-card-upvote" aria-hidden="true"></span> ${img.likes || 0}${img.likers && img.likers.length ? '<span class="admin-card-arrow"></span>' : ""}</span>
            </div>
            <div class="admin-likers">
                ${img.likers && img.likers.length
                    ? img.likers.map(u => `<span class="admin-liker-tag" data-user-id="${u.id}" data-image="${esc(img.name)}"><span class="admin-liker-name">@${esc(u.username)}</span><span class="ico ico-trash admin-liker-icon" aria-hidden="true"></span></span>`).join("")
                    : `<span style="font-size:0.6875rem;color:#9ca3af">Nenhum like</span>`}
            </div>
        </div>`;
    }).join("");

    grid.querySelectorAll(".admin-card").forEach(card => {
        card.addEventListener("click", e => {
            if (e.target.closest(".admin-liker-tag") || e.target.closest(".admin-select") || e.target.closest(".admin-nsfw-btn") || e.target.closest(".admin-eleicao-btn")) return;
            card.classList.toggle("expanded");
        });

        const selectBtn = card.querySelector(".admin-select");
        if (selectBtn) {
            selectBtn.addEventListener("change", e => {
                e.stopPropagation();
                const name = card.dataset.name;
                if (e.target.checked) {
                    selectedEleicao.add(name);
                    card.classList.add("selected");
                } else {
                    selectedEleicao.delete(name);
                    card.classList.remove("selected");
                }
            });
        }
    });

    grid.querySelectorAll(".admin-nsfw-btn").forEach(nsfwBtn => {
        nsfwBtn.addEventListener("click", async e => {
            e.stopPropagation();
            const name = nsfwBtn.dataset.name;
            const isActive = nsfwBtn.classList.contains("active");
            nsfwBtn.classList.toggle("active");
            try {
                await api("POST", "/api/admin/nsfw", { name, nsfw: !isActive });
                showStatus(isActive ? "NSFW removido" : "Marcado como NSFW");
            } catch { nsfwBtn.classList.toggle("active"); }
        });
    });

    grid.querySelectorAll(".admin-eleicao-btn").forEach(eleicaoBtn => {
        eleicaoBtn.addEventListener("click", async e => {
            e.stopPropagation();
            const name = eleicaoBtn.dataset.name;
            eleicaoBtn.classList.toggle("active");
            try {
                await api("POST", "/api/admin/eleicao", { name, eleicao: eleicaoBtn.classList.contains("active") });
                showStatus(eleicaoBtn.classList.contains("active") ? "Marcada como Eleição" : "Eleição removida");
                await loadPosts();
                renderEleicaoPosts();
            } catch { eleicaoBtn.classList.toggle("active"); }
        });
    });

    grid.querySelectorAll(".admin-liker-tag").forEach(tag => {
        tag.addEventListener("click", async e => {
            e.stopPropagation();
            if (!await askConfirm("Remover este like?")) return;
            await api("DELETE", `/api/admin/likes/${encodeURIComponent(tag.dataset.image)}/${tag.dataset.userId}`);
            showStatus("Like removido");
            await loadPosts();
            renderEleicaoPosts();
        });
    });
}

async function loadEleicaoPosts() {
    if (!allPosts.length) await loadPosts();
    try {
        const res = await fetch("/api/admin/eleicao/vencedoras/all");
        const winners = await res.json();
        winnerNames = new Set(winners.map(w => w.image_name));
    } catch { winnerNames = new Set(); }
    renderEleicaoPosts();
}

/* Select all eleicao posts */
document.getElementById("adminSelectAllEleicaoPosts")?.addEventListener("click", () => {
    const cards = document.querySelectorAll("#eleicaoPostsGrid .admin-card");
    const names = [...cards].map(c => c.dataset.name);
    const allSelected = names.length > 0 && names.every(n => selectedEleicao.has(n));
    cards.forEach(c => {
        const cb = c.querySelector(".admin-select");
        if (allSelected) {
            selectedEleicao.delete(c.dataset.name);
            c.classList.remove("selected");
            if (cb) cb.checked = false;
        } else {
            selectedEleicao.add(c.dataset.name);
            c.classList.add("selected");
            if (cb) cb.checked = true;
        }
    });
    document.getElementById("adminSelectAllEleicaoPosts").textContent = allSelected ? "Selecionar todas" : "Limpar selecao";
});

/* Delete selected eleicao posts */
document.getElementById("adminDeleteSelectedEleicao")?.addEventListener("click", async () => {
    if (!selectedEleicao.size) return showStatus(ACTIONS_HINT_ELECAO);
    if (!await askConfirm(`Excluir ${selectedEleicao.size} post(s)?`)) return;
    const res = await api("DELETE", "/api/admin/images", { images: [...selectedEleicao] });
    if (res.ok) {
        showStatus(`${selectedEleicao.size} excluido(s)`);
        selectedEleicao.clear();
        loadPosts();
        renderEleicaoPosts();
    }
});

/* Remove likes eleicao posts */
document.getElementById("adminRemoveLikesEleicao")?.addEventListener("click", async () => {
    if (!selectedEleicao.size) return showStatus(ACTIONS_HINT_ELECAO);
    if (!await askConfirm(`Remover likes de ${selectedEleicao.size} post(s)?`)) return;
    const res = await api("DELETE", "/api/admin/likes", { images: [...selectedEleicao] });
    if (res.ok) showStatus("Likes removidos");
    loadPosts();
    renderEleicaoPosts();
});

/* Export collage eleicao posts */
document.getElementById("adminExportCollageEleicao")?.addEventListener("click", async () => {
    const btn = document.getElementById("adminExportCollageEleicao");
    const original = btn.textContent;
    if (!selectedEleicao.size) return showStatus(ACTIONS_HINT_ELECAO);
    btn.disabled = true;
    btn.textContent = "Aguarde...";
    try {
        const res = await api("POST", "/api/admin/collage", { images: [...selectedEleicao] });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            showStatus(data?.error || "Erro ao exportar");
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "collage.png";
        a.click();
        URL.revokeObjectURL(url);
        showStatus("Collage exportada");
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
});

/* Vencedora from eleicao posts subtab */
document.getElementById("adminAddWinnerFromPosts")?.addEventListener("click", () => {
    const names = [...selectedEleicao];
    if (!names.length) { showStatus(ACTIONS_HINT_ELECAO); return; }
    if (names.length > 1) { showAlert("Selecione apenas uma imagem para marcar como vencedora."); return; }
    const post = allPosts.find(p => p.name === names[0]);
    if (!post || !post.eleicao) { showAlert("Apenas imagens com tag Eleição podem ser vencedoras."); return; }

    const overlay = document.getElementById("winnerModal");
    const previewWrap = document.getElementById("winnerImages");
    const captionInput = document.getElementById("winnerCaption");
    const numberInput = document.getElementById("winnerNumber");
    const dateInput = document.getElementById("winnerDate");

    previewWrap.innerHTML = `<img src="/images/${esc(names[0])}" alt="${esc(names[0])}" loading="lazy">`;
    captionInput.value = "";
    numberInput.value = "";
    dateInput.value = new Date().toISOString().slice(0, 10);
    overlay.classList.add("open");

    document.getElementById("winnerCancel").onclick = () => overlay.classList.remove("open");
    overlay.addEventListener("click", function onClose(e) {
        if (e.target === overlay) { overlay.classList.remove("open"); overlay.removeEventListener("click", onClose); }
    });

    document.getElementById("winnerConfirm").onclick = async () => {
        const numVal = numberInput.value.trim().replace(/^#/, "");
        const body = { image_name: names[0], caption: captionInput.value.trim() };
        if (numVal) body.number = parseInt(numVal, 10);
        if (dateInput.value) body.date = dateInput.value;
        const res = await api("POST", "/api/admin/eleicao/vencedoras", body);
        const data = await res.json().catch(() => null);
        if (res.ok) {
            showStatus(`Vencedora #${String(data.number).padStart(4, "0")} salva`);
            overlay.classList.remove("open");
            renderEleicaoPosts();
        } else {
            showStatus(data?.error || "Erro ao salvar");
        }
    };
});

/* === Winners admin (removido - gestão feita na /eleicao) === */

/* === Helpers === */
async function api(method, url, body) {
    return fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined
    });
}

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

loadPosts();
