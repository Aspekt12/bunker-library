/* ==========================================================================
   BunkerOS XP — Client Controller
   1:1 Windows XP Themes, Settings App, 4 Bookshelf Layouts & FB Side Chat
   ========================================================================== */

let highestZ = 40;
let dragState = null;

let appSettings = {
    xp_theme: "luna-blue",
    wallpaper: "wallpaper-bliss",
    custom_wallpaper: "",
    ai_name: "Elena Vancea",
    ai_avatar: "👩‍💼",
    ai_role_title: "Executive Secretary & Chief Technical Librarian",
    ai_personality: "",
    bookshelf_layout: "spines-3d",
    shelf_density: "normal",
    chat_layout: "fb-side",
    font_size_px: 12,
};

let libraryData = { total: 0, items: [], categories: {} };
let selectedCategory = "ALL";
let currentReaderBook = null;

let savedChats = [];
let activeChatId = null;
let downloadPollTimer = null;

const WINDOW_META = {
    "win-library":    { title: "My Library (Bookshelf)", icon: "🏛️" },
    "win-settings":   { title: "Control Panel & Settings", icon: "⚙️" },
    "win-downloader": { title: "Add/Remove Books (ZIM)", icon: "📦" },
    "win-reader":     { title: "Document Viewer",        icon: "📘" },
    "win-chats":      { title: "Saved Chats Folder",     icon: "💬" },
    "win-new-book":   { title: "Write New Volume",       icon: "📝" },
};

const PERSONA_PRESETS = {
    librarian: {
        name: "Elena Vancea",
        avatar: "👩‍💼",
        role: "Executive Secretary & Chief Technical Librarian",
        prompt:
            "You are {ai_name}, {ai_role_title} inside BunkerOS XP. Answer with rigorous technical precision in the user's language (Romanian or English). Always ground your answers in the local archive excerpts and cite the volume title.",
    },
    clippy: {
        name: "Clippy XP",
        avatar: "📎",
        role: "Windows XP Office & Archive Assistant",
        prompt:
            "You are {ai_name} ({ai_role_title}). Start occasionally with a nostalgic 'It looks like you're researching...' and provide super helpful, enthusiastic, accurate technical answers grounded in the local BunkerOS XP archives!",
    },
    hacker: {
        name: "Root0x86",
        avatar: "🤖",
        role: "Low-Level Kernel & Systems Architect",
        prompt:
            "You are {ai_name}, {ai_role_title}. Provide terse, high-signal low-level engineering answers with register tables, assembly snippets, and C/POSIX examples from the local vault.",
    },
    medic: {
        name: "Dr. Vance",
        avatar: "🦉",
        role: "Field Resilience & Emergency Medical Officer",
        prompt:
            "You are {ai_name}, {ai_role_title}. Provide clear, step-by-step survival, off-grid engineering, and emergency medical protocols strictly grounded in the local reference manuals.",
    },
};

// --------------------------------------------------------------------------
// 1. Initialization & Clock
// --------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
    updateClock();
    setInterval(updateClock, 15000);

    document.querySelectorAll(".xp-window").forEach((win) => {
        win.addEventListener("mousedown", () => focusWindow(win.id));
    });

    await loadSettings();
    renderTaskbarTabs();
    await refreshAll();
    await loadChatsList(true);
});

function updateClock() {
    const now = new Date();
    const str = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const el = document.getElementById("xp-clock");
    if (el) el.textContent = str;
}

async function refreshAll() {
    await Promise.all([
        loadSystemStatus(),
        loadLibrary(),
        loadCatalog(),
    ]);
}

// --------------------------------------------------------------------------
// 2. Settings & Control Panel Management (/api/settings)
// --------------------------------------------------------------------------
async function loadSettings() {
    try {
        const res = await fetch("/api/settings");
        appSettings = await res.json();
        applySettingsToDOM(appSettings);
        populateSettingsForm(appSettings);
    } catch (err) {
        console.error("Failed to load settings:", err);
        applySettingsToDOM(appSettings);
    }
}

