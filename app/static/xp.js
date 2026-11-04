/* ==========================================================================
   BunkerOS XP — Client Controller
   1:1 Windows XP Vector Icons, Themes, Responsive Font Scaling,
   Unabridged Book Reader (with Chapter TOC & Search) & Dual-Mode Chat
   ========================================================================== */

let highestZ = 40;
let dragState = null;

let appSettings = {
    xp_theme: "luna-blue",
    wallpaper: "wallpaper-bliss",
    custom_wallpaper: "",
    ai_name: "Elena Vancea",
    ai_avatar: "xp_agent_f",
    ai_role_title: "Executive Secretary & Chief Technical Librarian",
    ai_personality: "",
    bookshelf_layout: "spines-3d",
    shelf_density: "normal",
    chat_layout: "fb-side",
    font_size_px: 12,
    reader_font_size_px: 15,
    active_ai_model: "elena-vancea:latest",
};

let libraryData = { total: 0, items: [], categories: {} };
let selectedCategory = "ALL";

// Unabridged Book Reader State & History Stack
let currentReaderBook = null;
let currentBookChapters = [];
let currentChapterIndex = 0;
let activeManPageName = null;
let readerHistory = [];
let readerHistoryIdx = -1;
let isNavigatingHistory = false;

let savedChats = [];
let activeChatId = null;
let downloadPollTimer = null;
let aiModelsData = { active_model: "elena-vancea:latest", models: [] };
let modelPullPollTimer = null;
let activeChatAbortController = null;

// Window Resize, Chat Resize/Drag, TOC Splitter & Desktop Marquee States
let winResizeState = null;
let chatResizeState = null;
let chatDragState = null;
let tocSplitterState = null;
let marqueeState = null;

