const avatarEl = document.getElementById("user-avatar");
const avatarImg = avatarEl.querySelector("img");
const menu = document.getElementById("userMenu");

async function loadProfile() {
    try {
        const data = await fetchCurrentMe();
        if (data.user) {
            const avatar = data.user.avatar;
            if (!avatar || avatar === "default-avatar.svg") {
                avatarImg.src = "/static/svg/default-avatar.svg";
            } else {
                avatarImg.src = `/avatars/${avatar}`;
                avatarImg.onerror = () => { avatarImg.src = "/static/svg/default-avatar.svg"; };
            }
            document.getElementById("menuAdmin").style.display = data.user.is_admin ? "" : "none";
        } else {
            window.location.href = "/login";
        }
    } catch { /* ignore */ }
}

avatarEl.addEventListener("click", () => menu.classList.toggle("open"));

document.addEventListener("click", e => {
    if (!e.target.closest(".user")) menu.classList.remove("open");
});

// Admin
document.getElementById("menuAdmin").addEventListener("click", () => {
    menu.classList.remove("open");
    window.location.href = "/admin";
});

// Perfil
document.getElementById("menuPerfil").addEventListener("click", () => {
    menu.classList.remove("open");
    goToProfile();
});

// Eleição
document.getElementById("menuEleicao").addEventListener("click", () => {
    menu.classList.remove("open");
    window.location.href = "/eleicao";
});

// Logout
document.getElementById("menuLogout").addEventListener("click", async () => {
    const ok = await showConfirm("Sair da sua conta?", "Sair", "Sair", "Cancelar", true);
    if (!ok) return;
    menu.classList.remove("open");
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
});

loadProfile();

document.getElementById("logoHome")?.addEventListener("click", () => {
    window.location.href = "/";
});

/* === Auto-hide header on scroll === */
(function () {
    const headers = document.querySelectorAll("header");
    if (!headers.length) return;
    let lastScroll = 0;
    let ticking = false;

    const setHeaders = (hidden) => {
        headers.forEach(h => h.classList.toggle("hidden", hidden));
        document.body.classList.toggle("clone-top", hidden);
    };

    window.addEventListener("scroll", () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const scrollY = window.scrollY;
                if (scrollY < 60) {
                    setHeaders(false);
                } else if (scrollY > lastScroll + 5) {
                    setHeaders(true);
                } else if (scrollY < lastScroll - 5) {
                    setHeaders(false);
                }
                lastScroll = scrollY;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
})();