const XP_THEME_PALETTES = {
    "luna-blue": {
        "--win-border": "#0046d5",
        "--win-title-bg": "linear-gradient(180deg, #0961ec 0%, #3a93ff 10%, #0058ee 46%, #0046c7 88%, #0855dd 100%)",
        "--win-title-text": "#ffffff",
        "--win-bg": "#ece9d8",
        "--taskbar-bg": "linear-gradient(180deg, #3168d5 0%, #4993e6 8%, #2258d5 18%, #245edb 88%, #1941a5 100%)",
        "--taskbar-tab-bg": "linear-gradient(180deg, #3c81f3 0%, #2764d8 100%)",
        "--taskbar-tab-active": "linear-gradient(180deg, #1b4ba8 0%, #153c8a 100%)",
        "--start-btn-bg": "linear-gradient(180deg, #42a842 0%, #73d273 10%, #379837 50%, #2b7b2b 92%, #1d591d 100%)",
        "--systray-bg": "linear-gradient(180deg, #158be9 0%, #0e6ec4 100%)",
        "--sidebar-bg": "linear-gradient(180deg, #7ba2e7 0%, #6375d6 100%)",
        "--task-card-bg": "#d6dff7",
        "--task-header-bg": "linear-gradient(90deg, #ffffff 0%, #c6d3f7 100%)",
        "--task-header-text": "#215dc6",
        "--win-ctrl-btn-bg": "linear-gradient(180deg, #3c8cff 0%, #125ee0 100%)",
        "--start-right-bg": "#d3e5fa",
    },
    "luna-olive": {
        "--win-border": "#5a6b44",
        "--win-title-bg": "linear-gradient(180deg, #8da370 0%, #b0c494 10%, #748858 48%, #5e7046 88%, #6b7e53 100%)",
        "--win-title-text": "#ffffff",
        "--win-bg": "#f2f0e4",
        "--taskbar-bg": "linear-gradient(180deg, #7c9260 0%, #9cb280 9%, #6b7e53 20%, #63754c 88%, #4d5c3a 100%)",
        "--taskbar-tab-bg": "linear-gradient(180deg, #8da370 0%, #748858 100%)",
        "--taskbar-tab-active": "linear-gradient(180deg, #52613c 0%, #445231 100%)",
        "--start-btn-bg": "linear-gradient(180deg, #e07236 0%, #f39a68 10%, #cf6026 52%, #a84816 92%, #87370d 100%)",
        "--systray-bg": "linear-gradient(180deg, #5d6f46 0%, #495836 100%)",
        "--sidebar-bg": "linear-gradient(180deg, #b5c49e 0%, #93a677 100%)",
        "--task-card-bg": "#eef3e6",
        "--task-header-bg": "linear-gradient(90deg, #ffffff 0%, #d8e2c5 100%)",
        "--task-header-text": "#455432",
        "--win-ctrl-btn-bg": "linear-gradient(180deg, #9cb280 0%, #5e7046 100%)",
        "--start-right-bg": "#e4ebd8",
    },
    "luna-silver": {
        "--win-border": "#666975",
        "--win-title-bg": "linear-gradient(180deg, #aeb2be 0%, #dcdfe7 12%, #9498a6 48%, #767a88 88%, #888c9a 100%)",
        "--win-title-text": "#111827",
        "--win-bg": "#efeff2",
        "--taskbar-bg": "linear-gradient(180deg, #9fa3b0 0%, #cfd2dc 9%, #838796 20%, #757988 88%, #5b5f6c 100%)",
        "--taskbar-tab-bg": "linear-gradient(180deg, #b8bcc8 0%, #9498a6 100%)",
        "--taskbar-tab-active": "linear-gradient(180deg, #646875 0%, #525663 100%)",
        "--start-btn-bg": "linear-gradient(180deg, #42a842 0%, #73d273 10%, #379837 50%, #2b7b2b 92%, #1d591d 100%)",
        "--systray-bg": "linear-gradient(180deg, #747887 0%, #5c606e 100%)",
        "--sidebar-bg": "linear-gradient(180deg, #c7cad4 0%, #a4a8b6 100%)",
        "--task-card-bg": "#f3f4f7",
        "--task-header-bg": "linear-gradient(90deg, #ffffff 0%, #dadce4 100%)",
        "--task-header-text": "#374151",
        "--win-ctrl-btn-bg": "linear-gradient(180deg, #cfd2dc 0%, #767a88 100%)",
        "--start-right-bg": "#e5e7eb",
    },
    "royale-noir": {
        "--win-border": "#1e232d",
        "--win-title-bg": "linear-gradient(180deg, #38404f 0%, #525c70 10%, #232832 48%, #151920 88%, #1e232d 100%)",
        "--win-title-text": "#ffffff",
        "--win-bg": "#e5e7eb",
        "--taskbar-bg": "linear-gradient(180deg, #2d333f 0%, #454d5e 9%, #1c2029 20%, #151820 88%, #0d0f14 100%)",
        "--taskbar-tab-bg": "linear-gradient(180deg, #374151 0%, #1f2937 100%)",
        "--taskbar-tab-active": "linear-gradient(180deg, #e35d1b 0%, #b8430b 100%)",
        "--start-btn-bg": "linear-gradient(180deg, #f27127 0%, #ff9b61 10%, #e35d1b 52%, #b5420a 92%, #8c3105 100%)",
        "--systray-bg": "linear-gradient(180deg, #1f242d 0%, #11141a 100%)",
        "--sidebar-bg": "linear-gradient(180deg, #374151 0%, #1f2937 100%)",
        "--task-card-bg": "#e5e7eb",
        "--task-header-bg": "linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%)",
        "--task-header-text": "#111827",
        "--win-ctrl-btn-bg": "linear-gradient(180deg, #4b5563 0%, #1f2937 100%)",
        "--start-right-bg": "#d1d5db",
    },
    "classic-98": {
        "--win-border": "#808080",
        "--win-title-bg": "linear-gradient(90deg, #0a246a 0%, #a6caf0 100%)",
        "--win-title-text": "#ffffff",
        "--win-bg": "#d4d0c8",
        "--taskbar-bg": "#d4d0c8",
        "--taskbar-tab-bg": "#d4d0c8",
        "--taskbar-tab-active": "#ebe8e1",
        "--start-btn-bg": "#d4d0c8",
        "--systray-bg": "#d4d0c8",
        "--sidebar-bg": "#d4d0c8",
        "--task-card-bg": "#ffffff",
        "--task-header-bg": "#0a246a",
        "--task-header-text": "#ffffff",
        "--win-ctrl-btn-bg": "#d4d0c8",
        "--start-right-bg": "#d4d0c8",
    },
};

function applySettingsToDOM(cfg) {
    const themeKey = cfg.xp_theme || "luna-blue";
    const themeCls = `theme-${themeKey}`;
    const wallCls = cfg.wallpaper || "wallpaper-bliss";
    const chatCls = `chat-mode-${cfg.chat_layout || "fb-side"}`;

    document.documentElement.className = `${themeCls}`;
    document.body.className = `${themeCls} ${wallCls} ${chatCls}`;

    // Also set CSS custom properties directly on :root so theme changes are 100% immediate
    const palette = XP_THEME_PALETTES[themeKey] || XP_THEME_PALETTES["luna-blue"];
    Object.entries(palette).forEach(([prop, val]) => {
        document.documentElement.style.setProperty(prop, val);
    });

    if (cfg.wallpaper === "custom" && cfg.custom_wallpaper) {
        document.body.style.backgroundImage = `url("${cfg.custom_wallpaper}")`;
    } else {
        document.body.style.backgroundImage = "";
    }

    // Apply Font Size CSS Variable
    const fontPx = parseInt(cfg.font_size_px || 12, 10);
    document.documentElement.style.setProperty("--ui-font-size", `${fontPx}px`);

    // Apply AI Helper Name & Avatar across Chat Dock + Start Menu
    const aiName = cfg.ai_name || "Elena Vancea";
    const aiAvatar = cfg.ai_avatar || "👩‍💼";

    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setEl("chat-header-avatar", aiAvatar);
    setEl("chat-header-name", aiName);
    setEl("cmd-bar-avatar", aiAvatar);
    setEl("cmd-bar-name", aiName);
    setEl("start-menu-ai-icon", aiAvatar);
    setEl("start-menu-ai-name", `${aiName} AI`);

    const chatInput = document.getElementById("ai-chat-input");
    if (chatInput) {
        chatInput.placeholder = `Message ${aiName}...`;
    }

    // Apply Bookshelf Layout Mode
    updateBookshelfLayoutVisibility(cfg.bookshelf_layout || "spines-3d");
    renderLibraryViews();
}

