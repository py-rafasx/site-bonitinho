let _mePromise = null;
let _meCache = null;
window.fetchCurrentMe = function () {
  if (_meCache) return Promise.resolve(_meCache);
  if (_mePromise) return _mePromise;
  _mePromise = fetch("/api/auth/me", { credentials: "include" })
    .then(r => r.json())
    .then(data => {
      _meCache = (data && data.user) ? data : null;
      return data;
    })
    .catch(() => ({ user: null }))
    .finally(() => { _mePromise = null; });
  return _mePromise;
};

(function(){
  function ensureModal(){
    let overlay = document.getElementById("appModalOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "appModalOverlay";
    overlay.className = "app-modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="app-modal-card" role="dialog" aria-modal="true">
        <h3 id="appModalTitle"></h3>
        <p id="appModalMessage"></p>
        <div id="appModalInputWrap" hidden>
          <input type="text" id="appModalInput" class="app-modal-input" />
        </div>
        <div class="app-modal-actions">
          <button id="appModalCancel" class="app-modal-btn secondary">Cancelar</button>
          <button id="appModalConfirm" class="app-modal-btn primary">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e)=>{ if(e.target===overlay) closeModal(null); });
    return overlay;
  }

  let lastResolver = null;
  let lastType = null;

  function closeModal(result){
    const overlay = document.getElementById("appModalOverlay");
    if (overlay) overlay.hidden = true;
    if (lastResolver) {
      const r = lastResolver;
      lastResolver = null;
      r(result);
    }
  }

  function showModal({title="", message="", confirmText="Confirmar", cancelText="Cancelar", showCancel=true, input=false, inputValue="", inputPlaceholder="", danger=false}){
    return new Promise(resolve=>{
      const overlay = ensureModal();
      lastResolver = resolve;
      document.getElementById("appModalTitle").textContent = title;
      document.getElementById("appModalMessage").textContent = message;
      const wrap = document.getElementById("appModalInputWrap");
      const inputEl = document.getElementById("appModalInput");
      if (input) {
        wrap.hidden = false;
        inputEl.value = inputValue;
        inputEl.placeholder = inputPlaceholder || "";
        setTimeout(()=>inputEl.focus(), 50);
      } else {
        wrap.hidden = true;
      }
      const cancelBtn = document.getElementById("appModalCancel");
      const confirmBtn = document.getElementById("appModalConfirm");
      cancelBtn.textContent = cancelText;
      confirmBtn.textContent = confirmText;
      cancelBtn.hidden = !showCancel;
      confirmBtn.className = danger ? "app-modal-btn danger" : "app-modal-btn primary";
      // handlers
      const onCancel = ()=>{ cleanup(); closeModal(input ? null : false); };
      const onConfirm = ()=>{
        cleanup();
        if (input) closeModal(inputEl.value);
        else closeModal(true);
      };
      const onKey = (e)=>{
        if (e.key==="Escape") { e.preventDefault(); onCancel(); }
        if (e.key==="Enter" && !e.shiftKey) { if (input) { if (document.activeElement===inputEl) { e.preventDefault(); onConfirm(); } } else { e.preventDefault(); onConfirm(); } }
      };
      function cleanup(){
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        document.removeEventListener("keydown", onKey);
      }
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);
      document.addEventListener("keydown", onKey);
      overlay.hidden = false;
    });
  }

  window.showAlert = function(message, title="Aviso"){
    return showModal({title, message, confirmText:"OK", showCancel:false});
  };

  window.showConfirm = function(message, title="Confirmar", confirmText="Confirmar", cancelText="Cancelar", danger=false){
    return showModal({title, message, confirmText, cancelText, showCancel:true, danger});
  };

  window.showPrompt = function(message, defaultValue="", title="Informe", confirmText="Confirmar", placeholder=""){
    return showModal({title, message, confirmText, cancelText:"Cancelar", showCancel:true, input:true, inputValue: defaultValue, inputPlaceholder: placeholder});
  };

  // Eye toggle para senhas
  const eyeOpenFallback = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeClosedFallback = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-1.47"/><path d="M1 1l22 22"/></svg>`;
  const eyeCache = {};
  async function loadEye(key, fallback) {
    if (eyeCache[key]) return eyeCache[key];
    try {
      const res = await fetch(`/static/svg/${key}.svg?v=2`);
      if (!res.ok) throw new Error("not ok");
      const raw = await res.text();
      const m = raw.match(/<svg[\s\S]*?<\/svg>/);
      if (!m) throw new Error("no svg");
      let svg = m[0]
        // drop fixed size so CSS controls dimensions
        .replace(/\s(width|height)="[^"]*"/g, "")
        // force currentColor so icons follow the theme
        .replace(/stroke="#000000"/g, 'stroke="currentColor"')
        .replace(/stroke='#000000'/g, "stroke='currentColor'");
      eyeCache[key] = svg;
      return svg;
    } catch {
      eyeCache[key] = fallback;
      return fallback;
    }
  }
  let eyeIconsReady = null;
  function readyEyeIcons() {
    if (!eyeIconsReady) {
      eyeIconsReady = Promise.all([
        loadEye("eye", eyeOpenFallback),
        loadEye("eye-close", eyeClosedFallback),
      ]);
    }
    return eyeIconsReady;
  }
  async function initPasswordToggles(){
    const [eyeOpen, eyeClosed] = await readyEyeIcons();
    document.querySelectorAll('input[type="password"]').forEach(inp=>{
      if (inp.dataset.eyeInit) return;
      inp.dataset.eyeInit = "1";
      const wrapper = document.createElement("div");
      wrapper.className = "password-wrapper";
      inp.parentNode.insertBefore(wrapper, inp);
      wrapper.appendChild(inp);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "password-toggle";
      btn.setAttribute("aria-label", "Mostrar senha");
      btn.innerHTML = eyeOpen;
      let shown = false;
      btn.addEventListener("click", ()=>{
        shown = !shown;
        inp.type = shown ? "text" : "password";
        btn.innerHTML = shown ? eyeClosed : eyeOpen;
        btn.setAttribute("aria-label", shown ? "Ocultar senha" : "Mostrar senha");
      });
      wrapper.appendChild(btn);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPasswordToggles);
  } else {
    initPasswordToggles();
  }
  // observa novos inputs (ex: modais dinâmicos)
  new MutationObserver(initPasswordToggles).observe(document.body, {childList:true, subtree:true});

  // Compat: substituir alert/confirm nativos se desejar, mas manter nativo como fallback
  // Não sobrescreve window.alert para não quebrar libs, use showAlert explicitamente
})();