// ==========================================================================
// 0. AUTHENTIC WINDOWS XP 3D VECTOR ICON ENGINE (ZERO EMOJI SLOP)
// ==========================================================================
function renderBookSvg(coverLight, coverDark, spineColor, size) {
    return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 48 48" width="${size}" height="${size}">
            <path d="M10 7 L36 5 L36 39 L10 41 Z" fill="${coverDark}" stroke="#1e293b" stroke-width="1.5"/>
            <path d="M12 9 L38 7 L40 9 L14 11 Z" fill="#fef9c3" stroke="#94a3b8" stroke-width="1"/>
            <path d="M14 11 L40 9 L40 42 L14 44 Z" fill="${coverLight}" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M10 7 C10 9 12 11 14 11 L14 44 C12 44 10 42 10 41 Z" fill="${spineColor}" stroke="#0f172a" stroke-width="1.8"/>
            <rect x="19" y="16" width="15" height="8" rx="1" fill="#fef3c7" stroke="#b45309" stroke-width="1.2"/>
            <line x1="21" y1="19" x2="32" y2="18.3" stroke="#78350f" stroke-width="1.4"/>
            <line x1="21" y1="21.5" x2="29" y2="21" stroke="#78350f" stroke-width="1.2"/>
        </svg>
    </span>`;
}

function xpIcon(name, size = 18) {
    switch (name) {
        case "my_library":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="5" y="6" width="34" height="25" rx="2.5" fill="url(#xpMonitorBezel)" stroke="#334155" stroke-width="2"/>
                    <rect x="8" y="9" width="28" height="19" fill="url(#xpMonitorScreen)" stroke="#0f172a" stroke-width="1.2"/>
                    <rect x="17" y="31" width="10" height="5" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
                    <path d="M11 36 L33 36 L36 40 L8 40 Z" fill="url(#xpMonitorBezel)" stroke="#475569" stroke-width="1.5"/>
                    <path d="M27 17 L43 15 L43 42 L27 44 Z" fill="#dc2626" stroke="#450a0a" stroke-width="1.8"/>
                    <path d="M24 15 L27 17 L27 44 L24 42 Z" fill="#991b1b" stroke="#450a0a" stroke-width="1.5"/>
                    <rect x="30" y="21" width="9" height="5" fill="#fef08a" stroke="#854d0e" stroke-width="1"/>
                </svg>
            </span>`;

        case "folder_closed":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <path d="M5 11 L18 11 L22 15 L42 15 L42 38 L5 38 Z" fill="url(#xpFolderBack)" stroke="#92400e" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M5 17 L43 17 L41 39 L5 39 Z" fill="url(#xpFolderFront)" stroke="#92400e" stroke-width="1.8" stroke-linejoin="round"/>
                    <line x1="7" y1="19" x2="41" y2="19" stroke="#fef08a" stroke-width="1.5"/>
                </svg>
            </span>`;

        case "folder_open":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <path d="M5 10 L18 10 L22 14 L40 14 L40 36 L5 36 Z" fill="url(#xpFolderBack)" stroke="#92400e" stroke-width="1.8"/>
                    <rect x="9" y="13" width="28" height="16" rx="1" fill="#ffffff" stroke="#94a3b8" stroke-width="1.2"/>
                    <path d="M3 22 L41 22 L45 39 L7 39 Z" fill="url(#xpFolderFront)" stroke="#92400e" stroke-width="1.8" stroke-linejoin="round"/>
                </svg>
            </span>`;

        case "add_remove":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="31" cy="14" r="10" fill="url(#xpDiscShine)" stroke="#334155" stroke-width="1.6"/>
                    <circle cx="31" cy="14" r="3" fill="#ffffff" stroke="#475569" stroke-width="1.2"/>
                    <path d="M7 19 L23 12 L39 19 L39 36 L23 43 L7 36 Z" fill="url(#xpBoxGold)" stroke="#78350f" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M7 19 L23 26 L39 19" fill="none" stroke="#78350f" stroke-width="1.8"/>
                    <line x1="23" y1="26" x2="23" y2="43" stroke="#78350f" stroke-width="1.8"/>
                    <circle cx="36" cy="35" r="8.5" fill="url(#xpGreenOrb)" stroke="#ffffff" stroke-width="1.8"/>
                    <path d="M36 31 v8 M32 35 h8" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
                </svg>
            </span>`;

        case "ie_globe":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="24" cy="24" r="16.5" fill="url(#xpGlobeBlue)" stroke="#1e3a8a" stroke-width="2"/>
                    <ellipse cx="24" cy="24" rx="8.5" ry="16.5" fill="none" stroke="#93c5fd" stroke-width="1.3"/>
                    <line x1="8" y1="24" x2="40" y2="24" stroke="#93c5fd" stroke-width="1.3"/>
                    <ellipse cx="24" cy="24" rx="21.5" ry="7.5" fill="none" stroke="#facc15" stroke-width="2.6" transform="rotate(-24 24 24)"/>
                </svg>
            </span>`;

        case "control_panel":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <path d="M5 12 L18 12 L22 16 L42 16 L42 39 L5 39 Z" fill="url(#xpFolderFront)" stroke="#92400e" stroke-width="1.8"/>
                    <circle cx="29" cy="28" r="8" fill="#2563eb" stroke="#1e3a8a" stroke-width="2"/>
                    <circle cx="29" cy="28" r="3" fill="#ffffff"/>
                    <path d="M14 23 L21 30 M16 21 L12 25" stroke="#475569" stroke-width="3" stroke-linecap="round"/>
                </svg>
            </span>`;

        case "msn_chat":
        case "xp_msn":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="19" cy="15" r="6" fill="#38bdf8" stroke="#0369a1" stroke-width="1.8"/>
                    <path d="M8 35 C8 25 30 25 30 35 Z" fill="#0284c7" stroke="#075985" stroke-width="1.8"/>
                    <circle cx="31" cy="18" r="5.5" fill="#4ade80" stroke="#15803d" stroke-width="1.8"/>
                    <path d="M22 38 C22 29 40 29 40 38 Z" fill="#16a34a" stroke="#14532d" stroke-width="1.8"/>
                </svg>
            </span>`;

        case "notepad":
        case "book_note":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="9" y="6" width="30" height="36" rx="2" fill="#ffffff" stroke="#334155" stroke-width="2"/>
                    <rect x="9" y="6" width="30" height="6" fill="#0284c7" stroke="#334155" stroke-width="1.5"/>
                    <line x1="14" y1="18" x2="34" y2="18" stroke="#2563eb" stroke-width="2"/>
                    <line x1="14" y1="24" x2="34" y2="24" stroke="#94a3b8" stroke-width="1.8"/>
                    <line x1="14" y1="30" x2="27" y2="30" stroke="#94a3b8" stroke-width="1.8"/>
                </svg>
            </span>`;

        case "book_red":
            return renderBookSvg("#dc2626", "#991b1b", "#7f1d1d", size);
        case "book_blue":
            return renderBookSvg("#2563eb", "#1e40af", "#1e3a8a", size);
        case "book_green":
            return renderBookSvg("#059669", "#065f46", "#064e3b", size);
        case "book_gold":
            return renderBookSvg("#d97706", "#92400e", "#78350f", size);
        case "book_purple":
            return renderBookSvg("#7c3aed", "#5b21b6", "#4c1d95", size);
        case "book_teal":
            return renderBookSvg("#0d9488", "#115e59", "#134e4a", size);

        case "manual_tech":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="9" y="5" width="30" height="38" rx="2.5" fill="#1e3a8a" stroke="#0f172a" stroke-width="2"/>
                    <rect x="9" y="5" width="6" height="38" fill="#0f172a"/>
                    <rect x="18" y="10" width="17" height="10" rx="1" fill="#dbeafe" stroke="#93c5fd" stroke-width="1.2"/>
                    <path d="M21 15 L24 13 L21 11 M25 16 H31" fill="none" stroke="#1e3a8a" stroke-width="1.6" stroke-linecap="round"/>
                    <circle cx="26.5" cy="31" r="6" fill="none" stroke="#60a5fa" stroke-width="2" stroke-dasharray="3 2"/>
                </svg>
            </span>`;

        case "book_open":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <path d="M6 12 Q15 9 24 13 Q33 9 42 12 L42 36 Q33 33 24 37 Q15 33 6 36 Z" fill="#ffffff" stroke="#1e3a8a" stroke-width="2"/>
                    <line x1="24" y1="13" x2="24" y2="37" stroke="#1e3a8a" stroke-width="2"/>
                    <line x1="10" y1="18" x2="20" y2="19" stroke="#64748b" stroke-width="1.5"/>
                    <line x1="10" y1="23" x2="20" y2="24" stroke="#64748b" stroke-width="1.5"/>
                    <line x1="28" y1="19" x2="38" y2="18" stroke="#64748b" stroke-width="1.5"/>
                    <line x1="28" y1="24" x2="38" y2="23" stroke="#64748b" stroke-width="1.5"/>
                </svg>
            </span>`;

        case "zim_disc":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="24" cy="24" r="18" fill="url(#xpDiscShine)" stroke="#334155" stroke-width="2"/>
                    <path d="M24 6 A18 18 0 0 1 42 24 L29 24 A5 5 0 0 0 24 19 Z" fill="rgba(255,255,255,0.45)"/>
                    <circle cx="24" cy="24" r="6" fill="#e2e8f0" stroke="#475569" stroke-width="1.5"/>
                    <circle cx="24" cy="24" r="2.5" fill="#ffffff" stroke="#334155" stroke-width="1.2"/>
                </svg>
            </span>`;

        case "shelf_3d":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="6" y="34" width="36" height="6" rx="1" fill="#92400e" stroke="#451a03" stroke-width="1.8"/>
                    <rect x="9" y="12" width="7" height="22" rx="1" fill="#dc2626" stroke="#450a0a" stroke-width="1.5"/>
                    <rect x="17" y="10" width="8" height="24" rx="1" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.5"/>
                    <rect x="26" y="14" width="7" height="20" rx="1" fill="#059669" stroke="#064e3b" stroke-width="1.5"/>
                    <rect x="34" y="11" width="6" height="23" rx="1" fill="#d97706" stroke="#78350f" stroke-width="1.5"/>
                </svg>
            </span>`;

        case "view_details":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="6" y="8" width="36" height="32" rx="2" fill="#ffffff" stroke="#334155" stroke-width="2"/>
                    <rect x="6" y="8" width="36" height="8" fill="#3b82f6"/>
                    <line x1="14" y1="22" x2="36" y2="22" stroke="#334155" stroke-width="2.2"/>
                    <line x1="14" y1="29" x2="36" y2="29" stroke="#334155" stroke-width="2.2"/>
                    <line x1="14" y1="35" x2="30" y2="35" stroke="#334155" stroke-width="2.2"/>
                </svg>
            </span>`;

        case "nav_back":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="24" cy="24" r="18" fill="url(#xpGreenOrb)" stroke="#14532d" stroke-width="2"/>
                    <path d="M26 14 L15 24 L26 34 M16 24 H34" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>`;

        case "nav_refresh":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="24" cy="24" r="18" fill="url(#xpGreenOrb)" stroke="#14532d" stroke-width="2"/>
                    <path d="M32 18 A10 10 0 1 0 33 29" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round"/>
                    <polygon points="34,12 35,21 26,19" fill="#ffffff"/>
                </svg>
            </span>`;

        case "go_arrow":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="6" y="6" width="36" height="36" rx="6" fill="url(#xpGreenOrb)" stroke="#14532d" stroke-width="2"/>
                    <path d="M15 24 H33 M25 15 L34 24 L25 33" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>`;

        case "xp_agent_f":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="4" y="4" width="40" height="40" rx="6" fill="#1e3a8a" stroke="#93c5fd" stroke-width="2"/>
                    <circle cx="24" cy="18" r="7.5" fill="#fde68a" stroke="#92400e" stroke-width="1.5"/>
                    <path d="M12 39 C12 28 36 28 36 39 Z" fill="#2563eb" stroke="#bfdbfe" stroke-width="1.5"/>
                    <rect x="18" y="16" width="12" height="3.5" rx="1" fill="none" stroke="#1e293b" stroke-width="1.4"/>
                </svg>
            </span>`;

        case "xp_agent_m":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="4" y="4" width="40" height="40" rx="6" fill="#065f46" stroke="#6ee7b7" stroke-width="2"/>
                    <circle cx="24" cy="18" r="7.5" fill="#fed7aa" stroke="#7c2d12" stroke-width="1.5"/>
                    <path d="M12 39 C12 28 36 28 36 39 Z" fill="#059669" stroke="#a7f3d0" stroke-width="1.5"/>
                </svg>
            </span>`;

        case "xp_clippy":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="6" y="6" width="36" height="36" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
                    <path d="M19 32 V15 A6 6 0 0 1 31 15 V33 A8 8 0 0 1 15 33 V18" fill="none" stroke="#475569" stroke-width="3.2" stroke-linecap="round"/>
                    <circle cx="20" cy="19" r="3" fill="#ffffff" stroke="#0f172a" stroke-width="1.4"/>
                    <circle cx="29" cy="19" r="3" fill="#ffffff" stroke="#0f172a" stroke-width="1.4"/>
                    <circle cx="20" cy="19" r="1.2" fill="#0f172a"/>
                    <circle cx="29" cy="19" r="1.2" fill="#0f172a"/>
                </svg>
            </span>`;

        case "xp_rover":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="4" y="4" width="40" height="40" rx="6" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
                    <ellipse cx="14" cy="19" rx="4" ry="7" fill="#92400e"/>
                    <ellipse cx="34" cy="19" rx="4" ry="7" fill="#92400e"/>
                    <circle cx="24" cy="24" r="10" fill="#f59e0b" stroke="#78350f" stroke-width="1.6"/>
                    <circle cx="20.5" cy="22" r="2" fill="#0f172a"/>
                    <circle cx="27.5" cy="22" r="2" fill="#0f172a"/>
                    <ellipse cx="24" cy="26.5" rx="3" ry="2" fill="#451a03"/>
                </svg>
            </span>`;

        case "xp_computer":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="7" y="8" width="34" height="24" rx="2" fill="url(#xpMonitorBezel)" stroke="#334155" stroke-width="2"/>
                    <rect x="10" y="11" width="28" height="18" fill="url(#xpMonitorScreen)"/>
                    <rect x="18" y="32" width="12" height="5" fill="#94a3b8"/>
                    <rect x="12" y="37" width="24" height="4" rx="1" fill="#cbd5e1" stroke="#475569" stroke-width="1.5"/>
                </svg>
            </span>`;

        case "xp_user_chess":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <rect x="12" y="35" width="24" height="6" rx="1.5" fill="#1e3a8a" stroke="#0f172a" stroke-width="1.5"/>
                    <path d="M16 35 L19 18 L29 18 L32 35 Z" fill="#2563eb" stroke="#0f172a" stroke-width="1.5"/>
                    <circle cx="24" cy="13" r="6" fill="#60a5fa" stroke="#0f172a" stroke-width="1.5"/>
                </svg>
            </span>`;

        case "xp_key":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="16" cy="24" r="9" fill="none" stroke="#ffffff" stroke-width="4"/>
                    <path d="M25 24 H42 M35 24 V32 M40 24 V30" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
                </svg>
            </span>`;

        case "xp_power":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <path d="M16 14 A13 13 0 1 0 32 14" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
                    <line x1="24" y1="8" x2="24" y2="24" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
                </svg>
            </span>`;

        case "status_ok":
            return `<span class="xp-svg-wrap" style="width:${size}px;height:${size}px;">
                <svg viewBox="0 0 48 48" width="${size}" height="${size}">
                    <circle cx="24" cy="24" r="18" fill="url(#xpGreenOrb)" stroke="#14532d" stroke-width="2"/>
                    <path d="M15 24 L21 30 L34 17" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>`;

        default:
            return renderBookSvg("#2563eb", "#1e40af", "#1e3a8a", size);
    }
}

function hydrateStaticIcons() {
    document.querySelectorAll("[data-xp-icon]").forEach((el) => {
        const iconName = el.getAttribute("data-xp-icon");
        const size = parseInt(el.getAttribute("data-icon-size") || "18", 10);
        el.innerHTML = xpIcon(iconName, size);
    });
}

const WINDOW_META = {
    "win-library":    { title: "My Library (Bookshelf)", icon: "my_library" },
    "win-settings":   { title: "Control Panel",          icon: "control_panel" },
    "win-downloader": { title: "Add or Remove Books",    icon: "add_remove" },
    "win-reader":     { title: "Book Reader",            icon: "book_open" },
    "win-chats":      { title: "Saved Chats",            icon: "msn_chat" },
    "win-new-book":   { title: "Write New Volume",       icon: "notepad" },
};

const PERSONA_PRESETS = {
    librarian: {
        name: "Elena Vancea",
        avatar: "xp_agent_f",
        role: "Executive Secretary & Chief Technical Librarian",
        prompt:
            "You are {ai_name}, {ai_role_title} inside BunkerOS XP. Answer with rigorous precision in the user's language (Romanian or English). Always ground your answers in the local archive excerpts and cite the volume title.",
    },
    clippy: {
        name: "Clippy XP",
        avatar: "xp_clippy",
        role: "Windows XP Office & Archive Assistant",
        prompt:
            "You are {ai_name} ({ai_role_title}). Start occasionally with a nostalgic 'It looks like you're reading...' and provide helpful, accurate answers grounded in the local BunkerOS XP books!",
    },
    hacker: {
        name: "Root0x86",
        avatar: "xp_computer",
        role: "Low-Level Kernel & Syscall Architect",
        prompt:
            "You are {ai_name}, {ai_role_title}. Provide high-signal low-level engineering answers with syscall numbers, register tables, and C/POSIX examples from the local vault.",
    },
    strategist: {
        name: "Marcus & Sun Tzu",
        avatar: "xp_agent_m",
        role: "Classical Strategy & Stoic Philosophy Advisor",
        prompt:
            "You are {ai_name}, {ai_role_title}. Draw directly upon The Art of War, Meditations, The Prince, and The Enchiridion in the local library to give timeless strategic and philosophical counsel.",
    },
};

// --------------------------------------------------------------------------
// 1. Initialization & Clock
// --------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
    hydrateStaticIcons();
    updateClock();
    setInterval(updateClock, 15000);

    initDesktopWindowManager();

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
        loadAiModels(),
    ]);
}

// --------------------------------------------------------------------------
// 2. Settings, Themes & Font Scaling (/api/settings)
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

    const palette = XP_THEME_PALETTES[themeKey] || XP_THEME_PALETTES["luna-blue"];
    Object.entries(palette).forEach(([prop, val]) => {
        document.documentElement.style.setProperty(prop, val);
    });

    if (cfg.wallpaper === "custom" && cfg.custom_wallpaper) {
        document.body.style.backgroundImage = `url("${cfg.custom_wallpaper}")`;
    } else {
        document.body.style.backgroundImage = "";
    }

    // Apply both UI Font Size and Reader/Chat Font Size CSS variables
    const uiFontPx = Math.min(24, Math.max(10, parseInt(cfg.font_size_px || 12, 10)));
    const readerFontPx = Math.min(28, Math.max(11, parseInt(cfg.reader_font_size_px || 15, 10)));
    document.documentElement.style.setProperty("--ui-font-size", `${uiFontPx}px`);
    document.documentElement.style.setProperty("--reader-font-size", `${readerFontPx}px`);

    const setElText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setElText("tray-font-label", `${uiFontPx}px`);
    setElText("font-size-val-label", `${uiFontPx}px`);
    setElText("reader-font-size-val-label", `${readerFontPx}px`);
    setElText("reader-toolbar-font-badge", `${readerFontPx}px`);

    // Apply AI Helper Name & Vector Avatar across Chat Dock + Start Menu
    const aiName = cfg.ai_name || "Elena Vancea";
    const aiAvatarKey = cfg.ai_avatar || "xp_agent_f";

    const setElHtml = (id, htmlVal) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = htmlVal;
    };
    setElHtml("chat-header-avatar", xpIcon(aiAvatarKey, 16));
    setElHtml("cmd-bar-avatar", xpIcon(aiAvatarKey, 16));
    setElHtml("start-menu-ai-icon", xpIcon(aiAvatarKey, 28));

    setElText("chat-header-name", aiName);
    setElText("cmd-bar-name", aiName);
    setElText("start-menu-ai-name", `${aiName} AI`);

    const chatInput = document.getElementById("ai-chat-input");
    if (chatInput) {
        chatInput.placeholder = `Message ${aiName}...`;
    }

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
    setVal("set-ai-avatar", cfg.ai_avatar || "xp_agent_f");
    setVal("set-ai-role", cfg.ai_role_title || "");
    setVal("set-ai-personality", cfg.ai_personality || "");
    setVal("set-shelf-density", cfg.shelf_density || "normal");
    setVal("set-font-size", cfg.font_size_px || 12);
    setVal("set-reader-font-size", cfg.reader_font_size_px || 15);

    document.querySelectorAll('input[name="set_bookshelf_layout"]').forEach((r) => {
        r.checked = r.value === (cfg.bookshelf_layout || "spines-3d");
    });
    document.querySelectorAll('input[name="set_chat_layout"]').forEach((r) => {
        r.checked = r.value === (cfg.chat_layout || "fb-side");
    });

    previewThemeAndWallpaper(false);
}

function switchSettingsTab(tabName) {
    ["themes", "interface", "models", "ai", "bookshelf"].forEach((t) => {
        const btn = document.getElementById(`tabbtn-${t}`);
        const page = document.getElementById(`tabpage-${t}`);
        if (btn) btn.classList.toggle("active", t === tabName);
        if (page) page.style.display = t === tabName ? "block" : "none";
    });
    if (tabName === "models") {
        loadAiModels();
    }
}

// --------------------------------------------------------------------------
// 2b. AI Models Switcher, Pros & Cons Comparison & Ollama Pull Manager
// --------------------------------------------------------------------------
async function loadAiModels() {
    try {
        const res = await fetch("/api/ai/models");
        aiModelsData = await res.json();
        appSettings.active_ai_model = aiModelsData.active_model;
        renderAiModelsComparison();
        populateChatHeaderModelDropdown();
    } catch (err) {
        console.error("Failed to load AI models:", err);
    }
}

function populateChatHeaderModelDropdown() {
    const sel = document.getElementById("chat-header-model-select");
    if (!sel) return;

    const models = aiModelsData.models || [];
    const installed = models.filter((m) => m.installed);
    const notInstalled = models.filter((m) => !m.installed);

    let html = "";
    if (installed.length > 0) {
        html += `<optgroup label="Installed Local Models">`;
        installed.forEach((m) => {
            const isSel = m.id === aiModelsData.active_model ? "selected" : "";
            html += `<option value="${escapeAttr(m.id)}" ${isSel}>${escapeHtml(m.name)} (${escapeHtml(m.params)})</option>`;
        });
        html += `</optgroup>`;
    }
    if (notInstalled.length > 0) {
        html += `<optgroup label="Available to Pull (Click Models)">`;
        notInstalled.forEach((m) => {
            const isSel = m.id === aiModelsData.active_model ? "selected" : "";
            html += `<option value="${escapeAttr(m.id)}" ${isSel}>[Pull] ${escapeHtml(m.name)} (${escapeHtml(m.download_size)})</option>`;
        });
        html += `</optgroup>`;
    }
    sel.innerHTML = html;
}

function renderAiModelsComparison() {
    const container = document.getElementById("ai-models-comparison-list");
    if (!container) return;

    let anyPulling = false;
    let html = "";

    (aiModelsData.models || []).forEach((m) => {
        const pull = m.pull_state;
        const isPulling = pull && pull.status === "pulling";
        if (isPulling) anyPulling = true;

        const prosHtml = (m.pros || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("");
        const consHtml = (m.cons || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");

        let actionHtml = "";
        if (m.active) {
            actionHtml = `
                <span style="color:#065f46;font-weight:bold;display:inline-flex;align-items:center;gap:4px;">
                    ${xpIcon("status_ok", 16)} <span>Active Model</span>
                </span>
            `;
        } else if (m.installed) {
            actionHtml = `
                <button class="xp-button-primary" onclick="selectAiModel('${escapeAttr(m.id)}')">
                    Activate Model
                </button>
            `;
        } else if (isPulling) {
            const pct = pull.percent || 10;
            actionHtml = `
                <div style="width:200px;">
                    <div style="font-size:10.5px;color:#003c9d;margin-bottom:2px;">${escapeHtml(pull.message || "Pulling...")}</div>
                    <div class="xp-progress-outer"><div class="xp-progress-inner" style="width:${pct}%;"></div></div>
                </div>
            `;
        } else {
            actionHtml = `
                <div style="display:flex;gap:5px;align-items:center;">
                    <button class="xp-button" onclick="pullAiModel('${escapeAttr(m.id)}')">
                        Pull &amp; Install (${escapeHtml(m.download_size)})
                    </button>
                </div>
            `;
        }

        html += `
            <div class="ai-model-card ${m.active ? "active-model" : ""}">
                <div class="ai-model-header">
                    <div class="ai-model-title-group">
                        ${xpIcon("xp_computer", 18)}
                        <span class="ai-model-name">${escapeHtml(m.name)}</span>
                        <code style="font-size:11px;background:#f1f5f9;padding:1px 5px;border:1px solid #cbd5e1;border-radius:3px;">${escapeHtml(m.id)}</code>
                        <span class="ai-model-badge badge-params">${escapeHtml(m.params)}</span>
                        <span class="ai-model-badge badge-ram">${escapeHtml(m.ram_required)}</span>
                        <span class="ai-model-badge badge-speed">${escapeHtml(m.speed_tier)}</span>
                        ${m.installed ? `<span class="ai-model-badge badge-installed">Installed (${escapeHtml(m.installed_size || m.download_size)})</span>` : ""}
                        ${m.active ? `<span class="ai-model-badge badge-active">ACTIVE</span>` : ""}
                    </div>
                    <div>${actionHtml}</div>
                </div>
                <div class="ai-model-bestfor">
                    <strong>Best For:</strong> ${escapeHtml(m.best_for || "")}
                </div>
                <div class="ai-model-pros-cons">
                    <div class="ai-pros-box">
                        <strong>Pros (Strengths)</strong>
                        <ul>${prosHtml}</ul>
                    </div>
                    <div class="ai-cons-box">
                        <strong>Cons (Trade-offs)</strong>
                        <ul>${consHtml}</ul>
                    </div>
                </div>
                ${pull && pull.status === "error" ? `<div style="color:#dc2626;font-size:11px;margin-top:4px;">Pull Error: ${escapeHtml(pull.message)}</div>` : ""}
            </div>
        `;
    });

    container.innerHTML = html;

    if (anyPulling) {
        if (!modelPullPollTimer) {
            modelPullPollTimer = setInterval(async () => {
                await loadAiModels();
                await loadSystemStatus();
            }, 1500);
        }
    } else if (modelPullPollTimer) {
        clearInterval(modelPullPollTimer);
        modelPullPollTimer = null;
        loadSystemStatus();
    }
}

async function selectAiModel(modelId) {
    if (!modelId) return;
    const target = (aiModelsData.models || []).find((m) => m.id === modelId);
    if (target && !target.installed) {
        const wantPull = confirm(`Model "${target.name}" (${target.id}) is not installed locally yet (${target.download_size}). Would you like to pull & install it now via Ollama?`);
        if (wantPull) {
            openWindow("win-settings");
            switchSettingsTab("models");
            await pullAiModel(modelId);
        } else {
            populateChatHeaderModelDropdown();
        }
        return;
    }

    try {
        await fetch("/api/ai/models/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId }),
        });
        await loadAiModels();
        await loadSystemStatus();
    } catch (err) {
        console.error("Failed to select AI model:", err);
    }
}

async function pullAiModel(modelId) {
    if (!modelId) return;
    try {
        await fetch("/api/ai/models/pull", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId }),
        });
        await loadAiModels();
    } catch (err) {
        console.error("Failed to pull model:", err);
    }
}

async function pullCustomOllamaModel() {
    const input = document.getElementById("custom-ollama-model-input");
    const tag = (input?.value || "").trim();
    if (!tag) {
        alert("Enter an Ollama model tag (e.g. llama3.2:1b, codellama:7b, mistral-nemo:12b).");
        return;
    }
    input.value = "";
    await pullAiModel(tag);
}

function quickSelectTheme(themeKey) {
    const sel = document.getElementById("set-xp-theme");
    if (sel) sel.value = themeKey;
    previewThemeAndWallpaper(true);
}

async function previewThemeAndWallpaper(autoSave = false) {
    const theme = document.getElementById("set-xp-theme")?.value || appSettings.xp_theme || "luna-blue";
    const wall = document.getElementById("set-wallpaper")?.value || appSettings.wallpaper || "wallpaper-bliss";
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
        previewThemeAndWallpaper(true);
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
        previewThemeAndWallpaper(true);
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

// Instant UI & Reader Font Size Scaling Functions
async function previewFontSize(pxVal, autoSave = false) {
    const px = Math.min(24, Math.max(10, parseInt(pxVal, 10) || 12));
    appSettings.font_size_px = px;
    const slider = document.getElementById("set-font-size");
    if (slider) slider.value = px;
    applySettingsToDOM(appSettings);
    if (autoSave) {
        await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ font_size_px: px }),
        });
    }
}

async function stepUiFontSize(delta) {
    const nextPx = Math.min(24, Math.max(10, (parseInt(appSettings.font_size_px, 10) || 12) + delta));
    await previewFontSize(nextPx, true);
}

async function previewReaderFontSize(pxVal, autoSave = false) {
    const px = Math.min(28, Math.max(11, parseInt(pxVal, 10) || 15));
    appSettings.reader_font_size_px = px;
    const slider = document.getElementById("set-reader-font-size");
    if (slider) slider.value = px;
    applySettingsToDOM(appSettings);
    if (autoSave) {
        await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reader_font_size_px: px }),
        });
    }
}

async function stepReaderFontSize(delta) {
    const nextPx = Math.min(28, Math.max(11, (parseInt(appSettings.reader_font_size_px, 10) || 15) + delta));
    await previewReaderFontSize(nextPx, true);
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
        reader_font_size_px: parseInt(document.getElementById("set-reader-font-size").value, 10) || 15,
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
    if (e.target.tagName === "BUTTON" || e.target.tagName === "SELECT" || e.target.tagName === "OPTION") return;
    toggleChatDrawer();
}

// --------------------------------------------------------------------------
// 3. Fluent Windows XP Window Manager (8-Way Resize, Tear-Off Unmaximize,
//    Double-Click Maximize, Resizable AI Chat, Marquee & Context Menu)
// --------------------------------------------------------------------------
const MAXIMIZE_SVG = `<svg viewBox="0 0 12 12" width="10" height="10"><rect x="1.5" y="2" width="9" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="1.5" y1="3.5" x2="10.5" y2="3.5" stroke="currentColor" stroke-width="1.5"/></svg>`;
const RESTORE_SVG = `<svg viewBox="0 0 12 12" width="10" height="10"><rect x="3.5" y="1.5" width="7" height="6" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="1.5" y="4" width="7" height="6.5" fill="var(--win-bg)" stroke="currentColor" stroke-width="1.4"/></svg>`;

function initDesktopWindowManager() {
    const dirs = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
    document.querySelectorAll(".xp-window").forEach((win) => {
        win.addEventListener("mousedown", () => focusWindow(win.id));

        // Double-click titlebar to toggle Maximize / Restore
        const titlebar = win.querySelector(".xp-titlebar");
        if (titlebar) {
            titlebar.addEventListener("dblclick", (e) => {
                if (e.target.closest("button")) return;
                toggleMaximize(win.id);
            });
        }

        // Inject 8-way resize handles
        dirs.forEach((dir) => {
            const handle = document.createElement("div");
            handle.className = `xp-win-resizer resizer-${dir}`;
            handle.addEventListener("mousedown", (e) => startWindowResize(e, win.id, dir));
            win.appendChild(handle);
        });
    });

    // Restore saved AI Chat Window dimensions
    try {
        const savedChatSize = JSON.parse(localStorage.getItem("bunker_chat_size") || "null");
        if (savedChatSize) {
            if (savedChatSize.width) {
                document.documentElement.style.setProperty("--chat-win-width", `${savedChatSize.width}px`);
                document.documentElement.style.setProperty("--chat-bar-width", `${savedChatSize.width}px`);
            }
            if (savedChatSize.height) {
                document.documentElement.style.setProperty("--chat-win-height", `${savedChatSize.height}px`);
            }
        }
    } catch (_) {}

    // Desktop rubber-band selection marquee & right-click context menu
    const desktop = document.getElementById("xp-desktop");
    if (desktop) {
        desktop.addEventListener("mousedown", (e) => {
            hideContextMenu();
            if (e.button !== 0 || e.target !== desktop) return;
            closeStartMenu();
            document.querySelectorAll(".desktop-icon").forEach((i) => i.classList.remove("selected"));
            const marquee = document.getElementById("xp-selection-marquee");
            if (!marquee) return;
            marqueeState = { startX: e.clientX, startY: e.clientY, el: marquee };
            marquee.style.left = `${e.clientX}px`;
            marquee.style.top = `${e.clientY}px`;
            marquee.style.width = "0px";
            marquee.style.height = "0px";
            marquee.style.display = "block";
        });

        desktop.addEventListener("contextmenu", (e) => {
            if (e.target.closest(".xp-window")) return;
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY);
        });
    }

    window.addEventListener("click", (e) => {
        if (!e.target.closest("#xp-context-menu")) {
            hideContextMenu();
        }
    });
}

function showContextMenu(x, y) {
    const menu = document.getElementById("xp-context-menu");
    if (!menu) return;
    menu.style.display = "block";
    const maxX = window.innerWidth - 225;
    const maxY = window.innerHeight - 280;
    menu.style.left = `${Math.max(4, Math.min(maxX, x))}px`;
    menu.style.top = `${Math.max(4, Math.min(maxY, y))}px`;
}

function hideContextMenu() {
    const menu = document.getElementById("xp-context-menu");
    if (menu) menu.style.display = "none";
}

function updateMaximizeButtonIcon(win) {
    const btn = win.querySelector(".xp-btn-max");
    if (!btn) return;
    const isMax = win.classList.contains("maximized");
    btn.innerHTML = isMax ? RESTORE_SVG : MAXIMIZE_SVG;
    btn.title = isMax ? "Restore Down" : "Maximize";
}

function saveWindowGeometry(win) {
    const rect = win.getBoundingClientRect();
    win.dataset.prevLeft = win.style.left || `${rect.left}px`;
    win.dataset.prevTop = win.style.top || `${rect.top}px`;
    win.dataset.prevWidth = win.style.width || `${rect.width}px`;
    win.dataset.prevHeight = win.style.height || `${rect.height}px`;
}

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
    if (!win.classList.contains("maximized")) {
        saveWindowGeometry(win);
        win.classList.add("maximized");
    } else {
        win.classList.remove("maximized");
        if (win.dataset.prevLeft) win.style.left = win.dataset.prevLeft;
        if (win.dataset.prevTop) win.style.top = win.dataset.prevTop;
        if (win.dataset.prevWidth) win.style.width = win.dataset.prevWidth;
        if (win.dataset.prevHeight) win.style.height = win.dataset.prevHeight;
    }
    updateMaximizeButtonIcon(win);
    focusWindow(winId);
}

function getTopVisibleWindowId() {
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
    return topWinId;
}

function renderTaskbarTabs() {
    const container = document.getElementById("xp-taskbar-windows");
    if (!container) return;

    const topWinId = getTopVisibleWindowId();

    document.querySelectorAll(".xp-window").forEach((w) => {
        w.classList.toggle("inactive-win", w.id !== topWinId);
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
                ${xpIcon(meta.icon, 15)}
                <span>${escapeHtml(meta.title)}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

function handleTaskbarTabClick(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    const topWinId = getTopVisibleWindowId();
    if (win.style.display === "none") {
        openWindow(winId);
    } else if (winId !== topWinId) {
        // Bring background window to the front instead of minimizing it
        focusWindow(winId);
    } else {
        minimizeWindow(winId);
    }
}

function startDrag(e, winId) {
    if (e.button !== 0 || e.target.closest("button")) return;
    const win = document.getElementById(winId);
    if (!win) return;
    focusWindow(winId);
    const rect = win.getBoundingClientRect();
    dragState = {
        win,
        startX: e.clientX,
        startY: e.clientY,
        isMaximizedOnStart: win.classList.contains("maximized"),
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
    };
}

function startWindowResize(e, winId, dir) {
    e.stopPropagation();
    e.preventDefault();
    const win = document.getElementById(winId);
    if (!win || win.classList.contains("maximized")) return;
    focusWindow(winId);
    const rect = win.getBoundingClientRect();
    document.body.classList.add("is-resizing");
    winResizeState = {
        win,
        dir,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        startWidth: rect.width,
        startHeight: rect.height,
    };
}

// --------------------------------------------------------------------------
// 3B. Resizable, Maximizable & Undockable AI Chat Window
// --------------------------------------------------------------------------
function startChatResize(e, dir) {
    e.stopPropagation();
    e.preventDefault();
    const dock = document.getElementById("ai-bottom-dock");
    const drawer = document.getElementById("ai-chat-drawer");
    if (!dock || !drawer) return;

    if (dock.classList.contains("chat-maximized")) {
        dock.classList.remove("chat-maximized");
        const maxBtn = document.getElementById("btn-chat-maximize");
        if (maxBtn) maxBtn.innerHTML = "&#9633;";
    }

    const rect = drawer.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    document.body.classList.add("is-resizing");

    chatResizeState = {
        dock,
        drawer,
        dir,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        startDockLeft: dockRect.left,
        startDockTop: dockRect.top,
        isFbHistoryOpen: dock.classList.contains("fb-history-open") && document.body.classList.contains("chat-mode-fb-side"),
    };
}

function toggleChatMaximize(e) {
    if (e) e.stopPropagation();
    const dock = document.getElementById("ai-bottom-dock");
    if (!dock) return;
    toggleChatDrawer(true);
    const isMax = dock.classList.toggle("chat-maximized");
    if (isMax) {
        dock.classList.remove("chat-undocked");
        dock.style.left = "";
        dock.style.top = "";
    }
    const maxBtn = document.getElementById("btn-chat-maximize");
    if (maxBtn) {
        maxBtn.innerHTML = isMax ? "&#10697;" : "&#9633;";
        maxBtn.title = isMax ? "Restore Chat Window Size" : "Maximize Chat Window";
    }
}

function startChatHeaderDrag(e) {
    if (e.button !== 0) return;
    if (e.target.closest("button") || e.target.closest("select") || e.target.closest("option")) return;
    const dock = document.getElementById("ai-bottom-dock");
    if (!dock) return;
    const rect = dock.getBoundingClientRect();
    chatDragState = {
        dock,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        hasMoved: false,
        wasMaximized: dock.classList.contains("chat-maximized"),
    };
}

function resetChatDockPosition() {
    const dock = document.getElementById("ai-bottom-dock");
    if (!dock) return;
    dock.classList.remove("chat-undocked", "chat-maximized");
    dock.style.left = "";
    dock.style.top = "";
    const redockBtn = document.getElementById("btn-chat-redock");
    if (redockBtn) redockBtn.style.display = "none";
    const maxBtn = document.getElementById("btn-chat-maximize");
    if (maxBtn) maxBtn.innerHTML = "&#9633;";
}

function startTocSplitterDrag(e) {
    e.preventDefault();
    const sidebar = document.getElementById("reader-toc-sidebar");
    const splitter = document.getElementById("reader-toc-splitter");
    if (!sidebar) return;
    document.body.classList.add("is-resizing");
    if (splitter) splitter.classList.add("dragging");
    tocSplitterState = {
        sidebar,
        splitter,
        startX: e.clientX,
        startWidth: sidebar.getBoundingClientRect().width,
    };
}

// Unified Global MouseMove Handler for Smooth 60fps Dragging & Resizing
window.addEventListener("mousemove", (e) => {
    // 1. Desktop Window Dragging (with Tear-Off Unmaximize when dragging a fullscreen window!)
    if (dragState) {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        if (dragState.isMaximizedOnStart) {
            if (Math.hypot(dx, dy) < 5) return;
            // Tear off fullscreen window back to windowed mode!
            const win = dragState.win;
            win.classList.remove("maximized");
            const restoredW = parseFloat(win.dataset.prevWidth || "780") || 780;
            const restoredH = parseFloat(win.dataset.prevHeight || "500") || 500;
            win.style.width = `${restoredW}px`;
            win.style.height = `${restoredH}px`;
            updateMaximizeButtonIcon(win);

            // Keep cursor anchored proportionally along the restored titlebar
            const ratio = Math.min(0.82, Math.max(0.15, e.clientX / window.innerWidth));
            dragState.offsetX = Math.round(restoredW * ratio);
            dragState.offsetY = Math.min(22, Math.max(8, e.clientY));
            dragState.isMaximizedOnStart = false;
        }

        const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragState.offsetX));
        const y = Math.max(0, Math.min(window.innerHeight - 65, e.clientY - dragState.offsetY));
        dragState.win.style.left = `${x}px`;
        dragState.win.style.top = `${y}px`;
        return;
    }

    // 2. 8-Way Desktop Window Resizing
    if (winResizeState) {
        const { win, dir, startX, startY, startLeft, startTop, startWidth, startHeight } = winResizeState;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const minW = 360;
        const minH = 240;

        if (dir.includes("e")) {
            const newW = Math.max(minW, Math.min(window.innerWidth - startLeft, startWidth + dx));
            win.style.width = `${newW}px`;
        }
        if (dir.includes("s")) {
            const newH = Math.max(minH, Math.min(window.innerHeight - 32 - startTop, startHeight + dy));
            win.style.height = `${newH}px`;
        }
        if (dir.includes("w")) {
            const maxDelta = startWidth - minW;
            const clampedDx = Math.max(-startLeft, Math.min(maxDelta, dx));
            win.style.left = `${startLeft + clampedDx}px`;
            win.style.width = `${startWidth - clampedDx}px`;
        }
        if (dir.includes("n")) {
            const maxDelta = startHeight - minH;
            const clampedDy = Math.max(-startTop, Math.min(maxDelta, dy));
            win.style.top = `${startTop + clampedDy}px`;
            win.style.height = `${startHeight - clampedDy}px`;
        }
        return;
    }

    // 3. AI Chat Window 5-Way Resizing
    if (chatResizeState) {
        const { dock, dir, startX, startY, startWidth, startHeight, isFbHistoryOpen } = chatResizeState;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const minW = 300;
        const maxW = window.innerWidth - 20;
        const minH = 220;
        const maxH = window.innerHeight - 80;

        let nextW = startWidth;
        let nextH = startHeight;

        if (dir.includes("n")) {
            nextH = Math.max(minH, Math.min(maxH, startHeight - dy));
            document.documentElement.style.setProperty("--chat-win-height", `${nextH}px`);
        }
        if (dir.includes("w")) {
            const rawW = Math.max(minW, Math.min(maxW, startWidth - dx));
            nextW = isFbHistoryOpen ? Math.max(minW, rawW - 170) : rawW;
            document.documentElement.style.setProperty("--chat-win-width", `${nextW}px`);
            document.documentElement.style.setProperty("--chat-bar-width", `${rawW}px`);
        }
        if (dir.includes("e")) {
            const rawW = Math.max(minW, Math.min(maxW, startWidth + dx));
            nextW = isFbHistoryOpen ? Math.max(minW, rawW - 170) : rawW;
            document.documentElement.style.setProperty("--chat-win-width", `${nextW}px`);
            document.documentElement.style.setProperty("--chat-bar-width", `${rawW}px`);
        }
        chatResizeState.lastWidth = nextW;
        chatResizeState.lastHeight = nextH;
        return;
    }

    // 4. AI Chat Window Dragging / Tear-Off Unmaximize / Undocking
    if (chatDragState) {
        const dx = e.clientX - chatDragState.startX;
        const dy = e.clientY - chatDragState.startY;
        if (!chatDragState.hasMoved && Math.hypot(dx, dy) < 5) return;

        chatDragState.hasMoved = true;
        const dock = chatDragState.dock;
        toggleChatDrawer(true);

        if (chatDragState.wasMaximized) {
            dock.classList.remove("chat-maximized");
            const maxBtn = document.getElementById("btn-chat-maximize");
            if (maxBtn) maxBtn.innerHTML = "&#9633;";
            const rectAfter = dock.getBoundingClientRect();
            const ratio = Math.min(0.8, Math.max(0.2, e.clientX / window.innerWidth));
            chatDragState.offsetX = Math.round(rectAfter.width * ratio);
            chatDragState.offsetY = 16;
            chatDragState.wasMaximized = false;
        }

        dock.classList.add("chat-undocked");
        const redockBtn = document.getElementById("btn-chat-redock");
        if (redockBtn) redockBtn.style.display = "inline-block";

        const x = Math.max(0, Math.min(window.innerWidth - 180, e.clientX - chatDragState.offsetX));
        const y = Math.max(0, Math.min(window.innerHeight - 85, e.clientY - chatDragState.offsetY));
        dock.style.left = `${x}px`;
        dock.style.top = `${y}px`;
        return;
    }

    // 5. Reader TOC Sidebar Vertical Splitter
    if (tocSplitterState) {
        const dx = e.clientX - tocSplitterState.startX;
        const newW = Math.max(150, Math.min(520, tocSplitterState.startWidth + dx));
        tocSplitterState.sidebar.style.width = `${newW}px`;
        return;
    }

    // 6. Desktop Rubber-Band Selection Marquee
    if (marqueeState) {
        const x1 = Math.min(marqueeState.startX, e.clientX);
        const y1 = Math.min(marqueeState.startY, e.clientY);
        const w = Math.abs(e.clientX - marqueeState.startX);
        const h = Math.abs(e.clientY - marqueeState.startY);
        marqueeState.el.style.left = `${x1}px`;
        marqueeState.el.style.top = `${y1}px`;
        marqueeState.el.style.width = `${w}px`;
        marqueeState.el.style.height = `${h}px`;

        const mRect = { left: x1, right: x1 + w, top: y1, bottom: y1 + h };
        document.querySelectorAll(".desktop-icon").forEach((icon) => {
            const r = icon.getBoundingClientRect();
            const overlaps = !(r.right < mRect.left || r.left > mRect.right || r.bottom < mRect.top || r.top > mRect.bottom);
            icon.classList.toggle("selected", overlaps);
        });
    }
});

window.addEventListener("mouseup", (e) => {
    if (dragState) {
        // Snap-to-maximize if dragged right to the top edge of the screen!
        if (e.clientY <= 2 && !dragState.win.classList.contains("maximized")) {
            toggleMaximize(dragState.win.id);
        }
        dragState = null;
    }
    if (winResizeState) {
        winResizeState = null;
        document.body.classList.remove("is-resizing");
    }
    if (chatResizeState) {
        try {
            const curW = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-win-width"), 10) || 440;
            const curH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-win-height"), 10) || 450;
            localStorage.setItem("bunker_chat_size", JSON.stringify({ width: curW, height: curH }));
        } catch (_) {}
        chatResizeState = null;
        document.body.classList.remove("is-resizing");
    }
    if (chatDragState) {
        if (!chatDragState.hasMoved) {
            // Simple click on header toggles drawer
            toggleChatDrawer();
        }
        chatDragState = null;
    }
    if (tocSplitterState) {
        if (tocSplitterState.splitter) tocSplitterState.splitter.classList.remove("dragging");
        tocSplitterState = null;
        document.body.classList.remove("is-resizing");
    }
    if (marqueeState) {
        marqueeState.el.style.display = "none";
        marqueeState = null;
    }
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
        if (trayBooks) {
            trayBooks.innerHTML = `${xpIcon("book_blue", 14)} <span>${data.total_books} Books</span>`;
        }

        const trayAi = document.getElementById("tray-ai-pill");
        if (trayAi) {
            trayAi.innerHTML = data.ollama_online
                ? `<span class="ai-online-dot"></span> <span>${escapeHtml(appSettings.ai_name.split(" ")[0])}</span>`
                : `<span>AI Standby</span>`;
        }

        const diskText = document.getElementById("sidebar-disk-text");
        if (diskText) {
            diskText.textContent = `Free: ${data.disk_free_gb} GB / ${data.disk_total_gb} GB (${data.total_books} Volumes)`;
        }
        const diskBar = document.getElementById("sidebar-disk-bar");
        if (diskBar) {
            diskBar.style.width = `${Math.min(100, Math.max(5, data.disk_used_percent))}%`;
        }
        const aiStatus = document.getElementById("sidebar-ai-status");
        if (aiStatus) {
            aiStatus.textContent = data.ollama_online
                ? `Ollama Ready (${data.active_model.split(":")[0]})`
                : "Ollama Standby";
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
    let html = `<a href="javascript:void(0)" style="${selectedCategory === "ALL" ? "font-weight:bold;text-decoration:underline;" : ""}" onclick="selectCategoryFilter('ALL')">
        ${xpIcon("folder_open", 14)} <span>All Shelves (${libraryData.total})</span>
    </a>`;
    cats.forEach((cat) => {
        const count = (libraryData.categories[cat] || []).length;
        const activeStyle = selectedCategory === cat ? "font-weight:bold;text-decoration:underline;" : "";
        html += `<a href="javascript:void(0)" style="${activeStyle}" onclick="selectCategoryFilter('${escapeAttr(cat)}')">
            ${xpIcon(selectedCategory === cat ? "folder_open" : "folder_closed", 14)} <span>${escapeHtml(cat)} (${count})</span>
        </a>`;
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
                <div class="icon-graphic">${xpIcon("folder_closed", 38)}</div>
                <span class="icon-label">${escapeHtml(cat)} (${count})</span>
            </div>
        `;
    });

    (libraryData.items || [])
        .filter((item) => item.type === "zim")
        .forEach((zitem) => {
            html += `
                <div class="desktop-icon" ondblclick="openLibraryItem('${escapeAttr(zitem.id)}')" onclick="selectDesktopIcon(this)">
                    <div class="icon-graphic">${xpIcon("zim_disc", 38)}</div>
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
            (item.author || "").toLowerCase().includes(filterQuery) ||
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
            shelfHtml = `<div style="padding:20px;color:#555;">No matching volumes on this shelf. Click <b>+ Add More Books</b> to install additional books or ZIM archives!</div>`;
        } else {
            catNames.forEach((cat) => {
                const books = grouped[cat];
                const ghostCount = Math.max(1, 7 - books.length);
                let spinesHtml = "";
                books.forEach((b) => {
                    const iconKey = b.icon_type || (b.type === "zim" ? "zim_disc" : "book_blue");
                    spinesHtml += `
                        <div class="book-spine ${densityCls}"
                             style="background: linear-gradient(90deg, ${b.spine_color} 0%, ${b.spine_color}dd 65%, #0f172a 100%);"
                             title="${escapeAttr(b.title)} — ${escapeAttr(b.author || "")} (${escapeAttr(b.size_label)})\n${escapeAttr(b.summary)}"
                             onclick="openLibraryItem('${escapeAttr(b.id)}')">
                            <span class="spine-icon">${xpIcon(iconKey, 18)}</span>
                            <span class="spine-title">${escapeHtml(b.title)}</span>
                        </div>
                    `;
                });
                for (let i = 0; i < ghostCount; i++) {
                    spinesHtml += `
                        <div class="book-ghost-slot" title="Empty shelf slot — Click to install more books or ZIM archives!" onclick="openWindow('win-downloader')">
                            + Add Book
                        </div>
                    `;
                }

                shelfHtml += `
                    <div class="wooden-shelf-case">
                        <div class="shelf-plaque">${xpIcon("folder_open", 14)} <span>${escapeHtml(cat)} (${books.length} ${books.length === 1 ? "Volume" : "Volumes"})</span></div>
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
            .map((b) => {
                const iconKey = b.icon_type || (b.type === "zim" ? "zim_disc" : "book_blue");
                return `
                <div class="book-cover-card"
                     style="background: linear-gradient(145deg, ${b.spine_color} 0%, #0f172a 100%);"
                     onclick="openLibraryItem('${escapeAttr(b.id)}')">
                    <div class="cover-card-top">
                        <div>${xpIcon(iconKey, 36)}</div>
                        <div class="cover-card-title">${escapeHtml(b.title)}</div>
                        <div class="cover-card-author">${escapeHtml(b.author || "")}</div>
                    </div>
                    <div class="cover-card-footer">
                        ${escapeHtml(b.category)}<br><strong>${escapeHtml(b.size_label)}</strong>
                    </div>
                </div>
            `;
            })
            .join("");
    }

    // 3. Windows XP Tiles View
    const foldersEl = document.getElementById("library-folders-view");
    if (foldersEl) {
        foldersEl.innerHTML = allItems
            .map((b) => {
                const iconKey = b.icon_type || (b.type === "zim" ? "zim_disc" : "book_blue");
                return `
                <div class="xp-file-card" onclick="openLibraryItem('${escapeAttr(b.id)}')">
                    <div class="xp-file-icon">${xpIcon(iconKey, 36)}</div>
                    <div class="xp-file-meta">
                        <strong>${escapeHtml(b.title)}</strong>
                        <small>${escapeHtml(b.author || b.category)} &bull; ${escapeHtml(b.size_label)}</small>
                    </div>
                </div>
            `;
            })
            .join("");
    }

    // 4. Windows XP Details Table View
    const detailsEl = document.getElementById("library-details-view");
    if (detailsEl) {
        const rows = allItems
            .map((b) => {
                const iconKey = b.icon_type || (b.type === "zim" ? "zim_disc" : "book_blue");
                return `
                <tr onclick="openLibraryItem('${escapeAttr(b.id)}')">
                    <td><span style="display:inline-flex;align-items:center;gap:6px;">${xpIcon(iconKey, 16)} <strong>${escapeHtml(b.title)}</strong></span></td>
                    <td>${escapeHtml(b.author || "Local Vault")}</td>
                    <td>${escapeHtml(b.category)}</td>
                    <td>${b.type === "zim" ? "Kiwix ZIM Archive" : "Unabridged Book"}</td>
                    <td>${escapeHtml(b.size_label)}</td>
                </tr>
            `;
            })
            .join("");
        detailsEl.innerHTML = `
            <table class="xp-details-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Author</th>
                        <th>Folder / Category</th>
                        <th>Type</th>
                        <th>Size</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }
}

// --------------------------------------------------------------------------
// 6. Unabridged Book Reader (with Chapter TOC, Search & Kiwix ZIM Viewer)
// --------------------------------------------------------------------------
async function openLibraryItem(itemId) {
    const item = (libraryData.items || []).find((x) => x.id === itemId);
    if (!item) return;

    currentReaderBook = item;
    openWindow("win-reader");

    const iconKey = item.icon_type || (item.type === "zim" ? "zim_disc" : "book_blue");
    document.getElementById("reader-win-icon").innerHTML = xpIcon(iconKey, 16);
    document.getElementById("reader-win-title").textContent = `${item.title} — BunkerOS XP Reader`;
    document.getElementById("reader-meta-badge").textContent = item.size_label || "Unabridged";

    const tocSidebar = document.getElementById("reader-toc-sidebar");
    const tocSplitter = document.getElementById("reader-toc-splitter");
    const volDiv = document.getElementById("reader-volume-content");
    const iframe = document.getElementById("reader-kiwix-iframe");
    const homeBtn = document.getElementById("btn-reader-home");
    const prevBtn = document.getElementById("btn-prev-chapter");
    const nextBtn = document.getElementById("btn-next-chapter");
    const searchBox = document.getElementById("reader-chapter-search");

    if (item.type === "zim") {
        if (tocSidebar) tocSidebar.style.display = "none";
        if (tocSplitter) tocSplitter.style.display = "none";
        if (prevBtn) prevBtn.style.display = "none";
        if (nextBtn) nextBtn.style.display = "none";
        if (searchBox) searchBox.style.display = "none";
        volDiv.style.display = "none";
        iframe.style.display = "block";
        homeBtn.style.display = "inline-flex";
        const targetUrl = item.reader_url || "/kiwix/";
        document.getElementById("reader-location-bar").value = `http://localhost${targetUrl} (${item.zim_filename})`;
        document.getElementById("reader-status-text").textContent = `Viewing Kiwix ZIM archive: ${item.zim_filename}`;
        iframe.src = targetUrl;
    } else {
        iframe.style.display = "none";
        homeBtn.style.display = "none";
        if (tocSidebar) tocSidebar.style.display = "flex";
        if (tocSplitter) tocSplitter.style.display = "block";
        if (prevBtn) prevBtn.style.display = "inline-flex";
        if (nextBtn) nextBtn.style.display = "inline-flex";
        if (searchBox) {
            searchBox.style.display = "inline-block";
            searchBox.value = "";
        }
        volDiv.style.display = "block";
        document.getElementById("reader-location-bar").value = `C:\\Bunker_Library\\Books\\${item.id}.txt`;
        volDiv.innerHTML = "<p>Loading complete book from local vault...</p>";

        try {
            const res = await fetch(`/api/library/volume/${encodeURIComponent(item.id)}`);
            const vol = await res.json();
            currentReaderBook = vol;
            currentBookChapters = vol.chapters && vol.chapters.length > 0
                ? vol.chapters
                : [{ index: 0, title: vol.title, content: vol.content || "", word_count: (vol.content || "").split(/\s+/).length }];
            currentChapterIndex = 0;
            activeManPageName = null;

            const wcEl = document.getElementById("reader-wordcount-text");
            if (wcEl) {
                const manExtra = vol.man_pages_list ? ` + ${vol.man_pages_list.length.toLocaleString()} raw man(${vol.man_section}) pages` : "";
                wcEl.textContent = `${(vol.word_count || 0).toLocaleString()} words (${vol.size_label || ""}) — ${currentBookChapters.length} sections${manExtra}`;
            }

            renderBookTocList();
            selectBookChapter(0);
        } catch (err) {
            volDiv.innerHTML = `<p style="color:#dc2626;">Error loading volume: ${escapeHtml(String(err))}</p>`;
        }
    }
}