function populateSettingsForm(cfg) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? "";
    };
    setVal("set-xp-theme", cfg.xp_theme || "luna-blue");
    setVal("set-wallpaper", cfg.wallpaper || "wallpaper-bliss");
    setVal("set-custom-wallpaper", cfg.custom_wallpaper || "");
    setVal("set-ai-name", cfg.ai_name || "Elena Vancea");
    setVal("set-ai-avatar", cfg.ai_avatar || "👩‍💼");
    setVal("set-ai-role", cfg.ai_role_title || "");
    setVal("set-ai-personality", cfg.ai_personality || "");
    setVal("set-shelf-density", cfg.shelf_density || "normal");
    setVal("set-font-size", cfg.font_size_px || 12);

    const fontLabel = document.getElementById("font-size-val-label");
    if (fontLabel) fontLabel.textContent = `${cfg.font_size_px || 12}px`;

    document.querySelectorAll('input[name="set_bookshelf_layout"]').forEach((r) => {
        r.checked = r.value === (cfg.bookshelf_layout || "spines-3d");
    });
    document.querySelectorAll('input[name="set_chat_layout"]').forEach((r) => {
        r.checked = r.value === (cfg.chat_layout || "fb-side");
    });

    previewThemeAndWallpaper();
}

function switchSettingsTab(tabName) {
    ["themes", "ai", "bookshelf", "interface"].forEach((t) => {
        const btn = document.getElementById(`tabbtn-${t}`);
        const page = document.getElementById(`tabpage-${t}`);
        if (btn) btn.classList.toggle("active", t === tabName);
        if (page) page.style.display = t === tabName ? "block" : "none";
    });
}

function quickSelectTheme(themeKey) {
    const sel = document.getElementById("set-xp-theme");
    if (sel) sel.value = themeKey;
    previewThemeAndWallpaper(true);
}

async function previewThemeAndWallpaper(autoSave = false) {
    const theme = document.getElementById("set-xp-theme")?.value || "luna-blue";
    const wall = document.getElementById("set-wallpaper")?.value || "wallpaper-bliss";
    const customUrl = document.getElementById("set-custom-wallpaper")?.value.trim() || "";

    appSettings.xp_theme = theme;
    appSettings.wallpaper = wall;
    appSettings.custom_wallpaper = customUrl;
    applySettingsToDOM(appSettings);

    const screen = document.getElementById("settings-monitor-preview");
    if (screen) {
        if (wall === "custom" && customUrl) {
            screen.style.background = `url("${customUrl}") center/cover`;
        } else if (wall === "wallpaper-autumn") {
            screen.style.background = "linear-gradient(180deg, #451a03 0%, #ea580c 70%, #78350f 100%)";
        } else if (wall === "wallpaper-azul") {
            screen.style.background = "linear-gradient(180deg, #075985 0%, #38bdf8 70%, #0369a1 100%)";
        } else if (wall === "wallpaper-ascent") {
            screen.style.background = "linear-gradient(180deg, #090d16 0%, #312e81 75%, #0f172a 100%)";
        } else if (wall === "wallpaper-mahogany") {
            screen.style.background = "radial-gradient(circle, #451a03 0%, #120601 100%)";
        } else if (wall === "wallpaper-teal") {
            screen.style.background = "#008080";
        } else {
            screen.style.background = "linear-gradient(180deg, #1b65d6 0%, #4da1ff 55%, #52b718 56%)";
        }
    }

    if (autoSave) {
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    xp_theme: theme,
                    wallpaper: wall,
                    custom_wallpaper: customUrl,
                }),
            });
        } catch (err) {
            console.error("Auto-save theme failed:", err);
        }
    }
}

function onCustomWallpaperInput() {
    const val = document.getElementById("set-custom-wallpaper")?.value.trim();
    if (val) {
        document.getElementById("set-wallpaper").value = "custom";
        previewThemeAndWallpaper();
    }
}

function handleWallpaperFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        document.getElementById("set-custom-wallpaper").value = dataUrl;
        document.getElementById("set-wallpaper").value = "custom";
        previewThemeAndWallpaper();
    };
    reader.readAsDataURL(file);
}

function applyPersonaPreset(key) {
    const p = PERSONA_PRESETS[key];
    if (!p) return;
    document.getElementById("set-ai-name").value = p.name;
    document.getElementById("set-ai-avatar").value = p.avatar;
    document.getElementById("set-ai-role").value = p.role;
    document.getElementById("set-ai-personality").value = p.prompt;
}

function previewFontSize(pxVal) {
    const px = parseInt(pxVal, 10) || 12;
    document.getElementById("set-font-size").value = px;
    const label = document.getElementById("font-size-val-label");
    if (label) label.textContent = `${px}px`;
    appSettings.font_size_px = px;
    document.documentElement.style.setProperty("--ui-font-size", `${px}px`);
}

