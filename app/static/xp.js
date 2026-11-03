/* ==========================================================================
   BunkerOS XP — Client Controller (Window Manager, Dynamic Bookshelf & AI Chat)
   ========================================================================== */

let highestZ = 40;
let dragState = null;

let libraryData = { total: 0, items: [], categories: {} };
let selectedCategory = "ALL";
let currentLibraryView = "shelf"; // 'shelf' or 'folders'
let currentReaderBook = null;

let savedChats = [];
let activeChatId = null;
let downloadPollTimer = null;

const WINDOW_META = {
    "win-library":    { title: "My Library (Bookshelf)", icon: "🏛️" },
    "win-downloader": { title: "Add/Remove Books (ZIM)", icon: "📦" },
    "win-reader":     { title: "Document Viewer",        icon: "📘" },
    "win-chats":      { title: "Saved Chats Folder",     icon: "💬" },
    "win-new-book":   { title: "Write New Volume",       icon: "📝" },
};

// --------------------------------------------------------------------------
// 1. Initialization & Clock
// --------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
    updateClock();
    setInterval(updateClock, 15000);

    // Attach mousedown focus handler to all XP windows
    document.querySelectorAll(".xp-window").forEach((win) => {
        win.addEventListener("mousedown", () => focusWindow(win.id));
    });

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
// 2. Windows XP Window Manager (Open, Close, Minimize, Maximize, Drag, Taskbar)
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
    const y = Math.max(0, Math.min(window.innerHeight - 120, e.clientY - dragState.offsetY));
    dragState.win.style.left = `${x}px`;
    dragState.win.style.top = `${y}px`;
});

window.addEventListener("mouseup", () => {
    dragState = null;
});