function renderBookTocList() {
    const tocList = document.getElementById("reader-toc-list");
    if (!tocList) return;

    const filter = (document.getElementById("reader-chapter-search")?.value || "").trim().toLowerCase();

    let html = "";
    currentBookChapters.forEach((ch, idx) => {
        if (filter) {
            const inTitle = ch.title.toLowerCase().includes(filter);
            const inContent = ch.content.toLowerCase().includes(filter);
            if (!inTitle && !inContent) return;
        }
        const isActive = !activeManPageName && idx === currentChapterIndex;
        html += `
            <div class="reader-toc-item ${isActive ? "active" : ""}" onclick="selectBookChapter(${idx})">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${idx + 1}. ${escapeHtml(ch.title)}</span>
                <small>${ch.word_count || 0}w</small>
            </div>
        `;
    });

    // If this volume is a Linux Man Pages Section (1..8), list the raw on-demand man pages too!
    if (currentReaderBook && currentReaderBook.man_section && Array.isArray(currentReaderBook.man_pages_list)) {
        const sec = currentReaderBook.man_section;
        const allManPages = currentReaderBook.man_pages_list;
        const matchingPages = filter
            ? allManPages.filter((p) => p.toLowerCase().includes(filter))
            : allManPages;

        const displaySlice = matchingPages.slice(0, 200);
        html += `
            <div style="padding:6px 8px;background:#dce6f7;border-top:1px solid #94a3b8;border-bottom:1px solid #94a3b8;font-weight:bold;color:#1e3a8a;font-size:11px;">
                All man(${sec}) Pages (${matchingPages.length.toLocaleString()} available — click any to open)
            </div>
        `;
        displaySlice.forEach((pName) => {
            const isManActive = activeManPageName === `${sec}:${pName}`;
            html += `
                <div class="reader-toc-item ${isManActive ? "active" : ""}" onclick="openManPage('${escapeAttr(sec)}', '${escapeAttr(pName)}')">
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Lucida Console',monospace;">man ${escapeHtml(pName)}(${sec})</span>
                    <small>.gz</small>
                </div>
            `;
        });
        if (matchingPages.length > displaySlice.length) {
            html += `<div style="padding:6px 8px;color:#475569;font-size:11px;">Showing first 200 of ${matchingPages.length.toLocaleString()} man(${sec}) pages. Type in the filter box above to jump to any page!</div>`;
        }
    }

    if (!html) {
        html = `<div style="padding:10px;color:#64748b;">No chapters matched "${escapeHtml(filter)}".</div>`;
    }
    tocList.innerHTML = html;
}