async function saveAndApplySettings(closeAfter = false) {
    const selectedShelfLayout =
        document.querySelector('input[name="set_bookshelf_layout"]:checked')?.value || "spines-3d";
    const selectedChatLayout =
        document.querySelector('input[name="set_chat_layout"]:checked')?.value || "fb-side";

    const newSettings = {
        xp_theme: document.getElementById("set-xp-theme").value,
        wallpaper: document.getElementById("set-wallpaper").value,
        custom_wallpaper: document.getElementById("set-custom-wallpaper").value.trim(),
        ai_name: document.getElementById("set-ai-name").value.trim() || "Elena Vancea",
        ai_avatar: document.getElementById("set-ai-avatar").value,
        ai_role_title: document.getElementById("set-ai-role").value.trim(),
        ai_personality: document.getElementById("set-ai-personality").value.trim(),
        bookshelf_layout: selectedShelfLayout,
        shelf_density: document.getElementById("set-shelf-density").value,
        chat_layout: selectedChatLayout,
        font_size_px: parseInt(document.getElementById("set-font-size").value, 10) || 12,
    };

    try {
        const res = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newSettings),
        });
        appSettings = await res.json();
        applySettingsToDOM(appSettings);
        if (closeAfter) {
            closeWindow("win-settings");
        }
    } catch (err) {
        console.error("Failed saving settings:", err);
    }
}

async function toggleChatLayoutQuick() {
    appSettings.chat_layout = appSettings.chat_layout === "fb-side" ? "bottom-bar" : "fb-side";
    applySettingsToDOM(appSettings);
    populateSettingsForm(appSettings);
    await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_layout: appSettings.chat_layout }),
    });
}

function toggleFbSessionsList() {
    const dock = document.getElementById("ai-bottom-dock");
    if (dock) {
        dock.classList.toggle("fb-history-open");
    }
}

function handleDrawerHeaderClick(e) {
    if (e.target.tagName === "BUTTON") return;
    toggleChatDrawer();
}

// --------------------------------------------------------------------------
// 3. Windows XP Window Manager
// --------------------------------------------------------------------------
function focusWindow(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    highestZ += 1;
    win.style.zIndex = highestZ;
    renderTaskbarTabs();
}

function openWindow(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    win.style.display = "flex";
    win.dataset.minimized = "false";
    focusWindow(winId);
    if (winId === "win-downloader") {
        loadCatalog();
    } else if (winId === "win-chats") {
        loadChatsList(false);
    } else if (winId === "win-settings") {
        populateSettingsForm(appSettings);
    }
}

function closeWindow(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    win.style.display = "none";
    win.dataset.minimized = "false";
    renderTaskbarTabs();
}

function minimizeWindow(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    win.style.display = "none";
    win.dataset.minimized = "true";
    renderTaskbarTabs();
}

function toggleMaximize(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    win.classList.toggle("maximized");
    focusWindow(winId);
}

