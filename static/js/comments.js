let currentUserId = null;
let isAdmin = false;
const commentsCache = new Map();
let myCommentLikes = new Set();
let replyParentId = null;

const commentColors = ["#FA8128", "#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#84cc16"];

function userColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    }
    return commentColors[hash % commentColors.length];
}

async function fetchCurrentUser() {
    try {
        const data = await fetchCurrentMe();
        if (data.user) {
            currentUserId = data.user.id;
            isAdmin = data.user.is_admin || false;
        }
    } catch { /* ignore */ }
}

async function fetchMyCommentLikes() {
    try {
        const res = await fetch("/api/comment-likes");
        const data = await res.json();
        myCommentLikes = new Set(data.likes || []);
    } catch { /* ignore */ }
}

function currentImageName() {
    return "";
}

function avatarUrl(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return "/static/svg/default-avatar.svg";
    return `/avatars/${avatar}`;
}

function timeAgo(dateStr) {
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

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function parseMentions(text) {
    return esc(text).replace(/@(\w+)/g, '<span class="comment-mention">@$1</span>');
}

async function loadComments(forceRefresh = false) {
    const imgName = currentImageName();
    const list = document.getElementById("commentsList");
    if (!imgName || !list) return;

    if (!forceRefresh && commentsCache.has(imgName)) {
        renderComments(commentsCache.get(imgName));
        return;
    }

    try {
        const res = await fetch(`/api/comments/${imgName}`);
        const comments = await res.json();
        commentsCache.set(imgName, comments);
        renderComments(comments);
    } catch {
        list.innerHTML = "";
    }
}

function buildTree(comments) {
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

function renderNode(c, depth) {
    const canDelete = isAdmin || currentUserId === c.user_id;
    const cls = ["comment"];
    if (depth > 0) cls.push("comment-reply");
    if (depth === 1) cls.push("comment-depth-1");
    if (depth >= 2) cls.push("comment-depth-2");

    const liked = myCommentLikes.has(c.id);
    const likes = c.likes || 0;

    let html = `<div class="${cls.join(" ")}" data-id="${c.id}">`;
    html += `<div class="comment-main">`;
    html += `<div class="comment-avatar" data-comment-username="${esc(c.username)}"><img src="${avatarUrl(c.avatar)}" alt=""></div>`;
    html += `<div class="comment-body">`;
    html += `<div class="comment-bubble">`;
    html += `<div class="comment-user-row" data-comment-username="${esc(c.username)}" role="button" tabindex="0"><span class="comment-user" style="color:${c.color || userColor(c.username)}">${esc(c.display_name || c.username)}</span><span class="comment-handle">@${esc(c.username)}</span></div>`;
    html += `<span class="comment-text">${parseMentions(c.text)}</span>`;
    if (c.media_name) {
        if (c.media_type === "video") {
            html += `<div class="comment-media" style="margin-top:6px;">${createVideoPlayerHTML("/comment-media/" + esc(c.media_name))}</div>`;
        } else {
            html += `<div class="comment-media" style="margin-top:6px;"><img src="/comment-media/${esc(c.media_name)}" alt="" loading="lazy" style="max-width:180px;max-height:140px;border-radius:8px;object-fit:cover;display:block;"></div>`;
        }
    }
    html += `</div>`;
    html += `<div class="comment-meta">`;
    html += `<span class="comment-time">${timeAgo(c.created_at)}</span>`;
    if (currentUserId) {
        html += `<button class="comment-like-btn${liked ? " liked" : ""}" data-id="${c.id}"><svg width="12" height="12" viewBox="0 0 20 20" fill="${liked ? "#FA8128" : "none"}" stroke="${liked ? "#FA8128" : "currentColor"}" stroke-width="2"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10z"/></svg></button>`;
        html += `<span class="comment-like-count" data-id="${c.id}"${likes > 0 ? "" : " style='display:none'"}>${likes || ""}</span>`;
        html += `<div class="comment-likers" data-id="${c.id}" hidden></div>`;
        html += `<button class="comment-reply-btn" data-id="${c.id}" data-user="${esc(c.username)}">Responder</button>`;
    }
    html += `</div></div>`;
    const canEdit = currentUserId === c.user_id;
    if (canEdit || canDelete) {
        html += `<div class="comment-owner-actions">`;
        html += `<button type="button" class="comment-menu-btn" title="Opções" aria-label="Opções do comentário" aria-expanded="false" aria-haspopup="menu"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>`;
        html += `<div class="comment-menu" hidden role="menu">`;
        if (canEdit) {
            html += `<button type="button" class="comment-menu-item comment-edit" role="menuitem" aria-label="Editar comentário" data-id="${c.id}" data-text="${esc(c.text)}">Editar</button>`;
        }
        if (canDelete) {
            html += `<button type="button" class="comment-menu-item comment-delete" role="menuitem" aria-label="Excluir comentário" data-id="${c.id}">Excluir</button>`;
        }
        html += `</div></div>`;
    }
    html += `</div>`;

    if (c.replies && c.replies.length) {
        html += `<div class="comment-children">`;
        html += c.replies.map(r => renderNode(r, depth + 1)).join("");
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function renderComments(comments) {
    const list = document.getElementById("commentsList");
    const countEl = document.getElementById("comment-count");
    if (countEl) countEl.textContent = comments.length > 0 ? comments.length : "";

    if (!comments.length) {
        list.innerHTML = `<div class="comment"><div class="comment-main"><div class="comment-body"><span class="comment-text" style="color:var(--text-muted)">Nenhum comentário ainda</span></div></div></div>`;
        return;
    }

    const tree = buildTree(comments);
    list.innerHTML = tree.map(c => renderNode(c, 0)).join("");
    list.querySelectorAll(".video-player").forEach(initVideoPlayer);
}

/* === Autocomplete @mentions === */
let mentionDropdown = null;
let mentionInput = null;
let mentionStart = -1;
let mentionQuery = "";
let mentionUsers = [];
let mentionIndex = 0;

function createMentionDropdown() {
    if (mentionDropdown) mentionDropdown.remove();
    mentionDropdown = document.createElement("div");
    mentionDropdown.className = "mention-dropdown";
    document.body.appendChild(mentionDropdown);
}

function hideMentionDropdown() {
    if (mentionDropdown) { mentionDropdown.remove(); mentionDropdown = null; }
    mentionUsers = [];
    mentionIndex = 0;
    mentionStart = -1;
}

async function searchUsers(query) {
    try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        return await res.json();
    } catch { return []; }
}

function renderMentionDropdown() {
    if (!mentionDropdown || !mentionUsers.length) { hideMentionDropdown(); return; }

    const filtered = mentionUsers.filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()));
    if (!filtered.length) { hideMentionDropdown(); return; }

    mentionDropdown.innerHTML = filtered.map((u, i) => `
        <div class="mention-option${i === mentionIndex ? " active" : ""}" data-username="${esc(u.username)}">
            <img class="mention-option-avatar" src="${avatarUrl(u.avatar)}" alt="">
            <span class="mention-option-name">${esc(u.username)}</span>
        </div>
    `).join("");

    const rect = mentionInput.getBoundingClientRect();
    const ddHeight = Math.min(filtered.length * 40, 200);
    const spaceAbove = rect.top;
    const showAbove = spaceAbove >= ddHeight + 8;

    mentionDropdown.style.left = rect.left + "px";
    mentionDropdown.style.width = Math.min(220, rect.width) + "px";

    if (showAbove) {
        mentionDropdown.style.top = "";
        mentionDropdown.style.bottom = (window.innerHeight - rect.top + 4) + "px";
    } else {
        mentionDropdown.style.bottom = "";
        mentionDropdown.style.top = (rect.bottom + 4) + "px";
    }

    mentionDropdown.querySelectorAll(".mention-option").forEach(opt => {
        opt.addEventListener("mousedown", e => {
            e.preventDefault();
            insertMention(opt.dataset.username);
        });
    });
}

function insertMention(username) {
    const val = mentionInput.value;
    const before = val.slice(0, mentionStart);
    const after = val.slice(mentionInput.selectionStart);
    mentionInput.value = before + "@" + username + " " + after;
    mentionInput.focus();
    const pos = before.length + username.length + 2;
    mentionInput.setSelectionRange(pos, pos);
    hideMentionDropdown();
}

function handleMentionInput(e) {
    mentionInput = e.target;
    const input = e.target;
    const val = input.value;
    const cursor = input.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);

    if (atMatch) {
        mentionStart = atMatch.index;
        mentionQuery = atMatch[1];
        if (!mentionDropdown) createMentionDropdown();
        searchUsers(mentionQuery).then(users => {
            mentionUsers = users;
            mentionIndex = 0;
            renderMentionDropdown();
        });
    } else {
        hideMentionDropdown();
    }
}

