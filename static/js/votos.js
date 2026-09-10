let isAdmin = false;

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

/* === Tab switching === */
document.querySelectorAll(".votos-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".votos-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const name = tab.dataset.tab;
        document.getElementById("tabRanking").style.display = name === "ranking" ? "" : "none";
        document.getElementById("tabVencedoras").style.display = name === "vencedoras" ? "" : "none";
        if (name === "ranking") loadRanking();
        if (name === "vencedoras") loadWinners();
    });
});

/* === Ranking === */
async function loadRanking() {
    const res = await fetch("/api/eleicao");
    const items = await res.json();
    const list = document.getElementById("votosList");

    if (!items.length) {
        list.innerHTML = `
            <div class="votos-empty">
                <span class="ico ico-image-placeholder img-placeholder" aria-hidden="true"></span>
                <p>Nenhuma imagem ainda. Faça upload!</p>
            </div>
        `;
        return;
    }

    const rankClass = ["rank-gold", "rank-silver", "rank-bronze"];
    const rankLabel = ["🥇", "🥈", "🥉"];

    list.innerHTML = items.map((item, i) => {
        const rc = i < 3 ? rankClass[i] : "rank-normal";
        const rl = i < 3 ? rankLabel[i] : i + 1;
        return `
            <div class="votos-card">
                <div class="votos-card-main">
                    <div class="votos-rank ${rc}">${rl}</div>
                    <div class="votos-card-img">
                        <img src="/images/${esc(item.name)}" alt="" loading="lazy">
                    </div>
                    <div class="votos-card-owner">@${esc(item.owner || "—")}</div>
                    <div class="votos-card-likes"><span class="ico ico-upvote-filled votos-upvote" aria-hidden="true"></span> ${item.likes}${item.likers && item.likers.length ? '<span class="votos-card-arrow"></span>' : ""}</div>
                </div>
                <div class="votos-likers">
                    <div class="votos-likers-title">Curtido por:</div>
                    <div class="votos-likers-list">
                        ${item.likers.length
                            ? item.likers.map(u => `<span class="votos-liker-tag">@${esc(u.username)}</span>`).join("")
                            : `<span class="votos-liker-tag" style="color:#a1a1aa">Ninguém ainda</span>`}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".votos-card-main").forEach(main => {
        main.addEventListener("click", () => {
            const card = main.parentElement;
            const top = card.getBoundingClientRect().top;
            const shouldExpand = !card.classList.contains("expanded");
            document.querySelectorAll(".votos-card").forEach(c => {
                if (Math.abs(c.getBoundingClientRect().top - top) < 1) {
                    c.classList.toggle("expanded", shouldExpand);
                }
            });
        });
    });
}

/* === Vencedoras === */
async function loadWinners() {
    const res = await fetch("/api/eleicao/vencedoras");
    const items = await res.json();
    const list = document.getElementById("vencedorasList");

    if (!items.length) {
        list.innerHTML = `
            <div class="votos-empty">
                <span class="ico ico-image-placeholder img-placeholder" aria-hidden="true"></span>
                <p>Nenhuma vencedora ainda.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = items.map(item => `
        <div class="votos-card winner-card">
            <div class="winner-media">
                <img src="/winners/${esc(item.image_name)}" alt="" loading="lazy">
                <div class="winner-number">#${String(item.number).padStart(4, "0")}</div>
                ${isAdmin ? `<button class="winner-remove-btn" data-id="${item.id}" title="Remover vencedora">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>` : ""}
                <button class="winner-download-btn" data-src="/winners/${esc(item.image_name)}/download" data-name="${esc(item.image_name)}" title="Baixar imagem">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                </button>
            </div>
            <div class="winner-info">
                ${item.caption ? `<div class="winner-caption">${esc(item.caption)}</div>` : ""}
                <div class="winner-date">${formatDate(item.created_at)}</div>
            </div>
        </div>
    `).join("");

    document.querySelectorAll("#vencedorasList .winner-remove-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!await showConfirm("Remover esta vencedora?", "Remover vencedora", "Remover", "Cancelar", true)) return;
            const r = await fetch(`/api/admin/eleicao/vencedoras/${btn.dataset.id}`, { method: "DELETE" });
            if (r.ok) loadWinners();
        });
    });

    document.querySelectorAll("#vencedorasList .winner-download-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const name = btn.dataset.name;
            try {
                const res = await fetch(btn.dataset.src);
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            } catch {}
        });
    });

    document.querySelectorAll("#vencedorasList .winner-caption").forEach(el => {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            el.classList.toggle("expanded");
        });
    });
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "Z");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

loadRanking();

/* === Admin winner modal === */
(async function initWinnerModal() {
    try {
        const data = await fetchCurrentMe();
        if (!data.user || !data.user.is_admin) return;
        isAdmin = true;
    } catch { return; }

    const addBtn = document.getElementById("addWinnerBtn");
    addBtn.style.display = "";

    addBtn.addEventListener("click", async () => {
        const overlay = document.getElementById("winnerModal");
        const fileInput = document.getElementById("winnerFileInput");
        const previewWrap = document.getElementById("winnerPreview");
        const captionInput = document.getElementById("winnerCaption");
        const numberInput = document.getElementById("winnerNumber");
        const dateInput = document.getElementById("winnerDate");

        let selectedFile = null;

        previewWrap.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            <span>Carregar imagem</span>
        `;
        previewWrap.classList.remove("has-image");
        fileInput.value = "";
        captionInput.value = "";
        numberInput.value = "";
        dateInput.value = new Date().toISOString().slice(0, 10);
        overlay.classList.add("open");

        previewWrap.onclick = () => fileInput.click();

        fileInput.onchange = () => {
            const file = fileInput.files[0];
            if (!file) return;
            selectedFile = file;
            const url = URL.createObjectURL(file);
            previewWrap.innerHTML = `<img src="${url}" alt="">`;
            previewWrap.classList.add("has-image");
        };

        document.getElementById("winnerCancel").onclick = () => overlay.classList.remove("open");

        overlay.addEventListener("click", function onClose(e) {
            if (e.target === overlay) {
                overlay.classList.remove("open");
                overlay.removeEventListener("click", onClose);
            }
        });

        document.getElementById("winnerConfirm").onclick = async () => {
            if (!selectedFile) { alert("Selecione uma imagem"); return; }
            const numVal = numberInput.value.trim().replace(/^#/, "");
            const fd = new FormData();
            fd.append("image", selectedFile);
            fd.append("caption", captionInput.value.trim());
            if (numVal) fd.append("number", numVal);
            if (dateInput.value) fd.append("date", dateInput.value);

            const r = await fetch("/api/admin/eleicao/vencedoras/upload", { method: "POST", body: fd });
            const d = await r.json().catch(() => null);
            if (r.ok) {
                overlay.classList.remove("open");
                loadWinners();
            } else {
                alert(d?.error || "Erro ao salvar");
            }
        };
    });
})();