function filterBookChapters() {
    renderBookTocList();
}

function pushReaderHistory(entry) {
    if (isNavigatingHistory) return;
    const current = readerHistory[readerHistoryIdx];
    if (
        current &&
        current.type === entry.type &&
        current.bookId === entry.bookId &&
        current.idx === entry.idx &&
        current.sec === entry.sec &&
        current.name === entry.name
    ) {
        return;
    }
    readerHistory = readerHistory.slice(0, readerHistoryIdx + 1);
    readerHistory.push(entry);
    readerHistoryIdx = readerHistory.length - 1;
    updateReaderNavButtons();
}

function updateReaderNavButtons() {
    const backBtn = document.getElementById("btn-reader-back");
    const fwdBtn = document.getElementById("btn-reader-forward");
    if (backBtn) backBtn.disabled = readerHistoryIdx <= 0;
    if (fwdBtn) fwdBtn.disabled = readerHistoryIdx < 0 || readerHistoryIdx >= readerHistory.length - 1;
}

async function readerNavBack() {
    if (readerHistoryIdx <= 0) return;
    readerHistoryIdx--;
    updateReaderNavButtons();
    await restoreReaderHistoryEntry(readerHistory[readerHistoryIdx]);
}

async function readerNavForward() {
    if (readerHistoryIdx >= readerHistory.length - 1) return;
    readerHistoryIdx++;
    updateReaderNavButtons();
    await restoreReaderHistoryEntry(readerHistory[readerHistoryIdx]);
}