function handleMentionKeydown(e) {
    if (!mentionDropdown || !mentionUsers.length) return;
    const filtered = mentionUsers.filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()));
    if (!filtered.length) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionIndex = (mentionIndex + 1) % filtered.length;
        renderMentionDropdown();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionIndex = (mentionIndex - 1 + filtered.length) % filtered.length;
        renderMentionDropdown();
    } else if (e.key === "Enter" && mentionStart >= 0) {
        e.preventDefault();
        insertMention(filtered[mentionIndex].username);
    } else if (e.key === "Escape") {
        hideMentionDropdown();
    }
}

/* === Comment Like === */
document.addEventListener("click", async e => {
    const authorEl = e.target.closest("[data-comment-username]");
    if (authorEl && authorEl.dataset.commentUsername) {
        goToProfile(authorEl.dataset.commentUsername);
        return;
    }

    const likeCountEl = e.target.closest(".comment-like-count");
    if (likeCountEl) {
        e.stopPropagation();
        const id = parseInt(likeCountEl.dataset.id);
        const commentEl = likeCountEl.closest(".comment");
        const likersBox = commentEl.querySelector(`.comment-likers[data-id="${id}"]`);
        if (!likersBox) return;
        if (!likersBox.hidden) { likersBox.hidden = true; return; }
        likersBox.innerHTML = "Carregando...";
        likersBox.hidden = false;
        try {
            const res = await fetch(`/api/comment-likers/${id}`);
            const likers = await res.json();
            likersBox.innerHTML = likers.length
                ? likers.map(u => `<span class="comment-liker-tag">@${esc(u.username)}</span>`).join("")
                : `<span class="comment-liker-tag" style="color:#a1a1aa">Ninguém ainda</span>`;
        } catch { likersBox.hidden = true; }
        return;
    }

    const likeBtn = e.target.closest(".comment-like-btn");
    if (likeBtn) {
        e.stopPropagation();
        const id = parseInt(likeBtn.dataset.id);
        const wasLiked = myCommentLikes.has(id);
        const delta = wasLiked ? -1 : 1;
        if (wasLiked) myCommentLikes.delete(id);
        else myCommentLikes.add(id);

        const svg = likeBtn.querySelector("svg");
        const countEl = likeBtn.parentElement.querySelector(`.comment-like-count[data-id="${id}"]`);
        const count = (parseInt(countEl?.textContent) || 0) + delta;
        svg.setAttribute("fill", !wasLiked ? "var(--accent)" : "none");
        svg.setAttribute("stroke", !wasLiked ? "var(--accent)" : "currentColor");
        if (countEl) {
            countEl.textContent = count > 0 ? count : "";
            countEl.style.display = count > 0 ? "" : "none";
        }
        likeBtn.classList.toggle("liked", !wasLiked);

        try {
            const res = await fetch(`/api/comment-likes/${id}`, { method: wasLiked ? "DELETE" : "POST" });
            if (!res.ok) throw new Error();
        } catch {
            if (wasLiked) myCommentLikes.add(id);
            else myCommentLikes.delete(id);
            svg.setAttribute("fill", wasLiked ? "var(--accent)" : "none");
            svg.setAttribute("stroke", wasLiked ? "var(--accent)" : "currentColor");
            const newCount = (parseInt(countEl?.textContent) || 0) - delta;
            if (countEl) {
                countEl.textContent = newCount > 0 ? newCount : "";
                countEl.style.display = newCount > 0 ? "" : "none";
            }
            likeBtn.classList.toggle("liked", wasLiked);
        }
        return;
    }

    /* === Reply === */
    const replyBtn = e.target.closest(".comment-reply-btn");
    if (replyBtn) {
        e.stopPropagation();
        hideMentionDropdown();
        const commentId = parseInt(replyBtn.dataset.id);
        const username = replyBtn.dataset.user;
        replyParentId = commentId;
        const input = document.getElementById("commentInput");
        if (input) {
            input.placeholder = `Responder @${username}...`;
            input.focus();
        }
        return;
    }

    /* === Edit === */
    const editBtn = e.target.closest(".comment-edit");
    if (editBtn) {
        e.stopPropagation();
        const id = editBtn.dataset.id;
        const currentText = editBtn.dataset.text || "";

        const commentEl = editBtn.closest(".comment") || document.querySelector(`.comment[data-id="${id}"]`);
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
                .then(async data => {
                    if (data.id) {
                        const imgName = currentImageName();
                        commentsCache.delete(imgName);
                        await loadComments(true);
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

    /* === Delete === */
    const btn = e.target.closest(".comment-delete");
    if (btn) {
        e.stopPropagation();
        try {
            await fetch(`/api/comments/id/${btn.dataset.id}`, { method: "DELETE" });
            const imgName = currentImageName();
            commentsCache.delete(imgName);
            await loadComments(true);
        } catch { /* ignore */ }
    }
});

document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const authorEl = e.target.closest(".comment-user-row[data-comment-username]");
    if (!authorEl || !authorEl.dataset.commentUsername) return;
    e.preventDefault();
    goToProfile(authorEl.dataset.commentUsername);
});

/* === Main form (carousel comment — removed, kept as no-op guard) === */
document.getElementById("commentForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (mentionDropdown && mentionUsers.length) return;
    const input = document.getElementById("commentInput");
    const text = input.value.trim();
    if (!text) return;

    const slides = document.querySelectorAll(".carousel-slide");
    const dots = document.querySelectorAll(".carousel-dot");
    let idx = 0;
    dots.forEach((d, i) => { if (d.classList.contains("active")) idx = i; });
    const imgName = slides[idx]?.dataset.image;
    if (!imgName) return;

    const body = { text };
    if (replyParentId) {
        body.parent_id = replyParentId;
        replyParentId = null;
        input.placeholder = "Adicione um comentario...";
    }

    try {
        const res = await fetch(`/api/comments/${imgName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            input.value = "";
            autoResize(input);
            commentsCache.delete(currentImageName());
            await loadComments(true);
        }
    } catch { /* ignore */ }
    hideMentionDropdown();
});

const mainCommentInput = document.getElementById("commentInput");
if (mainCommentInput) {
    mentionInput = mainCommentInput;
    mainCommentInput.addEventListener("input", handleMentionInput);
    mainCommentInput.addEventListener("keydown", handleMentionKeydown);
    mainCommentInput.addEventListener("input", () => autoResize(mainCommentInput));
    mainCommentInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            if (mentionStart >= 0) return;
            e.preventDefault();
            document.getElementById("commentForm").requestSubmit();
        }
    });
}

function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
}

document.addEventListener("mousedown", e => {
    if (mentionDropdown && !mentionDropdown.contains(e.target) && e.target !== mentionInput) {
        hideMentionDropdown();
    }
});

window.addEventListener("scroll", () => {
    if (mentionDropdown && mentionInput) renderMentionDropdown();
}, true);

fetchCurrentUser().then(() => fetchMyCommentLikes().then(() => loadComments()));
