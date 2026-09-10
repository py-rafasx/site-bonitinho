const composerModal = document.getElementById("composerModal");
const composerClose = document.getElementById("composerClose");
const composerImageInput = document.getElementById("composerImageInput");
const composerAdd = document.getElementById("composerAddImage");
const composerZipInput = document.getElementById("composerZipInput");
const composerAddZip = document.getElementById("composerAddZip");
const composerZipPreview = document.getElementById("composerZipPreview");
const composerZipLabel = document.getElementById("composerZipLabel");
const composerZipRemove = document.getElementById("composerZipRemove");
const composerPost = document.getElementById("composerPost");
const composerText = document.getElementById("composerText");
const composerMediaPreviews = document.getElementById("composerMediaPreviews");
const composerNsfwBtn = null;

let selectedFiles = [];
let selectedZip = null;
let composerNsfwActive = false;

async function initComposerAdminCheck() {
    try {
        const data = await fetchCurrentMe();
        if (!data.user?.is_admin) {
            window.currentUserIsAdmin = false;
            if (composerAddZip) composerAddZip.style.display = "none";
        } else {
            window.currentUserIsAdmin = true;
        }
    } catch { /* not logged in */ }
}
initComposerAdminCheck();

function closeComposer() {
    composerModal.classList.remove("open");
}

composerClose.addEventListener("click", closeComposer);

composerModal.addEventListener("click", e => {
    if (e.target === composerModal) closeComposer();
});

composerAdd.addEventListener("click", () => composerImageInput.click());
composerAddZip.addEventListener("click", () => {
    if (!window.currentUserIsAdmin) {
        showAlert("Apenas administradores podem enviar arquivos ZIP.");
        return;
    }
    composerZipInput.click();
});

function clearAllMedia() {
    selectedFiles = [];
    composerImageInput.value = "";
    composerMediaPreviews.innerHTML = "";
    composerNsfwActive = false;
}

function clearZip() {
    selectedZip = null;
    composerZipInput.value = "";
    composerZipPreview.hidden = true;
    composerZipLabel.textContent = "Arquivo ZIP selecionado";
}

function renderMediaPreview() {
    composerMediaPreviews.innerHTML = "";
    selectedFiles.forEach((file, idx) => {
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
            selectedFiles.splice(idx, 1);
            renderMediaPreview();
            updateComposerPostBtn();
        });
        div.appendChild(removeBtn);
        composerMediaPreviews.appendChild(div);
    });
    if (selectedFiles.length > 0) {
        const nsfwBtn = document.createElement("button");
        nsfwBtn.type = "button";
        nsfwBtn.className = "feed-create-nsfw" + (composerNsfwActive ? " active visible" : " visible");
        nsfwBtn.textContent = "18+";
        nsfwBtn.addEventListener("click", () => {
            composerNsfwActive = !composerNsfwActive;
            nsfwBtn.classList.toggle("active", composerNsfwActive);
        });
        composerMediaPreviews.appendChild(nsfwBtn);
    }
}

composerImageInput.addEventListener("change", () => {
    const files = Array.from(composerImageInput.files);
    if (!files.length) return;
    clearZip();
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
                selectedFiles.push(file);
                renderMediaPreview();
                updateComposerPostBtn();
            };
        } else {
            selectedFiles.push(file);
        }
    }
    renderMediaPreview();
    updateComposerPostBtn();
    composerImageInput.value = "";
});

composerZipInput.addEventListener("change", () => {
    if (!window.currentUserIsAdmin) {
        showAlert("Apenas administradores podem enviar arquivos ZIP.");
        composerZipInput.value = "";
        return;
    }
    const file = composerZipInput.files[0];
    if (!file) return;
    clearAllMedia();
    selectedZip = file;
    composerZipLabel.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    composerZipPreview.hidden = false;
    updateComposerPostBtn();
});

composerZipRemove.addEventListener("click", () => {
    clearZip();
    updateComposerPostBtn();
});

function updateComposerPostBtn() {
    composerPost.disabled = !selectedFiles.length && !selectedZip && !composerText.value.trim();
}

composerText.addEventListener("input", updateComposerPostBtn);

composerText.addEventListener("paste", (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) selectedFiles.push(file);
    }
    renderMediaPreview();
    updateComposerPostBtn();
});

async function compressImage(file) {
    const MAX_DIM = 1920;
    const compressible = ["image/jpeg", "image/png"].includes(file.type);
    if (!compressible) return file;

    const src = await loadImageBitmap(file);
    const sw = src.naturalWidth || src.width;
    const sh = src.naturalHeight || src.height;
    const scale = Math.min(1, MAX_DIM / Math.max(sw, sh));

    if (scale === 1) {
        if (src.close) src.close();
        return file;
    }

    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0, width, height);
    if (src.close) src.close();

    const isPng = file.type === "image/png";
    const type = isPng ? "image/png" : "image/jpeg";
    const blob = await new Promise(res => canvas.toBlob(res, type, isPng ? undefined : 0.9));
    return blob || file;
}

function loadImageFallback(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
        img.src = url;
    });
}

function loadImageBitmap(file) {
    if (typeof createImageBitmap !== "function") return loadImageFallback(file);
    try {
        return createImageBitmap(file, { imageOrientation: "from-image" })
            .catch(() => loadImageFallback(file));
    } catch {
        return loadImageFallback(file);
    }
}

composerPost.addEventListener("click", async () => {
    if (!selectedFiles.length && !selectedZip && !composerText.value.trim()) return;
    composerPost.disabled = true;

    const form = new FormData();
    for (const file of selectedFiles) {
        if (file.type.startsWith("video/")) {
            form.append("images", file, file.name);
        } else {
            try {
                const compressed = await compressImage(file);
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
    if (window.currentUserIsAdmin && selectedZip) form.append("zip", selectedZip);
    form.append("caption", composerText.value.trim());
    if (composerNsfwActive) form.append("nsfw", "1");
    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            clearAllMedia();
            clearZip();
            composerText.value = "";
            closeComposer();
            if (typeof loadCarousel === "function") {
                // Remove visual highlighting parameter from search params to avoid scrolling
                const url = new URL(location.href);
                if (url.searchParams.has("img") || url.searchParams.has("image")) {
                    url.searchParams.delete("img");
                    url.searchParams.delete("image");
                    history.replaceState(null, "", url.pathname + url.search);
                }
                await loadCarousel(true);
            } else {
                location.reload();
            }
        } else if (res.status === 401) {
            location.href = "/login";
        } else if (res.status === 413) {
            showAlert("Arquivo muito grande (maximo 10 MB).");
        }
    } catch { /* ignore */ }
    composerPost.disabled = true;
});
