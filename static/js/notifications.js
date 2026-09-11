(function() {
const bellBtn = document.getElementById("headerBell");
const bellBadge = document.getElementById("bellBadge");
const notifPanel = document.getElementById("notifPanel");
const notifList = document.getElementById("notifList");
const notifPushToggle = document.getElementById("notifPushToggle");

if (!bellBtn || !notifPanel) return;

bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = notifPanel.hidden;
    notifPanel.hidden = !opening;
    document.getElementById("userMenu").classList.remove("open");
    if (opening) {
        updateBadge(0);
        fetch("/api/push/read", { method: "POST", credentials: "include" }).catch(() => {});
        loadNotifications();
    }
});

document.addEventListener("click", (e) => {
    if (!notifPanel.hidden && !notifPanel.contains(e.target) && !bellBtn.contains(e.target)) {
        notifPanel.hidden = true;
    }
});

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

async function loadNotifications() {
    try {
        const res = await fetch("/api/push/notifications", { credentials: "include" });
        const data = await res.json();
        if (data.notifications.length === 0) {
            notifList.innerHTML = `<p class="notif-empty">Nenhuma notificação</p>`;
        } else {
            notifList.innerHTML = `
                <button class="notif-clear" id="notifClearBtn" type="button">Limpar tudo</button>
                ${data.notifications.map(n => `
                    <div class="notif-item${n.read ? "" : " unread"}" data-image="${escHtml(n.image_name || "")}">
                        <div class="notif-item-title">${escHtml(n.title)}</div>
                        <div class="notif-item-body">${escHtml(n.body)}</div>
                        <div class="notif-item-time">${timeAgo(n.created_at)}</div>
                    </div>
                `).join("")}
            `;
            document.getElementById("notifClearBtn").addEventListener("click", clearNotifications);
            notifList.querySelectorAll(".notif-item[data-image]").forEach(el => {
                el.addEventListener("click", () => goToNotification(el.dataset.image));
            });
        }
        updateBadge(0);
        if (data.unread > 0) {
            fetch("/api/push/read", { method: "POST", credentials: "include" }).catch(() => {});
        }
    } catch { /* ignore */ }
}

function goToNotification(imageName) {
    if (!imageName) return;
    notifPanel.hidden = true;
    const card = document.querySelector(`.feed-card[data-name="${CSS.escape(imageName)}"]`);
    if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.style.boxShadow = "0 0 0 2px #6366f1";
        setTimeout(() => { card.style.boxShadow = ""; }, 2000);
    } else {
        window.location.href = `/?image=${encodeURIComponent(imageName)}`;
    }
}

async function clearNotifications() {
    try {
        await fetch("/api/push/clear", { method: "DELETE", credentials: "include" });
        notifList.innerHTML = `<p class="notif-empty">Nenhuma notificação</p>`;
        updateBadge(0);
    } catch { /* ignore */ }
}

function updateBadge(count) {
    // Ensure badge is visible
    bellBadge.hidden = false;
    if (count > 0) {
        bellBadge.textContent = count > 99 ? "99+" : count;
    } else {
        bellBadge.textContent = "0";
    }
}

async function refreshNotificationBadge() {
    try {
        const res = await fetch("/api/push/notifications", { credentials: "include" });
        const data = await res.json();
        updateBadge(data.unread);
    } catch { /* ignore */ }
}

function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
}

notifPushToggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    const { requestPushPermission, unsubscribePush, getPushStatus } = await import("/static/js/firebase-config.js");
    const enabled = await getPushStatus();
    if (enabled) {
        await unsubscribePush();
        notifPushToggle.classList.remove("active");
    } else {
        await requestPushPermission();
        notifPushToggle.classList.add("active");
    }
});

(async () => {
    try {
        const { getPushStatus } = await import("/static/js/firebase-config.js");
        const enabled = await getPushStatus();
        if (enabled) notifPushToggle.classList.add("active");
    } catch { /* ignore */ }
})();

refreshNotificationBadge();
setInterval(refreshNotificationBadge, 60000);
})();