async function restoreReaderHistoryEntry(entry) {
    if (!entry) return;
    isNavigatingHistory = true;
    try {
        if (entry.type === "man") {
            await openManPage(entry.sec, entry.name);
        } else if (entry.type === "chapter") {
            if (!currentReaderBook || currentReaderBook.id !== entry.bookId) {
                await openLibraryItem(entry.bookId);
            }
            selectBookChapter(entry.idx || 0);
        }
    } finally {
        isNavigatingHistory = false;
        updateReaderNavButtons();
    }
}

function toggleReaderTocSidebar() {
    const sidebar = document.getElementById("reader-toc-sidebar");
    const splitter = document.getElementById("reader-toc-splitter");
    if (!sidebar) return;
    const isHidden = sidebar.style.display === "none";
    sidebar.style.display = isHidden ? "flex" : "none";
    if (splitter) splitter.style.display = isHidden ? "block" : "none";
}

function selectBookChapter(idx) {
    if (!currentBookChapters.length) return;
    currentChapterIndex = Math.max(0, Math.min(currentBookChapters.length - 1, idx));
    const ch = currentBookChapters[currentChapterIndex];

    // If this is a Linux Man Pages volume and the chapter is a specific man page (e.g. "man mmap(2)"),
    // render it using the rich structured MSDN/XP Man Page Renderer!
    const mManTitle = ch.title.match(/^man\s+([a-zA-Z0-9_.:+-]+)\(([1-8])\)/i);
    if (mManTitle) {
        openManPage(mManTitle[2], mManTitle[1], currentChapterIndex);
        return;
    }

    if (currentReaderBook && currentReaderBook.id) {
        pushReaderHistory({ type: "chapter", bookId: currentReaderBook.id, idx: currentChapterIndex });
    }

    activeManPageName = null;
    renderBookTocList();

    const volDiv = document.getElementById("reader-volume-content");
    if (!volDiv) return;

    const hasPrev = currentChapterIndex > 0;
    const hasNext = currentChapterIndex < currentBookChapters.length - 1;

    // If this is the Section Index chapter of a Linux Man Pages volume, render an interactive clickable directory grid
    if (currentReaderBook && currentReaderBook.man_section && Array.isArray(currentReaderBook.man_pages_list)) {
        const sec = currentReaderBook.man_section;
        const allPages = currentReaderBook.man_pages_list;
        const featuredChapters = currentBookChapters
            .slice(1)
            .map((c, i) => {
                const m = c.title.match(/^man\s+([a-zA-Z0-9_.:+-]+)\(([1-8])\)/i);
                const pName = m ? m[1] : c.title;
                return `<div class="man-index-card" onclick="selectBookChapter(${i + 1})">
                    <span>${escapeHtml(pName)}(${escapeHtml(sec)})</span>
                    <small style="color:#64748b;">Featured</small>
                </div>`;
            })
            .join("");

        const directoryCards = allPages
            .slice(0, 180)
            .map(
                (pName) => `<div class="man-index-card" onclick="openManPage('${escapeAttr(sec)}', '${escapeAttr(pName)}')">
                    <span>${escapeHtml(pName)}(${escapeHtml(sec)})</span>
                    <small style="color:#64748b;">man${escapeHtml(sec)}</small>
                </div>`
            )
            .join("");

        volDiv.innerHTML = `
            <div class="man-reader-wrapper">
                <div class="man-hero-banner">
                    <div class="man-hero-top">
                        <div>
                            <span class="man-cmd-badge">MAN(${escapeHtml(sec)})</span>
                            <span class="man-cat-label">${escapeHtml(currentReaderBook.title)}</span>
                        </div>
                    </div>
                    <div class="man-hero-summary">
                        Interactive Offline Manual Directory — ${allPages.length.toLocaleString()} archived pages in Section ${escapeHtml(sec)}. Click any manual page below or use the sidebar / top search bar to open it.
                    </div>
                </div>

                <div class="man-section-card" style="margin-bottom:14px;">
                    <div class="man-section-header">ESSENTIAL / FEATURED SECTION ${escapeHtml(sec)} MANUALS</div>
                    <div class="man-section-body">
                        <div class="man-index-grid">${featuredChapters}</div>
                    </div>
                </div>

                <div class="man-section-card">
                    <div class="man-section-header">ALPHABETICAL ARCHIVE DIRECTORY (${allPages.length.toLocaleString()} PAGES IN MAN${escapeHtml(sec)})</div>
                    <div class="man-section-body">
                        <div class="man-index-grid">${directoryCards}</div>
                    </div>
                </div>
            </div>
        `;
        volDiv.scrollTop = 0;
        return;
    }

    const headerBox = currentChapterIndex === 0 && currentReaderBook
        ? `<div class="reader-book-header-box">
            <h1>${escapeHtml(currentReaderBook.title)}</h1>
            <div class="meta-sub"><strong>Author:</strong> ${escapeHtml(currentReaderBook.author || "Classic Edition")} &bull; <strong>Category:</strong> ${escapeHtml(currentReaderBook.category || "")} &bull; <strong>Size:</strong> ${escapeHtml(currentReaderBook.size_label || "")}</div>
           </div>`
        : "";

    const navFooter = `
        <div class="reader-chapter-nav-footer">
            <button class="xp-toolbar-btn" ${hasPrev ? "" : "disabled"} onclick="stepBookChapter(-1)">&laquo; Previous Section</button>
            <span>Section ${currentChapterIndex + 1} of ${currentBookChapters.length}</span>
            <button class="xp-toolbar-btn" ${hasNext ? "" : "disabled"} onclick="stepBookChapter(1)">Next Section &raquo;</button>
        </div>
    `;

    volDiv.innerHTML = `
        ${headerBox}
        <h2 class="reader-chapter-title">${escapeHtml(ch.title)}</h2>
        <div class="reader-chapter-prose">${formatBookProse(ch.content)}</div>
        ${navFooter}
    `;
    volDiv.scrollTop = 0;

    const statusEl = document.getElementById("reader-status-text");
    if (statusEl && currentReaderBook) {
        statusEl.textContent = `${currentReaderBook.title} — Section ${currentChapterIndex + 1}/${currentBookChapters.length}: ${ch.title}`;
    }
}