function selectDesktopIcon(el, winIdToOpenOnSingleClick) {
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

function setWallpaper(cls) {
    document.body.className = cls;
    closeStartMenu();
}

// --------------------------------------------------------------------------
// 3. System Status & Storage Gauge
// --------------------------------------------------------------------------
async function loadSystemStatus() {
    try {
        const res = await fetch("/api/system/status");
        const data = await res.json();

        const trayBooks = document.getElementById("tray-books-count");
        if (trayBooks) trayBooks.textContent = `📚 ${data.total_books} Books (${data.zim_count} ZIMs)`;

        const trayAi = document.getElementById("tray-ai-pill");
        if (trayAi) {
            trayAi.textContent = data.ollama_online ? `🟢 AI: ${data.active_model.split(":")[0]}` : "🟡 AI Starting";
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
                ? `🟢 Ollama Ready (${data.active_model})`
                : "🟡 Ollama Standby (Archive Search Active)";
        }
        const dlSpace = document.getElementById("downloader-free-space");
        if (dlSpace) {
            dlSpace.textContent = `Free Disk Space: ${data.disk_free_gb} GB`;
        }
    } catch (err) {
        console.error("Status check failed:", err);
    }
}

// --------------------------------------------------------------------------
// 4. Dynamic Library Bookshelf & Desktop Folder Population
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

function setLibraryView(mode) {
    currentLibraryView = mode;
    document.getElementById("btn-view-shelf").classList.toggle("active", mode === "shelf");
    document.getElementById("btn-view-folders").classList.toggle("active", mode === "folders");
    document.getElementById("library-shelf-view").style.display = mode === "shelf" ? "block" : "none";
    document.getElementById("library-folders-view").style.display = mode === "folders" ? "grid" : "none";
}

function selectCategoryFilter(cat) {
    selectedCategory = cat;
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
    // 1. Render a desktop folder for each active category
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

    // 2. Also render individual desktop icons for every downloaded .ZIM archive!
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
        badge.textContent = `${libraryData.total} Volumes on Shelf`;
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

    // Group filtered items by shelf category
    const grouped = {};
    allItems.forEach((item) => {
        grouped[item.category] = grouped[item.category] || [];
        grouped[item.category].push(item);
    });

    // Render VIEW A: Wooden Library Shelves with 3D Book Spines
    const shelvesEl = document.getElementById("bookshelf-shelves-container");
    if (shelvesEl) {
        let shelfHtml = "";
        const catNames = Object.keys(grouped);
        if (catNames.length === 0) {
            shelfHtml = `<div style="padding:20px;color:#555;">No matching volumes on this shelf. Click <b>+ Add ZIM Books</b> to populate your library!</div>`;
        } else {
            catNames.forEach((cat) => {
                const books = grouped[cat];
                // Fill remaining slots up to at least 8 per shelf with ghost book slots so user sees shelf filling up!
                const ghostCount = Math.max(1, 8 - books.length);
                let spinesHtml = "";
                books.forEach((b) => {
                    spinesHtml += `
                        <div class="book-spine"
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

    // Render VIEW B: Classic XP Folders & Files Grid
    const foldersEl = document.getElementById("library-folders-view");
    if (foldersEl) {
        let gridHtml = "";
        allItems.forEach((b) => {
            gridHtml += `
                <div class="xp-file-card" onclick="openLibraryItem('${escapeAttr(b.id)}')">
                    <div class="xp-file-icon">${b.icon || "📘"}</div>
                    <div class="xp-file-meta">
                        <strong>${escapeHtml(b.title)}</strong>
                        <small>${escapeHtml(b.category)} &bull; ${escapeHtml(b.size_label)}</small>
                    </div>
                </div>
            `;
        });
        foldersEl.innerHTML = gridHtml;
    }
}

// --------------------------------------------------------------------------
// 5. Opening Books & Kiwix ZIM Archives in the XP Reader Window
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
        document.getElementById("reader-location-bar").textContent = `http://localhost${targetUrl} (${item.zim_filename})`;
        iframe.src = targetUrl;
    } else {
        iframe.style.display = "none";
        homeBtn.style.display = "none";
        volDiv.style.display = "block";
        document.getElementById("reader-location-bar").textContent = `C:\\Bunker_Library\\Volumes\\${item.id}.md`;
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
    document.getElementById("reader-location-bar").textContent = `http://localhost${urlPath}`;
    document.getElementById("reader-volume-content").style.display = "none";
    document.getElementById("btn-reader-home").style.display = "inline-block";
    const iframe = document.getElementById("reader-kiwix-iframe");
    iframe.style.display = "block";
    iframe.src = urlPath;
}

function askAiAboutCurrentBook() {
    if (!currentReaderBook) return;
    toggleChatDrawer(true);
    const input = document.getElementById("ai-chat-input");
    input.value = `Summarize the key technical details from "${currentReaderBook.title}"`;
    input.focus();
}

// --------------------------------------------------------------------------
// 6. Add / Remove Books (ZIM Downloader) & Custom Volume Creator
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
// 7. Docked Bottom AI Chat & Persistent Saved Conversations (SQLite)
// --------------------------------------------------------------------------
function toggleChatDrawer(forceState) {
    const dock = document.getElementById("ai-bottom-dock");
    const chevron = document.getElementById("drawer-chevron");
    if (!dock) return;

    const shouldOpen = typeof forceState === "boolean" ? forceState : dock.classList.contains("dock-collapsed");
    if (shouldOpen) {
        dock.classList.remove("dock-collapsed");
        if (chevron) chevron.textContent = "▼ Hide Chat";
    } else {
        dock.classList.add("dock-collapsed");
        if (chevron) chevron.textContent = "▲ Chat History";
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
        stream.innerHTML = `<div style="color:#94a3b8;padding:12px;">Session saved in SQLite. Type a question below to consult Elena Vancea &amp; your local ZIM library.</div>`;
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
    sendBtn.textContent = "Thinking...";

    // Optimistic append user message
    const stream = document.getElementById("ai-messages-stream");
    stream.innerHTML += `
        <div class="chat-bubble user">${escapeHtml(text)}</div>
        <div class="chat-bubble assistant" id="temp-thinking-bubble"><em>Consulting local ZIM archives &amp; Elena Vancea LLM...</em></div>
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
        if (temp) temp.innerHTML = `<span style="color:#f87171;">Error: ${escapeHtml(String(err))}</span>`;
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send ↵";
    }
}

function quickPrompt(promptText) {
    const input = document.getElementById("ai-chat-input");
    input.value = promptText;
    toggleChatDrawer(true);
    document.getElementById("ai-chat-form").requestSubmit();
}

// --------------------------------------------------------------------------
// 8. Lightweight Markdown & HTML Escaping Utilities
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

    // Code blocks ```lang ... ```
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, _lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Markdown Tables
    text = text.replace(/((?:^\|.*\|\s*\n)+)/gm, (tableBlock) => {
        const rows = tableBlock.trim().split("\n");
        if (rows.length < 2) return tableBlock;
        let out = "<table>";
        rows.forEach((r, idx) => {
            if (/^\|[\s:-]+\|$/.test(r.replace(/\|/g, "|"))) {
                if (/^[\s|:-]+$/.test(r)) return;
            }
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

    // Headings, bold, inline code, lists
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