function renderTaskbarTabs() {
    const container = document.getElementById("xp-taskbar-windows");
    if (!container) return;

    let topWinId = null;
    let maxZ = -1;
    document.querySelectorAll(".xp-window").forEach((w) => {
        if (w.style.display !== "none") {
            const z = parseInt(w.style.zIndex || "1", 10);
            if (z > maxZ) {
                maxZ = z;
                topWinId = w.id;
            }
        }
    });

    let html = "";
    Object.keys(WINDOW_META).forEach((winId) => {
        const win = document.getElementById(winId);
        if (!win) return;
        const isVisible = win.style.display !== "none";
        const isMinimized = win.dataset.minimized === "true";
        if (!isVisible && !isMinimized) return;

        const meta = WINDOW_META[winId];
        const isActive = isVisible && winId === topWinId;
        html += `
            <div class="xp-task-tab ${isActive ? "active" : ""}" onclick="handleTaskbarTabClick('${winId}')">
                <span>${meta.icon}</span>
                <span>${escapeHtml(meta.title)}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

function handleTaskbarTabClick(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    if (win.style.display === "none") {
        openWindow(winId);
    } else {
        minimizeWindow(winId);
    }
}

function startDrag(e, winId) {
    if (e.target.tagName === "BUTTON") return;
    const win = document.getElementById(winId);
    if (!win || win.classList.contains("maximized")) return;
    focusWindow(winId);
    const rect = win.getBoundingClientRect();
    dragState = {
        win,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
    };
}

window.addEventListener("mousemove", (e) => {
    if (!dragState) return;
    const x = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - dragState.offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragState.offsetY));
    dragState.win.style.left = `${x}px`;
    dragState.win.style.top = `${y}px`;
});

window.addEventListener("mouseup", () => {
    dragState = null;
});

function selectDesktopIcon(el) {
    document.querySelectorAll(".desktop-icon").forEach((i) => i.classList.remove("selected"));
    el.classList.add("selected");
}

function handleDesktopClick(e) {
    if (e.target.id === "xp-desktop") {
        document.querySelectorAll(".desktop-icon").forEach((i) => i.classList.remove("selected"));
        closeStartMenu();
    }
}

function toggleStartMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById("xp-start-menu");
    if (!menu) return;
    menu.style.display = menu.style.display === "none" ? "block" : "none";
}

function closeStartMenu() {
    const menu = document.getElementById("xp-start-menu");
    if (menu) menu.style.display = "none";
}

// --------------------------------------------------------------------------
// 4. System Status & Storage Gauge
// --------------------------------------------------------------------------
async function loadSystemStatus() {
    try {
        const res = await fetch("/api/system/status");
        const data = await res.json();

        const trayBooks = document.getElementById("tray-books-count");
        if (trayBooks) trayBooks.textContent = `📚 ${data.total_books} Books (${data.zim_count} ZIMs)`;

        const trayAi = document.getElementById("tray-ai-pill");
        if (trayAi) {
            trayAi.textContent = data.ollama_online ? `🟢 ${appSettings.ai_name.split(" ")[0]}` : "🟡 AI Standby";
        }

        const diskText = document.getElementById("sidebar-disk-text");
        if (diskText) {
            diskText.textContent = `Free: ${data.disk_free_gb} GB / ${data.disk_total_gb} GB (${data.zim_count} ZIMs)`;
        }
        const diskBar = document.getElementById("sidebar-disk-bar");
        if (diskBar) {
            diskBar.style.width = `${Math.min(100, Math.max(5, data.disk_used_percent))}%`;
        }
        const aiStatus = document.getElementById("sidebar-ai-status");
        if (aiStatus) {
            aiStatus.textContent = data.ollama_online
                ? `🟢 Ollama Ready (${data.active_model.split(":")[0]})`
                : "🟡 Ollama Standby";
        }
        const dlSpace = document.getElementById("downloader-free-space");
        if (dlSpace) {
            dlSpace.textContent = `Free Space: ${data.disk_free_gb} GB`;
        }
    } catch (err) {
        console.error("Status check failed:", err);
    }
}

// --------------------------------------------------------------------------
// 5. Dynamic Library Bookshelf (4 Configurable Layouts) & Desktop Folders
// --------------------------------------------------------------------------
async function loadLibrary() {
    try {
        const res = await fetch("/api/library");
        libraryData = await res.json();
        renderCategorySidebar();
        renderLibraryViews();
        renderDynamicDesktopFolders();
    } catch (err) {
        console.error("Failed to load library:", err);
    }
}

async function setBookshelfLayout(layoutMode) {
    appSettings.bookshelf_layout = layoutMode;
    updateBookshelfLayoutVisibility(layoutMode);
    renderLibraryViews();
    await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookshelf_layout: layoutMode }),
    });
}

function cycleBookshelfLayout() {
    const order = ["spines-3d", "covers-grid", "xp-tiles", "xp-details"];
    const idx = order.indexOf(appSettings.bookshelf_layout || "spines-3d");
    const next = order[(idx + 1) % order.length];
    setBookshelfLayout(next);
}

function updateBookshelfLayoutVisibility(mode) {
    const map = {
        "spines-3d": { view: "library-shelf-view", btn: "btn-layout-spines", display: "block" },
        "covers-grid": { view: "library-covers-view", btn: "btn-layout-covers", display: "grid" },
        "xp-tiles": { view: "library-folders-view", btn: "btn-layout-tiles", display: "grid" },
        "xp-details": { view: "library-details-view", btn: "btn-layout-details", display: "block" },
    };
    Object.keys(map).forEach((k) => {
        const vEl = document.getElementById(map[k].view);
        const bEl = document.getElementById(map[k].btn);
        if (vEl) vEl.style.display = k === mode ? map[k].display : "none";
        if (bEl) bEl.classList.toggle("active", k === mode);
    });
}

function selectCategoryFilter(cat) {
    selectedCategory = cat;
    const addr = document.getElementById("library-address-text");
    if (addr) {
        addr.value = cat === "ALL" ? "C:\\Bunker_Library\\All_Shelves" : `C:\\Bunker_Library\\${cat.replace(/\s+/g, "_")}`;
    }
    renderCategorySidebar();
    renderLibraryViews();
    openWindow("win-library");
}

function renderCategorySidebar() {
    const container = document.getElementById("library-category-filters");
    if (!container) return;

    const cats = Object.keys(libraryData.categories || {});
    let html = `<a href="javascript:void(0)" style="${selectedCategory === "ALL" ? "font-weight:bold;text-decoration:underline;" : ""}" onclick="selectCategoryFilter('ALL')">📂 All Shelves (${libraryData.total})</a>`;
    cats.forEach((cat) => {
        const count = (libraryData.categories[cat] || []).length;
        const activeStyle = selectedCategory === cat ? "font-weight:bold;text-decoration:underline;" : "";
        html += `<a href="javascript:void(0)" style="${activeStyle}" onclick="selectCategoryFilter('${escapeAttr(cat)}')">📁 ${escapeHtml(cat)} (${count})</a>`;
    });
    container.innerHTML = html;
}

function renderDynamicDesktopFolders() {
    const container = document.getElementById("dynamic-desktop-folders");
    if (!container) return;

    let html = "";
    const cats = Object.keys(libraryData.categories || {});
    cats.forEach((cat) => {
        const count = (libraryData.categories[cat] || []).length;
        html += `
            <div class="desktop-icon" ondblclick="selectCategoryFilter('${escapeAttr(cat)}')" onclick="selectDesktopIcon(this)">
                <div class="icon-graphic">📁</div>
                <span class="icon-label">${escapeHtml(cat)} (${count})</span>
            </div>
        `;
    });

    (libraryData.items || [])
        .filter((item) => item.type === "zim")
        .forEach((zitem) => {
            html += `
                <div class="desktop-icon" ondblclick="openLibraryItem('${escapeAttr(zitem.id)}')" onclick="selectDesktopIcon(this)">
                    <div class="icon-graphic">💿</div>
                    <span class="icon-label">${escapeHtml(zitem.title)}</span>
                </div>
            `;
        });

    container.innerHTML = html;
}

function renderLibraryViews() {
    const badge = document.getElementById("shelf-count-badge");
    if (badge) {
        badge.textContent = `${libraryData.total} Volumes`;
    }

    const filterQuery = (document.getElementById("library-search-input")?.value || "").trim().toLowerCase();
    const allItems = (libraryData.items || []).filter((item) => {
        if (selectedCategory !== "ALL" && item.category !== selectedCategory) return false;
        if (!filterQuery) return true;
        return (
            item.title.toLowerCase().includes(filterQuery) ||
            item.category.toLowerCase().includes(filterQuery) ||
            (item.summary || "").toLowerCase().includes(filterQuery)
        );
    });

    const grouped = {};
    allItems.forEach((item) => {
        grouped[item.category] = grouped[item.category] || [];
        grouped[item.category].push(item);
    });

    const densityCls = `density-${appSettings.shelf_density || "normal"}`;

    // 1. 3D Wooden Bookshelf View
    const shelvesEl = document.getElementById("bookshelf-shelves-container");
    if (shelvesEl) {
        let shelfHtml = "";
        const catNames = Object.keys(grouped);
        if (catNames.length === 0) {
            shelfHtml = `<div style="padding:20px;color:#555;">No matching volumes on this shelf. Click <b>+ Add ZIM Books</b> to populate your library!</div>`;
        } else {
            catNames.forEach((cat) => {
                const books = grouped[cat];
                const ghostCount = Math.max(1, 8 - books.length);
                let spinesHtml = "";
                books.forEach((b) => {
                    spinesHtml += `
                        <div class="book-spine ${densityCls}"
                             style="background: linear-gradient(90deg, ${b.spine_color} 0%, ${b.spine_color}dd 65%, #111827 100%);"
                             title="${escapeAttr(b.title)} (${escapeAttr(b.size_label)})\n${escapeAttr(b.summary)}"
                             onclick="openLibraryItem('${escapeAttr(b.id)}')">
                            <span class="spine-icon">${b.icon || "📘"}</span>
                            <span class="spine-title">${escapeHtml(b.title)}</span>
                        </div>
                    `;
                });
                for (let i = 0; i < ghostCount; i++) {
                    spinesHtml += `
                        <div class="book-ghost-slot" title="Empty shelf slot — Click to download more ZIM books!" onclick="openWindow('win-downloader')">
                            + ZIM Slot
                        </div>
                    `;
                }

                shelfHtml += `
                    <div class="wooden-shelf-case">
                        <div class="shelf-plaque">📁 ${escapeHtml(cat)} (${books.length} ${books.length === 1 ? "Volume" : "Volumes"})</div>
                        <div class="shelf-books-row">
                            ${spinesHtml}
                        </div>
                    </div>
                `;
            });
        }
        shelvesEl.innerHTML = shelfHtml;
    }

    // 2. Front-Cover Showcase View
    const coversEl = document.getElementById("library-covers-view");
    if (coversEl) {
        coversEl.innerHTML = allItems
            .map(
                (b) => `
            <div class="book-cover-card"
                 style="background: linear-gradient(145deg, ${b.spine_color} 0%, #0f172a 100%);"
                 onclick="openLibraryItem('${escapeAttr(b.id)}')">
                <div class="cover-card-top">
                    <div class="cover-card-icon">${b.icon || "📘"}</div>
                    <div class="cover-card-title">${escapeHtml(b.title)}</div>
                </div>
                <div class="cover-card-footer">
                    ${escapeHtml(b.category)}<br><strong>${escapeHtml(b.size_label)}</strong>
                </div>
            </div>
        `
            )
            .join("");
    }

    // 3. Windows XP Tiles View
    const foldersEl = document.getElementById("library-folders-view");
    if (foldersEl) {
        foldersEl.innerHTML = allItems
            .map(
                (b) => `
            <div class="xp-file-card" onclick="openLibraryItem('${escapeAttr(b.id)}')">
                <div class="xp-file-icon">${b.icon || "📘"}</div>
                <div class="xp-file-meta">
                    <strong>${escapeHtml(b.title)}</strong>
                    <small>${escapeHtml(b.category)} &bull; ${escapeHtml(b.size_label)}</small>
                </div>
            </div>
        `
            )
            .join("");
    }

    // 4. Windows XP Details Table View
    const detailsEl = document.getElementById("library-details-view");
    if (detailsEl) {
        const rows = allItems
            .map(
                (b) => `
            <tr onclick="openLibraryItem('${escapeAttr(b.id)}')">
                <td>${b.icon || "📘"} <strong>${escapeHtml(b.title)}</strong></td>
                <td>${escapeHtml(b.category)}</td>
                <td>${b.type === "zim" ? "Kiwix ZIM Archive" : "Reference Volume"}</td>
                <td>${escapeHtml(b.size_label)}</td>
                <td>${escapeHtml(b.author || "Local Vault")}</td>
            </tr>
        `
            )
            .join("");
        detailsEl.innerHTML = `
            <table class="xp-details-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Folder / Category</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Author / Source</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }
}

// --------------------------------------------------------------------------
// 6. Opening Books & Kiwix ZIM Archives in the XP Reader Window
// --------------------------------------------------------------------------
async function openLibraryItem(itemId) {
    const item = (libraryData.items || []).find((x) => x.id === itemId);
    if (!item) return;

    currentReaderBook = item;
    openWindow("win-reader");

    document.getElementById("reader-win-icon").textContent = item.icon || "📘";
    document.getElementById("reader-win-title").textContent = `${item.title} — BunkerOS XP Reader`;
    document.getElementById("reader-meta-badge").textContent = item.size_label || "Local Archive";

    const volDiv = document.getElementById("reader-volume-content");
    const iframe = document.getElementById("reader-kiwix-iframe");
    const homeBtn = document.getElementById("btn-reader-home");

    if (item.type === "zim") {
        volDiv.style.display = "none";
        iframe.style.display = "block";
        homeBtn.style.display = "inline-block";
        const targetUrl = item.reader_url || "/kiwix/";
        document.getElementById("reader-location-bar").value = `http://localhost${targetUrl} (${item.zim_filename})`;
        iframe.src = targetUrl;
    } else {
        iframe.style.display = "none";
        homeBtn.style.display = "none";
        volDiv.style.display = "block";
        document.getElementById("reader-location-bar").value = `C:\\Bunker_Library\\Volumes\\${item.id}.md`;
        volDiv.innerHTML = "<p>Loading volume from vault...</p>";

        try {
            const res = await fetch(`/api/library/volume/${encodeURIComponent(item.id)}`);
            const vol = await res.json();
            volDiv.innerHTML = renderMarkdown(vol.content || "");
        } catch (err) {
            volDiv.innerHTML = `<p style="color:red;">Error loading volume: ${escapeHtml(String(err))}</p>`;
        }
    }
}

function openKiwixBrowser(urlPath = "/kiwix/") {
    currentReaderBook = { title: "Kiwix ZIM Server Catalog", type: "zim" };
    openWindow("win-reader");
    document.getElementById("reader-win-icon").textContent = "🌐";
    document.getElementById("reader-win-title").textContent = "Kiwix Offline ZIM Server — Explorer";
    document.getElementById("reader-location-bar").value = `http://localhost${urlPath}`;
    document.getElementById("reader-volume-content").style.display = "none";
    document.getElementById("btn-reader-home").style.display = "inline-block";
    const iframe = document.getElementById("reader-kiwix-iframe");
    iframe.style.display = "block";
    iframe.src = urlPath;
}

function askAiAboutCurrentBook() {
    if (!currentReaderBook) return;
    openChatAndFocus(`Summarize the key technical details from "${currentReaderBook.title}"`);
}

function openChatAndFocus(prefill = "") {
    toggleChatDrawer(true);
    const input = document.getElementById("ai-chat-input");
    if (input) {
        if (prefill) input.value = prefill;
        input.focus();
    }
}

// --------------------------------------------------------------------------
// 7. Add / Remove Books (ZIM Downloader) & Custom Volume Creator
// --------------------------------------------------------------------------
async function loadCatalog() {
    try {
        const res = await fetch("/api/catalog");
        const data = await res.json();
        const container = document.getElementById("catalog-list");
        if (!container) return;

        let anyActive = false;
        let html = "";

        (data.catalog || []).forEach((pkg) => {
            const dl = pkg.download_state;
            const isRunning = dl && (dl.status === "resolving" || dl.status === "downloading");
            if (isRunning) anyActive = true;

            let actionHtml = "";
            if (pkg.installed) {
                actionHtml = `<span style="color:#065f46;font-weight:bold;">✅ Installed on Shelf</span>`;
            } else if (isRunning) {
                const pct = dl.percent || 5;
                actionHtml = `
                    <div style="width:190px;">
                        <div style="font-size:10.5px;color:#003c9d;margin-bottom:2px;">${escapeHtml(dl.message || "Downloading...")}</div>
                        <div class="xp-progress-outer"><div class="xp-progress-inner" style="width:${pct}%;"></div></div>
                    </div>
                `;
            } else {
                actionHtml = `<button class="xp-button-primary" onclick="startZimDownload('${escapeAttr(pkg.id)}')">⬇ Download &amp; Add to Shelf</button>`;
            }

            html += `
                <div class="xp-pkg-row">
                    <div class="xp-pkg-info">
                        <div class="xp-pkg-title">
                            <span>${pkg.icon || "💿"}</span>
                            <span>${escapeHtml(pkg.title)}</span>
                            <span class="xp-pkg-badge">${escapeHtml(pkg.size_label)}</span>
                            <span class="xp-pkg-badge">${escapeHtml(pkg.category)}</span>
                        </div>
                        <div class="xp-pkg-desc">${escapeHtml(pkg.description)}</div>
                        ${dl && dl.status === "error" ? `<div style="color:#b91c1c;font-size:11px;margin-top:3px;">⚠️ ${escapeHtml(dl.message)}</div>` : ""}
                    </div>
                    <div>${actionHtml}</div>
                </div>
            `;
        });

        container.innerHTML = html;

        if (anyActive) {
            if (!downloadPollTimer) {
                downloadPollTimer = setInterval(async () => {
                    await loadCatalog();
                    await loadLibrary();
                    await loadSystemStatus();
                }, 2000);
            }
        } else if (downloadPollTimer) {
            clearInterval(downloadPollTimer);
            downloadPollTimer = null;
            await loadLibrary();
            await loadSystemStatus();
        }
    } catch (err) {
        console.error("Failed to load catalog:", err);
    }
}

async function startZimDownload(itemId) {
    try {
        document.getElementById("downloader-status-msg").textContent = `Starting aria2c download for ${itemId}...`;
        await fetch(`/api/downloads/start/${encodeURIComponent(itemId)}`, { method: "POST" });
        await loadCatalog();
    } catch (err) {
        console.error("Failed to start download:", err);
    }
}

async function saveCustomBook() {
    const title = document.getElementById("newbook-title").value.trim();
    const category = document.getElementById("newbook-category").value;
    const spine_color = document.getElementById("newbook-color").value;
    const content = document.getElementById("newbook-content").value.trim();

    if (!title || !content) {
        alert("Please provide both a title and content for the new book.");
        return;
    }

    await fetch("/api/library/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, spine_color, content }),
    });

    document.getElementById("newbook-title").value = "";
    document.getElementById("newbook-content").value = "";
    closeWindow("win-new-book");
    await loadLibrary();
    await loadSystemStatus();
    openWindow("win-library");
}

// --------------------------------------------------------------------------
// 8. Dual-Mode AI Chat (Old Facebook Side Window / Bottom Bar) + SQLite History
// --------------------------------------------------------------------------
function toggleChatDrawer(forceState) {
    const dock = document.getElementById("ai-bottom-dock");
    const chevron = document.getElementById("drawer-chevron");
    if (!dock) return;

    const shouldOpen = typeof forceState === "boolean" ? forceState : dock.classList.contains("dock-collapsed");
    if (shouldOpen) {
        dock.classList.remove("dock-collapsed");
        if (chevron) chevron.textContent = "▼";
    } else {
        dock.classList.add("dock-collapsed");
        if (chevron) chevron.textContent = "▲";
    }
}

async function loadChatsList(selectFirst = false) {
    try {
        const res = await fetch("/api/chats");
        const data = await res.json();
        savedChats = data.chats || [];

        if (selectFirst && savedChats.length > 0 && !activeChatId) {
            await selectChatSession(savedChats[0].id);
        }

        renderSavedChatsSidebar();
        renderSavedChatsFolderWindow();
    } catch (err) {
        console.error("Failed to load chats:", err);
    }
}

function renderSavedChatsSidebar() {
    const listEl = document.getElementById("ai-chats-list");
    if (!listEl) return;

    let html = "";
    savedChats.forEach((c) => {
        const isActive = c.id === activeChatId;
        html += `
            <div class="ai-chat-history-item ${isActive ? "active" : ""}" onclick="selectChatSession('${escapeAttr(c.id)}')">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">💬 ${escapeHtml(c.title)}</span>
                <small style="opacity:0.65;">${c.message_count || 0}</small>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function renderSavedChatsFolderWindow() {
    const grid = document.getElementById("saved-chats-folder-grid");
    if (!grid) return;

    let html = "";
    savedChats.forEach((c) => {
        const dateStr = new Date((c.updated_at || 0) * 1000).toLocaleString();
        html += `
            <div class="xp-file-card" onclick="selectChatSession('${escapeAttr(c.id)}'); toggleChatDrawer(true);">
                <div class="xp-file-icon">💬</div>
                <div class="xp-file-meta">
                    <strong>${escapeHtml(c.title)}</strong>
                    <small>${c.message_count || 0} messages &bull; ${escapeHtml(dateStr)}</small>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

async function createNewChatSession(openDrawer = true) {
    const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Technical Session" }),
    });
    const newChat = await res.json();
    activeChatId = newChat.id;
    await loadChatsList(false);
    await selectChatSession(newChat.id);
    if (openDrawer) {
        toggleChatDrawer(true);
        document.getElementById("ai-chat-input")?.focus();
    }
}

async function selectChatSession(chatId) {
    activeChatId = chatId;
    renderSavedChatsSidebar();
    try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
        const data = await res.json();
        const badge = document.getElementById("active-chat-badge");
        if (badge && data.chat) {
            badge.textContent = data.chat.title;
        }
        renderMessagesStream(data.messages || []);
    } catch (err) {
        console.error("Failed to load chat session:", err);
    }
}

function renderMessagesStream(messages) {
    const stream = document.getElementById("ai-messages-stream");
    if (!stream) return;

    if (!messages.length) {
        stream.innerHTML = `<div style="color:#64748b;padding:10px;">Session saved in SQLite. Type below to ask ${escapeHtml(appSettings.ai_name)}.</div>`;
        return;
    }

    let html = "";
    messages.forEach((m) => {
        let sourcesHtml = "";
        if (m.sources && m.sources.length > 0) {
            const chips = m.sources
                .map((s) => {
                    if (s.type === "zim_article" && s.url) {
                        return `<span class="source-chip" onclick="openKiwixBrowser('${escapeAttr(s.url)}')">💿 ${escapeHtml(s.title)}</span>`;
                    }
                    return `<span class="source-chip" onclick="openLibraryItem('${escapeAttr(s.id)}')">📘 ${escapeHtml(s.title)}</span>`;
                })
                .join("");
            sourcesHtml = `<div class="chat-sources-row">${chips}</div>`;
        }

        html += `
            <div class="chat-bubble ${m.role === "user" ? "user" : "assistant"}">
                <div>${renderMarkdown(m.content || "")}</div>
                ${sourcesHtml}
            </div>
        `;
    });

    stream.innerHTML = html;
    stream.scrollTop = stream.scrollHeight;
}

async function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("ai-chat-input");
    const sendBtn = document.getElementById("ai-send-btn");
    const text = input.value.trim();
    if (!text) return;

    toggleChatDrawer(true);
    if (!activeChatId) {
        await createNewChatSession(true);
    }

    input.value = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "...";

    const stream = document.getElementById("ai-messages-stream");
    stream.innerHTML += `
        <div class="chat-bubble user">${escapeHtml(text)}</div>
        <div class="chat-bubble assistant" id="temp-thinking-bubble"><em>${escapeHtml(appSettings.ai_avatar)} ${escapeHtml(appSettings.ai_name)} is searching local archives...</em></div>
    `;
    stream.scrollTop = stream.scrollHeight;

    try {
        const res = await fetch(`/api/chats/${encodeURIComponent(activeChatId)}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
        });
        await res.json();
        await selectChatSession(activeChatId);
        await loadChatsList(false);
    } catch (err) {
        const temp = document.getElementById("temp-thinking-bubble");
        if (temp) temp.innerHTML = `<span style="color:#dc2626;">Error: ${escapeHtml(String(err))}</span>`;
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
    }
}

function quickPrompt(promptText) {
    const input = document.getElementById("ai-chat-input");
    input.value = promptText;
    toggleChatDrawer(true);
    document.getElementById("ai-chat-form").requestSubmit();
}

// --------------------------------------------------------------------------
// 9. Markdown & HTML Escaping Utilities
// --------------------------------------------------------------------------
function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
}

function renderMarkdown(md) {
    let text = escapeHtml(md);

    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, _lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    text = text.replace(/((?:^\|.*\|\s*\n)+)/gm, (tableBlock) => {
        const rows = tableBlock.trim().split("\n");
        if (rows.length < 2) return tableBlock;
        let out = "<table>";
        rows.forEach((r, idx) => {
            if (/^[\s|:-]+$/.test(r)) return;
            const cells = r
                .trim()
                .replace(/^\|/, "")
                .replace(/\|$/, "")
                .split("|")
                .map((c) => c.trim());
            const tag = idx === 0 ? "th" : "td";
            out += `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
        });
        out += "</table>";
        return out;
    });

    text = text
        .replace(/^### (.*)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*)$/gm, "<h1>$1</h1>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/^- (.*)$/gm, "&bull; $1<br>")
        .replace(/\n\n/g, "<br><br>");

    return text;
}