async function openManPage(sec, pageName, chapterIdxOverride = null) {
    openWindow("win-reader");
    pushReaderHistory({ type: "man", sec: String(sec), name: String(pageName) });
    const volDiv = document.getElementById("reader-volume-content");
    const iframe = document.getElementById("reader-kiwix-iframe");
    const tocSidebar = document.getElementById("reader-toc-sidebar");
    const tocSplitter = document.getElementById("reader-toc-splitter");
    if (iframe) iframe.style.display = "none";
    if (volDiv) volDiv.style.display = "block";
    if (tocSidebar && tocSidebar.style.display !== "none") tocSidebar.style.display = "flex";
    if (tocSplitter && tocSidebar && tocSidebar.style.display !== "none") tocSplitter.style.display = "block";

    if (chapterIdxOverride !== null) {
        currentChapterIndex = chapterIdxOverride;
        activeManPageName = null;
    } else {
        activeManPageName = `${sec}:${pageName}`;
    }
    renderBookTocList();

    document.getElementById("reader-win-icon").innerHTML = xpIcon("book_slate", 16);
    document.getElementById("reader-win-title").textContent = `man ${pageName}(${sec}) — Linux Manual Reader`;
    document.getElementById("reader-location-bar").value = `man://${sec}/${pageName} (/data/app_data/manpages/man${sec}/${pageName}.${sec}.gz)`;

    if (volDiv) {
        volDiv.innerHTML = `<div class="man-reader-wrapper"><div class="man-hero-banner">Formatting <code>man ${escapeHtml(pageName)}(${escapeHtml(sec)})</code> via GNU groff...</div></div>`;
    }

    try {
        const res = await fetch(`/api/man/page/${encodeURIComponent(sec)}/${encodeURIComponent(pageName)}`);
        if (!res.ok) {
            throw new Error(`Manual page ${pageName}(${sec}) not found`);
        }
        const data = await res.json();
        if (volDiv) {
            volDiv.innerHTML = data.html || `<div class="reader-chapter-prose">${renderMarkdown(data.content || "")}</div>`;
            volDiv.scrollTop = 0;
        }
        const statusEl = document.getElementById("reader-status-text");
        if (statusEl) {
            statusEl.textContent = `${data.title} — ${(data.word_count || 0).toLocaleString()} words`;
        }
        const metaBadge = document.getElementById("reader-meta-badge");
        if (metaBadge) {
            metaBadge.textContent = `man ${data.name}(${data.sec})`;
        }
    } catch (err) {
        if (volDiv) {
            volDiv.innerHTML = `<div class="man-reader-wrapper"><p style="color:#dc2626;">Could not open <code>man ${escapeHtml(pageName)}(${escapeHtml(sec)})</code>: ${escapeHtml(String(err))}</p></div>`;
        }
    }
}

function scrollToManSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

async function handleQuickManJump(e) {
    e.preventDefault();
    const input = document.getElementById("reader-man-quick-input");
    const raw = (input?.value || "").trim();
    if (!raw) return;

    // Support "mmap(2)", "2 mmap", "man mmap", or "mmap"
    let sec = "2";
    let name = raw.replace(/^man\s+/i, "").trim();

    const mParen = name.match(/^([a-zA-Z0-9_.:+-]+)\(([1-8])\)$/);
    const mSpace = name.match(/^([1-8])\s+([a-zA-Z0-9_.:+-]+)$/);
    if (mParen) {
        name = mParen[1];
        sec = mParen[2];
        await openManPage(sec, name);
        return;
    }
    if (mSpace) {
        sec = mSpace[1];
        name = mSpace[2];
        await openManPage(sec, name);
        return;
    }

    // Search index to find best matching section & page name
    try {
        const res = await fetch(`/api/man/search?q=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const best = data.results[0];
            await openManPage(String(best.sec), best.name);
            return;
        }
    } catch (err) {
        console.error("Man search failed:", err);
    }
    await openManPage("2", name);
}

function stepBookChapter(delta) {
    if (!currentBookChapters.length) return;
    const nextIdx = currentChapterIndex + delta;
    if (nextIdx >= 0 && nextIdx < currentBookChapters.length) {
        selectBookChapter(nextIdx);
    }
}

function formatBookProse(rawContent) {
    // If content has markdown tables or code blocks (e.g. Linux Syscalls Reference), use markdown renderer
    if (rawContent.includes("| Syscall # |") || rawContent.includes("```")) {
        return renderMarkdown(rawContent);
    }
    const paras = rawContent.split(/\n\s*\n/);
    return paras
        .map((p) => {
            const trimmed = p.trim();
            if (!trimmed) return "";
            if (trimmed.startsWith("#")) {
                return `<h3>${escapeHtml(trimmed.replace(/^#+\s*/, ""))}</h3>`;
            }
            return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p>`;
        })
        .join("");
}

function openKiwixBrowser(urlPath = "/kiwix/") {
    currentReaderBook = { title: "Kiwix ZIM Server Catalog", type: "zim" };
    openWindow("win-reader");
    document.getElementById("reader-win-icon").innerHTML = xpIcon("ie_globe", 16);
    document.getElementById("reader-win-title").textContent = "Kiwix Offline ZIM Server — Explorer";
    document.getElementById("reader-location-bar").value = `http://localhost${urlPath}`;
    document.getElementById("reader-volume-content").style.display = "none";
    const tocSidebar = document.getElementById("reader-toc-sidebar");
    if (tocSidebar) tocSidebar.style.display = "none";
    document.getElementById("btn-reader-home").style.display = "inline-flex";
    const iframe = document.getElementById("reader-kiwix-iframe");
    iframe.style.display = "block";
    iframe.src = urlPath;
}

function askAiAboutCurrentBook() {
    if (!currentReaderBook) return;
    const ch = currentBookChapters[currentChapterIndex];
    const chContext = ch ? ` (specifically section "${ch.title}")` : "";
    openChatAndFocus(`Summarize the key ideas from "${currentReaderBook.title}"${chContext}`);
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
// 7. Add / Remove Books (Full Gutenberg Books + Kiwix ZIM Downloader)
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

            const iconKey = pkg.icon_type || (pkg.source_type === "gutenberg" ? "book_gold" : "zim_disc");

            let actionHtml = "";
            if (pkg.installed) {
                actionHtml = `<span style="color:#065f46;font-weight:bold;display:inline-flex;align-items:center;gap:5px;">
                    ${xpIcon("status_ok", 16)} <span>Installed</span>
                </span>`;
            } else if (isRunning) {
                const pct = dl.percent || 10;
                actionHtml = `
                    <div style="width:190px;">
                        <div style="font-size:10.5px;color:#003c9d;margin-bottom:2px;">${escapeHtml(dl.message || "Downloading...")}</div>
                        <div class="xp-progress-outer"><div class="xp-progress-inner" style="width:${pct}%;"></div></div>
                    </div>
                `;
            } else {
                actionHtml = `<button class="xp-button-primary" onclick="startZimDownload('${escapeAttr(pkg.id)}')">Install to Shelf</button>`;
            }

            html += `
                <div class="xp-pkg-row">
                    <div class="xp-pkg-info">
                        <div class="xp-pkg-title">
                            ${xpIcon(iconKey, 20)}
                            <span>${escapeHtml(pkg.title)}</span>
                            <span class="xp-pkg-badge">${escapeHtml(pkg.size_label)}</span>
                            <span class="xp-pkg-badge">${escapeHtml(pkg.category)}</span>
                        </div>
                        <div class="xp-pkg-desc">${escapeHtml(pkg.description)}</div>
                        ${dl && dl.status === "error" ? `<div style="color:#b91c1c;font-size:11px;margin-top:3px;">Error: ${escapeHtml(dl.message)}</div>` : ""}
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
                }, 1500);
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
        document.getElementById("downloader-status-msg").textContent = `Installing ${itemId} into Library...`;
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
        if (chevron) chevron.innerHTML = "&#9660;";
    } else {
        dock.classList.add("dock-collapsed");
        if (chevron) chevron.innerHTML = "&#9650;";
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
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;">
                    ${xpIcon("msn_chat", 13)} <span>${escapeHtml(c.title)}</span>
                </span>
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
                <div class="xp-file-icon">${xpIcon("msn_chat", 34)}</div>
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
                        return `<span class="source-chip" onclick="openKiwixBrowser('${escapeAttr(s.url)}')">${xpIcon("zim_disc", 13)} <span>${escapeHtml(s.title)}</span></span>`;
                    }
                    if (s.type === "man_page" && s.man_sec && s.man_name) {
                        return `<span class="source-chip" onclick="openManPage('${escapeAttr(s.man_sec)}', '${escapeAttr(s.man_name)}')">${xpIcon("book_slate", 13)} <span>${escapeHtml(s.title)}</span></span>`;
                    }
                    return `<span class="source-chip" onclick="openLibraryItem('${escapeAttr(s.id)}')">${xpIcon("book_blue", 13)} <span>${escapeHtml(s.title)}</span></span>`;
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

function stopAiGeneration() {
    if (activeChatAbortController) {
        activeChatAbortController.abort();
        activeChatAbortController = null;
    }
}

async function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("ai-chat-input");
    const sendBtn = document.getElementById("ai-send-btn");
    const stopBtn = document.getElementById("ai-stop-btn");
    const text = input.value.trim();
    if (!text) return;

    toggleChatDrawer(true);
    if (!activeChatId) {
        await createNewChatSession(true);
    }

    input.value = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "...";
    if (stopBtn) stopBtn.style.display = "inline-flex";

    activeChatAbortController = new AbortController();

    const stream = document.getElementById("ai-messages-stream");
    const streamBubbleId = `stream-bubble-${Date.now()}`;
    const streamSourcesId = `stream-sources-${Date.now()}`;
    stream.innerHTML += `
        <div class="chat-bubble user">${escapeHtml(text)}</div>
        <div class="chat-bubble assistant">
            <div id="${streamBubbleId}"><em>${escapeHtml(appSettings.ai_name)} is writing a solution...</em></div>
            <div id="${streamSourcesId}"></div>
        </div>
    `;
    stream.scrollTop = stream.scrollHeight;

    const bubbleEl = document.getElementById(streamBubbleId);
    const sourcesEl = document.getElementById(streamSourcesId);
    let accumulatedMd = "";

    try {
        const res = await fetch(`/api/chats/${encodeURIComponent(activeChatId)}/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
            signal: activeChatAbortController.signal,
        });

        if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    if (evt.type === "meta" && evt.sources && evt.sources.length > 0 && sourcesEl) {
                        const chips = evt.sources
                            .map((s) => {
                                if (s.type === "zim_article" && s.url) {
                                    return `<span class="source-chip" onclick="openKiwixBrowser('${escapeAttr(s.url)}')">${xpIcon("zim_disc", 13)} <span>${escapeHtml(s.title)}</span></span>`;
                                }
                                if (s.type === "man_page" && s.man_sec && s.man_name) {
                                    return `<span class="source-chip" onclick="openManPage('${escapeAttr(s.man_sec)}', '${escapeAttr(s.man_name)}')">${xpIcon("book_slate", 13)} <span>Read ${escapeHtml(s.title)}</span></span>`;
                                }
                                return `<span class="source-chip" onclick="openLibraryItem('${escapeAttr(s.id)}')">${xpIcon("book_blue", 13)} <span>${escapeHtml(s.title)}</span></span>`;
                            })
                            .join("");
                        sourcesEl.innerHTML = `<div class="chat-sources-row">${chips}</div>`;
                    } else if (evt.type === "token") {
                        accumulatedMd += evt.token;
                        if (bubbleEl) {
                            bubbleEl.innerHTML = renderMarkdown(accumulatedMd, true);
                        }
                        stream.scrollTop = stream.scrollHeight;
                    }
                } catch (parseErr) {
                    console.error("Stream parse error:", parseErr);
                }
            }
        }

        await selectChatSession(activeChatId);
        await loadChatsList(false);
    } catch (err) {
        if (err && err.name === "AbortError") {
            if (bubbleEl && !accumulatedMd) {
                bubbleEl.innerHTML = `<em style="color:#64748b;">Generation stopped by user.</em>`;
            }
            await loadChatsList(false);
        } else if (bubbleEl) {
            bubbleEl.innerHTML = `<span style="color:#dc2626;">Error: ${escapeHtml(String(err))}</span>`;
        }
    } finally {
        activeChatAbortController = null;
        if (stopBtn) stopBtn.style.display = "none";
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

function copyCodeBlock(btnEl) {
    const wrap = btnEl.closest(".md-code-wrap");
    const codeEl = wrap?.querySelector("code");
    if (!codeEl) return;
    navigator.clipboard?.writeText(codeEl.textContent || "");
    const orig = btnEl.textContent;
    btnEl.textContent = "Copied!";
    setTimeout(() => {
        btnEl.textContent = orig;
    }, 1400);
}

function renderInlineMarkdown(rawLine) {
    // 1. Protect inline `code` spans first so *, _, etc. inside code are untouched
    const inlineCodes = [];
    let safe = rawLine.replace(/`([^`\n]+)`/g, (_, codeTxt) => {
        const idx = inlineCodes.length;
        inlineCodes.push(`<code class="md-inline-code">${escapeHtml(codeTxt)}</code>`);
        return `@@INLINECODE_${idx}@@`;
    });

    // 2. Escape remaining HTML
    safe = escapeHtml(safe);

    // 3. Bold & Italic
    safe = safe
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>");

    // 4. Restore inline code spans
    safe = safe.replace(/@@INLINECODE_(\d+)@@/g, (_, idx) => inlineCodes[Number(idx)] || "");
    return safe;
}

function renderMarkdown(md, isStreaming = false) {
    let source = String(md ?? "").replace(/\r\n/g, "\n");

    // If streaming and there is an unclosed ``` fence, close it temporarily so it renders as a live code block
    const fenceMatches = source.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 === 1) {
        source += "\n```";
    }

    // 1. Extract fenced code blocks into placeholders BEFORE any line/heading/list parsing
    const codeBlocks = [];
    source = source.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        const langLabel = (lang || "code").trim().toUpperCase();
        const escapedCode = escapeHtml(code.replace(/\n$/, ""));
        codeBlocks.push(
            `<div class="md-code-wrap">` +
                `<div class="md-code-header">` +
                    `<span class="md-code-lang">${escapeHtml(langLabel)}</span>` +
                    `<button type="button" class="md-copy-btn" onclick="copyCodeBlock(this)">Copy Code</button>` +
                `</div>` +
                `<pre class="md-code-pre"><code>${escapedCode}</code></pre>` +
            `</div>`
        );
        return `\n@@CODEBLOCK_${idx}@@\n`;
    });

    // 2. Parse line by line into structured blocks (Headings, Lists, Tables, Blockquotes, Code Placeholders, Paragraphs)
    const lines = source.split("\n");
    const outBlocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            i++;
            continue;
        }

        // Code block placeholder
        const mCode = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
        if (mCode) {
            outBlocks.push(codeBlocks[Number(mCode[1])] || "");
            i++;
            continue;
        }

        // Headings (# .. ####)
        const mHeading = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (mHeading) {
            const level = Math.min(4, mHeading[1].length);
            outBlocks.push(`<h${level}>${renderInlineMarkdown(mHeading[2])}</h${level}>`);
            i++;
            continue;
        }

        // Markdown Table
        if (trimmed.startsWith("|") && trimmed.endsWith("|") && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1].trim())) {
            const tableRows = [];
            while (i < lines.length && lines[i].trim().startsWith("|")) {
                tableRows.push(lines[i].trim());
                i++;
            }
            let tblHtml = "<table>";
            tableRows.forEach((r, rIdx) => {
                if (/^[\s|:-]+$/.test(r)) return;
                const cells = r
                    .replace(/^\|/, "")
                    .replace(/\|$/, "")
                    .split("|")
                    .map((c) => renderInlineMarkdown(c.trim()));
                const tag = rIdx === 0 ? "th" : "td";
                tblHtml += `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
            });
            tblHtml += "</table>";
            outBlocks.push(tblHtml);
            continue;
        }

        // Ordered or Unordered Lists (including indented sub-bullets and continuation lines)
        const isUl = /^[-*+]\s+/.test(trimmed);
        const isOl = /^\d+\.\s+/.test(trimmed);
        if (isUl || isOl) {
            const listTag = isOl ? "ol" : "ul";
            const items = [];
            while (i < lines.length) {
                const curLine = lines[i];
                const curTrim = curLine.trim();
                if (!curTrim) {
                    // Check if the next non-empty line continues the list
                    if (i + 1 < lines.length && (/^(\d+\.|[-*+])\s+/.test(lines[i + 1].trim()) || /^\s{2,}\S/.test(lines[i + 1]))) {
                        i++;
                        continue;
                    }
                    break;
                }
                if (/^@@CODEBLOCK_\d+@@$/.test(curTrim) || /^#{1,4}\s+/.test(curTrim)) {
                    break;
                }
                const mItem = curTrim.match(/^(?:\d+\.|[-*+])\s+(.*)$/);
                if (mItem && !/^\s{2,}[-*+]\s+/.test(curLine)) {
                    items.push(renderInlineMarkdown(mItem[1]));
                    i++;
                } else if (/^\s{2,}[-*+]\s+/.test(curLine) && items.length > 0) {
                    const subText = curTrim.replace(/^[-*+]\s+/, "");
                    items[items.length - 1] += `<br><span style="display:inline-block;padding-left:14px;">&bull; ${renderInlineMarkdown(subText)}</span>`;
                    i++;
                } else if (/^\s{2,}\S/.test(curLine) && items.length > 0) {
                    items[items.length - 1] += `<br>${renderInlineMarkdown(curTrim)}`;
                    i++;
                } else {
                    break;
                }
            }
            outBlocks.push(`<${listTag}>${items.map((it) => `<li>${it}</li>`).join("")}</${listTag}>`);
            continue;
        }

        // Blockquote
        if (trimmed.startsWith(">")) {
            const qLines = [];
            while (i < lines.length && lines[i].trim().startsWith(">")) {
                qLines.push(renderInlineMarkdown(lines[i].trim().replace(/^>\s?/, "")));
                i++;
            }
            outBlocks.push(`<blockquote class="md-quote">${qLines.join("<br>")}</blockquote>`);
            continue;
        }

        // Standard Paragraph (collect consecutive non-special lines)
        const pLines = [];
        while (i < lines.length) {
            const pl = lines[i].trim();
            if (
                !pl ||
                /^@@CODEBLOCK_\d+@@$/.test(pl) ||
                /^#{1,4}\s+/.test(pl) ||
                /^(?:\d+\.|[-*+])\s+/.test(pl) ||
                pl.startsWith(">") ||
                (pl.startsWith("|") && pl.endsWith("|"))
            ) {
                break;
            }
            pLines.push(renderInlineMarkdown(pl));
            i++;
        }
        if (pLines.length > 0) {
            outBlocks.push(`<p>${pLines.join("<br>")}</p>`);
        } else {
            i++;
        }
    }

    const cursorHtml = isStreaming ? `<span class="md-stream-cursor"></span>` : "";
    return `<div class="md-prose">${outBlocks.join("")}${cursorHtml}</div>`;
}
