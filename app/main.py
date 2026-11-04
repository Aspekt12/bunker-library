"""
BunkerOS XP - Unified Backend API
Provides:
1. Windows XP Desktop OS static frontend on http://localhost (Port 80)
2. Persistent SQLite database for Saved Chats, Custom Library Volumes, and XP Settings
3. Dynamic Library & Bookshelf API (Complete Unabridged Books + Custom Notes + Kiwix .zim files)
4. Background Book & ZIM Download Manager (Project Gutenberg full books + Kiwix aria2c)
5. Internal kiwix-serve daemon manager & /kiwix/* reverse proxy
6. Grounded Local AI Chat (Ollama + Full-Book & ZIM RAG with clickable desktop citations)
"""

import asyncio
import html
import json
import os
import re
import shutil
import sqlite3
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from seed_books import DEFAULT_REAL_BOOKS, DOWNLOAD_CATALOG

ZIM_DIR = Path(os.environ.get("ZIM_DIR", "/data/zim_files"))
APP_DATA_DIR = Path(os.environ.get("APP_DATA_DIR", "/data/app_data"))
BOOKS_DIR = APP_DATA_DIR / "books"
DB_PATH = APP_DATA_DIR / "bunker_xp.db"
STATIC_DIR = Path(__file__).resolve().parent / "static"

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "elena-vancea:latest")
FALLBACK_MODEL = os.environ.get("FALLBACK_MODEL", "qwen2.5:7b-instruct-q4_K_M")
KIWIX_INTERNAL_PORT = 8081
KIWIX_BASE_URL = f"http://127.0.0.1:{KIWIX_INTERNAL_PORT}"

ZIM_DIR.mkdir(parents=True, exist_ok=True)
APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
BOOKS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="BunkerOS XP - Offline Knowledge Desktop")


@app.middleware("http")
async def disable_static_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# Global state for kiwix-serve subprocess and active downloads
kiwix_proc: Optional[subprocess.Popen] = None
active_downloads: Dict[str, Dict[str, Any]] = {}


# ==============================================================================
# 1. SQLite Database Initialization & Helpers
# ==============================================================================
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            model TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            sources_json TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS custom_volumes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            spine_color TEXT NOT NULL,
            icon TEXT NOT NULL,
            author TEXT NOT NULL,
            summary TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    conn.commit()

    # Create a welcome chat thread if database has no chats yet
    cur.execute("SELECT COUNT(*) AS cnt FROM chats")
    if cur.fetchone()["cnt"] == 0:
        now = int(time.time())
        welcome_id = "chat-welcome"
        cur.execute(
            "INSERT INTO chats (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (welcome_id, "Welcome to BunkerOS XP", DEFAULT_MODEL, now, now),
        )
        welcome_sources = [
            {
                "id": "book-art-of-war",
                "title": "The Art of War — Sun Tzu",
                "type": "volume",
                "snippet": "Complete 13-chapter classic treatise on military strategy, tactics, and leadership.",
            },
            {
                "id": "book-meditations",
                "title": "Meditations — Marcus Aurelius",
                "type": "volume",
                "snippet": "Complete 12 books of private Stoic philosophical reflections by Roman Emperor Marcus Aurelius.",
            },
            {
                "id": "book-linux-syscalls-full",
                "title": "Linux x86_64 Complete Syscall Reference",
                "type": "volume",
                "snippet": "Complete table of 385 Linux x86_64 system calls extracted from kernel headers.",
            },
        ]
        cur.execute(
            "INSERT INTO messages (id, chat_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                welcome_id,
                "assistant",
                (
                    "Bună ziua! Sunt **Elena Vancea**, Secretară Executivă și Responsabilă a Fondului Documentar din **BunkerOS XP**.\n\n"
                    "- **Volume Complete în Bibliotecă**: Raftul conține acum cărți integrale (*The Art of War*, *Meditations*, *The Prince*, *The Enchiridion*, *The Time Machine*, *Frankenstein* și manualul complet *Linux x86_64 Syscalls*).\n"
                    "- **Descărcare Instantanee**: Din **Add or Remove Books** puteți descărca dintr-un click romane și tratate complete sau arhive `.zim` Kiwix.\n\n"
                    "Cu ce carte, capitol sau referință tehnică vă pot ajuta astăzi?"
                ),
                json.dumps(welcome_sources),
                now,
            ),
        )
        conn.commit()
    conn.close()


# ==============================================================================
# 2. Internal Kiwix-Serve Process Manager & Default Books Seeder
# ==============================================================================
def restart_kiwix_serve() -> bool:
    global kiwix_proc
    if kiwix_proc and kiwix_proc.poll() is None:
        try:
            kiwix_proc.terminate()
            kiwix_proc.wait(timeout=3)
        except Exception:
            try:
                kiwix_proc.kill()
            except Exception:
                pass
    kiwix_proc = None

    zim_files = sorted(str(p) for p in ZIM_DIR.glob("*.zim") if p.is_file() and p.stat().st_size > 0)
    if not zim_files:
        return False

    cmd = [
        "kiwix-serve",
        f"--port={KIWIX_INTERNAL_PORT}",
        "--urlRootLocation=/kiwix",
        *zim_files,
    ]
    try:
        kiwix_proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def strip_gutenberg_boilerplate(raw: str, title: str, author: str) -> str:
    text = raw.replace("\r\n", "\n")
    start_markers = [
        "*** START OF THE PROJECT GUTENBERG EBOOK",
        "*** START OF THIS PROJECT GUTENBERG EBOOK",
        "***START OF THE PROJECT GUTENBERG EBOOK",
    ]
    for m in start_markers:
        idx = text.find(m)
        if idx != -1:
            nl = text.find("\n", idx)
            if nl != -1:
                text = text[nl + 1 :]
            break

    end_markers = [
        "*** END OF THE PROJECT GUTENBERG EBOOK",
        "*** END OF THIS PROJECT GUTENBERG EBOOK",
        "***END OF THE PROJECT GUTENBERG EBOOK",
        "End of the Project Gutenberg EBook",
        "End of Project Gutenberg's",
    ]
    for m in end_markers:
        idx = text.find(m)
        if idx != -1:
            text = text[:idx]
            break

    text = text.strip()
    header = f"# {title}\n**Author:** {author}\n\n---\n\n"
    return header + text


async def ensure_default_books() -> None:
    """Downloads any missing default Gutenberg book in background if not already on disk."""
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for b in DEFAULT_REAL_BOOKS:
            fpath = BOOKS_DIR / b["filename"]
            if fpath.exists() and fpath.stat().st_size > 1024:
                continue
            url = b.get("gutenberg_url", "")
            if not url:
                continue
            try:
                resp = await client.get(url)
                if resp.status_code == 200 and len(resp.text) > 1000:
                    cleaned = strip_gutenberg_boilerplate(resp.text, b["title"], b["author"])
                    fpath.write_text(cleaned, encoding="utf-8")
            except Exception:
                pass


async def ensure_ollama_persona() -> None:
    """Ensures elena-vancea:latest is compiled in Ollama if qwen2.5 is present."""
    await asyncio.sleep(3)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                models = [m.get("name", "") for m in resp.json().get("models", [])]
                if not any(m.startswith("elena-vancea") for m in models):
                    if any("qwen2.5" in m for m in models):
                        system_prompt = (
                            "Vă numiți Elena Vancea, Secretară Executivă și Bibliotecară Tehnică în BunkerOS XP. "
                            "Răspundeți riguros pe baza arhivelor locale și citați sursele."
                        )
                        await client.post(
                            f"{OLLAMA_BASE_URL}/api/create",
                            json={
                                "name": "elena-vancea:latest",
                                "from": FALLBACK_MODEL,
                                "system": system_prompt,
                            },
                            timeout=30.0,
                        )
    except Exception:
        pass


@app.on_event("startup")
async def on_startup() -> None:
    init_db()
    restart_kiwix_serve()
    asyncio.create_task(ensure_default_books())
    asyncio.create_task(ensure_ollama_persona())


# ==============================================================================
# 3. Library & Bookshelf Inventory + Chapter Parser
# ==============================================================================
SPINE_PALETTE = [
    "#1e3a8a",
    "#7c2d12",
    "#065f46",
    "#92400e",
    "#312e81",
    "#831843",
    "#115e59",
    "#3730a3",
    "#991b1b",
    "#1e40af",
]


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024**2:
        return f"{size / 1024:.1f} KB"
    if size < 1024**3:
        return f"{size / (1024**2):.1f} MB"
    return f"{size / (1024**3):.2f} GB"


def get_all_book_definitions() -> List[Dict[str, Any]]:
    """Combines DEFAULT_REAL_BOOKS and any Gutenberg book from DOWNLOAD_CATALOG."""
    defs: Dict[str, Dict[str, Any]] = {}
    for b in DEFAULT_REAL_BOOKS:
        defs[b["id"]] = dict(b)
    for c in DOWNLOAD_CATALOG:
        if c.get("source_type") == "gutenberg":
            defs[c["id"]] = {
                "id": c["id"],
                "title": c["title"].replace(" (Full Book)", "").replace(" (Complete Novel)", "").replace(" (Full Epic Poem)", "").replace(" (Complete 10 Books)", ""),
                "author": c.get("author", "Project Gutenberg"),
                "category": c.get("category", "Classic Literature & Sci-Fi"),
                "spine_color": c.get("spine_color", "#1e3a8a"),
                "icon_type": c.get("icon_type", "book_blue"),
                "filename": c["filename"],
                "summary": c.get("description", ""),
                "removable": True,
            }
    return list(defs.values())


def parse_book_chapters(raw_text: str, book_title: str) -> List[Dict[str, Any]]:
    """
    Splits a full-length book into navigable chapters/sections so the Reader window
    renders smoothly and provides a real Chapter Table of Contents.
    """
    lines = raw_text.splitlines()
    heading_re = re.compile(
        r"^(?:"
        r"#{1,3}\s+.+|"
        r"(?:CHAPTER|BOOK|PART|SECTION|ACT|LETTER|ADVENTURE)\s+[IVXLCDM0-9]+.*|"
        r"^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI)\.\s+[A-Z].*"
        r")$"
    )

    raw_chapters: List[Dict[str, Any]] = []
    current_title = "Front Matter & Introduction"
    current_lines: List[str] = []

    for line in lines:
        stripped = line.strip()
        is_heading = False
        if stripped and len(stripped) < 95:
            if heading_re.match(stripped):
                is_heading = True

        if is_heading and len("\n".join(current_lines).strip()) > 600:
            raw_chapters.append(
                {
                    "title": current_title.lstrip("#").strip(),
                    "content": "\n".join(current_lines).strip(),
                }
            )
            current_title = stripped.lstrip("#").strip()
            current_lines = [line]
        else:
            if is_heading and len("\n".join(current_lines).strip()) <= 600 and current_title == "Front Matter & Introduction":
                current_title = stripped.lstrip("#").strip()
            current_lines.append(line)

    if current_lines and "\n".join(current_lines).strip():
        raw_chapters.append(
            {
                "title": current_title.lstrip("#").strip(),
                "content": "\n".join(current_lines).strip(),
            }
        )

    # If a chapter is very long (> 22,000 chars) or book had no standard chapter markers,
    # subdivide large blocks cleanly along paragraph boundaries (~14,000 chars per part)
    final_chapters: List[Dict[str, Any]] = []
    MAX_CHARS = 16000
    for ch in raw_chapters:
        text = ch["content"]
        if len(text) <= MAX_CHARS:
            final_chapters.append(ch)
        else:
            paras = text.split("\n\n")
            chunk: List[str] = []
            chunk_len = 0
            part_num = 1
            for p in paras:
                if chunk_len + len(p) > MAX_CHARS and chunk:
                    suffix = f" (Part {part_num})" if part_num > 1 or len(text) > MAX_CHARS else ""
                    final_chapters.append(
                        {
                            "title": f"{ch['title']}{suffix}",
                            "content": "\n\n".join(chunk).strip(),
                        }
                    )
                    part_num += 1
                    chunk = [p]
                    chunk_len = len(p)
                else:
                    chunk.append(p)
                    chunk_len += len(p) + 2
            if chunk:
                suffix = f" (Part {part_num})" if part_num > 1 else ""
                final_chapters.append(
                    {
                        "title": f"{ch['title']}{suffix}",
                        "content": "\n\n".join(chunk).strip(),
                    }
                )

    for idx, ch in enumerate(final_chapters):
        ch["index"] = idx
        ch["word_count"] = len(ch["content"].split())

    return final_chapters


def get_all_library_items() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []

    # 1. Installed full-text books in /data/app_data/books
    for bdef in get_all_book_definitions():
        fpath = BOOKS_DIR / bdef["filename"]
        if not fpath.exists() or not fpath.is_file():
            continue
        stat = fpath.stat()
        if stat.st_size < 100:
            continue
        items.append(
            {
                "id": bdef["id"],
                "title": bdef["title"],
                "category": bdef["category"],
                "type": "volume",
                "spine_color": bdef["spine_color"],
                "icon_type": bdef.get("icon_type", "book_blue"),
                "size_label": format_bytes(stat.st_size),
                "size_bytes": stat.st_size,
                "author": bdef["author"],
                "summary": bdef["summary"],
                "removable": bool(bdef.get("removable", False)),
            }
        )

    # 2. User-created custom volumes from SQLite
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM custom_volumes ORDER BY created_at ASC")
    for row in cur.fetchall():
        content_bytes = len((row["content"] or "").encode("utf-8"))
        items.append(
            {
                "id": row["id"],
                "title": row["title"],
                "category": row["category"],
                "type": "volume",
                "spine_color": row["spine_color"],
                "icon_type": "book_note",
                "size_label": format_bytes(content_bytes),
                "size_bytes": content_bytes,
                "author": row["author"],
                "summary": row["summary"],
                "removable": True,
            }
        )
    conn.close()

    # 3. Downloaded .zim files in /data/zim_files
    zim_files = sorted(ZIM_DIR.glob("*.zim"))
    for idx, zpath in enumerate(zim_files):
        if not zpath.is_file():
            continue
        stat = zpath.stat()
        stem = zpath.stem
        book_slug = re.sub(r"_[0-9]{4}-[0-9]{2}$", "", stem)
        pretty_title = stem.replace("_", " ").replace(".", " ").title()
        category = "Kiwix ZIM Archives"
        lower_name = stem.lower()
        if "wikipedia" in lower_name:
            category = "Encyclopedias (Wikipedia)"
        elif any(k in lower_name for k in ("devdocs", "stack", "unix", "osdev", "c_", "linux", "python", "bash")):
            category = "Systems & Kernel Engineering"
        elif any(k in lower_name for k in ("med", "ifixit", "osm")):
            category = "Science & Medicine"

        items.append(
            {
                "id": f"zim::{zpath.name}",
                "zim_filename": zpath.name,
                "zim_slug": stem,
                "book_slug": book_slug,
                "title": pretty_title,
                "category": category,
                "type": "zim",
                "spine_color": SPINE_PALETTE[idx % len(SPINE_PALETTE)],
                "icon_type": "zim_disc",
                "size_label": format_bytes(stat.st_size),
                "size_bytes": stat.st_size,
                "author": "Kiwix Offline ZIM",
                "summary": f"Offline ZIM Archive ({zpath.name}, {format_bytes(stat.st_size)}). Opens in Kiwix Reader.",
                "reader_url": "/kiwix/",
                "removable": True,
            }
        )

    return items


# ==============================================================================
# 4. API Endpoints: Settings, System Status, Library, Catalog & Downloader
# ==============================================================================
DEFAULT_SETTINGS: Dict[str, Any] = {
    "xp_theme": "luna-blue",           # luna-blue | luna-olive | luna-silver | royale-noir | classic-98
    "wallpaper": "wallpaper-bliss",    # wallpaper-bliss | wallpaper-autumn | wallpaper-azul | wallpaper-ascent | wallpaper-mahogany | wallpaper-teal | custom
    "custom_wallpaper": "",            # Data URL or external URL if wallpaper == 'custom'
    "ai_name": "Elena Vancea",
    "ai_avatar": "xp_agent_f",         # xp_agent_f | xp_agent_m | xp_clippy | xp_rover | xp_msn | xp_computer
    "ai_role_title": "Executive Secretary & Chief Technical Librarian",
    "ai_personality": (
        "You are {ai_name}, {ai_role_title} inside BunkerOS XP (an autonomous offline knowledge desktop). "
        "Answer clearly, concisely, and accurately in the language used by the user (Romanian or English). "
        "Always prioritize verified facts from the local archive excerpts when provided and cite the archive volume title."
    ),
    "bookshelf_layout": "spines-3d",   # spines-3d | covers-grid | xp-tiles | xp-details
    "shelf_density": "normal",         # compact | normal | large
    "chat_layout": "fb-side",          # fb-side (Old Facebook bottom-right popup) | bottom-bar (Wide docked bar)
    "font_size_px": 12,                # UI Base Font Size: 10 to 24
    "reader_font_size_px": 15,         # Reader & Chat Text Size: 11 to 28
}


def load_settings_dict() -> Dict[str, Any]:
    merged = dict(DEFAULT_SETTINGS)
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM app_settings")
        for row in cur.fetchall():
            try:
                merged[row["key"]] = json.loads(row["value"])
            except Exception:
                merged[row["key"]] = row["value"]
        conn.close()
    except Exception:
        pass
    # Migrate any legacy emoji avatar to vector avatar key
    if merged.get("ai_avatar") not in (
        "xp_agent_f",
        "xp_agent_m",
        "xp_clippy",
        "xp_rover",
        "xp_msn",
        "xp_computer",
    ):
        merged["ai_avatar"] = "xp_agent_f"
    return merged


@app.get("/api/settings")
async def api_get_settings() -> Dict[str, Any]:
    return load_settings_dict()


@app.post("/api/settings")
async def api_save_settings(payload: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_db()
    cur = conn.cursor()
    for k, v in payload.items():
        if k in DEFAULT_SETTINGS:
            cur.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (k, json.dumps(v)),
            )
    conn.commit()
    conn.close()
    return load_settings_dict()


@app.get("/api/system/status")
async def api_system_status() -> Dict[str, Any]:
    disk = shutil.disk_usage(str(ZIM_DIR))
    zim_count = len(list(ZIM_DIR.glob("*.zim")))
    kiwix_running = kiwix_proc is not None and kiwix_proc.poll() is None

    ollama_online = False
    ollama_models: List[str] = []
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if r.status_code == 200:
                ollama_online = True
                ollama_models = [m.get("name", "") for m in r.json().get("models", [])]
    except Exception:
        pass

    items = get_all_library_items()
    return {
        "disk_free_gb": round(disk.free / (1024**3), 1),
        "disk_total_gb": round(disk.total / (1024**3), 1),
        "disk_used_percent": round((disk.used / disk.total) * 100, 1),
        "zim_count": zim_count,
        "total_books": len(items),
        "kiwix_running": kiwix_running,
        "ollama_online": ollama_online,
        "ollama_models": ollama_models,
        "active_model": DEFAULT_MODEL if DEFAULT_MODEL in ollama_models else (ollama_models[0] if ollama_models else DEFAULT_MODEL),
    }


@app.get("/api/library")
async def api_get_library() -> Dict[str, Any]:
    items = get_all_library_items()
    categories: Dict[str, List[Dict[str, Any]]] = {}
    for item in items:
        cat = item["category"]
        categories.setdefault(cat, []).append(item)
    return {
        "total": len(items),
        "items": items,
        "categories": categories,
    }


@app.get("/api/library/volume/{vol_id}")
async def api_get_volume(vol_id: str) -> Dict[str, Any]:
    # 1. Check installed full-text books
    for bdef in get_all_book_definitions():
        if bdef["id"] == vol_id:
            fpath = BOOKS_DIR / bdef["filename"]
            if fpath.exists() and fpath.is_file():
                raw_text = fpath.read_text(encoding="utf-8", errors="replace")
                chapters = parse_book_chapters(raw_text, bdef["title"])
                stat = fpath.stat()
                total_words = sum(ch.get("word_count", 0) for ch in chapters)
                return {
                    "id": bdef["id"],
                    "title": bdef["title"],
                    "author": bdef["author"],
                    "category": bdef["category"],
                    "spine_color": bdef["spine_color"],
                    "icon_type": bdef.get("icon_type", "book_blue"),
                    "size_label": format_bytes(stat.st_size),
                    "word_count": total_words,
                    "summary": bdef["summary"],
                    "chapters": chapters,
                    "content": chapters[0]["content"] if chapters else raw_text[:12000],
                }

    # 2. Check custom SQLite volumes
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM custom_volumes WHERE id = ?", (vol_id,))
    row = cur.fetchone()
    conn.close()
    if row:
        d = dict(row)
        chapters = parse_book_chapters(d["content"], d["title"])
        d["chapters"] = chapters
        d["word_count"] = len(d["content"].split())
        d["size_label"] = format_bytes(len(d["content"].encode("utf-8")))
        return d

    raise HTTPException(status_code=404, detail="Volume not found")


class CustomVolumeCreate(BaseModel):
    title: str
    category: str = "Custom Field Notes"
    author: str = "Bunker Operator"
    summary: str = ""
    content: str
    spine_color: str = "#1e3a8a"


@app.post("/api/library/custom")
async def api_create_custom_volume(payload: CustomVolumeCreate) -> Dict[str, Any]:
    vol_id = f"vol-custom-{uuid.uuid4().hex[:8]}"
    now = int(time.time())
    summary = payload.summary.strip() or payload.content.strip()[:140]
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO custom_volumes (id, title, category, spine_color, icon, author, summary, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            vol_id,
            payload.title.strip(),
            payload.category.strip(),
            payload.spine_color,
            "book_note",
            payload.author.strip(),
            summary,
            payload.content,
            now,
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "id": vol_id}


@app.get("/api/catalog")
async def api_get_catalog() -> Dict[str, Any]:
    existing_zims = [p.name for p in ZIM_DIR.glob("*.zim")]
    existing_books = [p.name for p in BOOKS_DIR.glob("*.txt") if p.stat().st_size > 100]
    catalog_out = []
    for entry in DOWNLOAD_CATALOG:
        if entry.get("source_type") == "gutenberg":
            installed = entry.get("filename") in existing_books
        else:
            installed = any(re.search(entry["prefix_regex"], zname) for zname in existing_zims)
        dl_state = active_downloads.get(entry["id"])
        catalog_out.append(
            {
                **entry,
                "installed": installed,
                "download_state": dl_state,
            }
        )
    return {"catalog": catalog_out, "active_downloads": active_downloads}


async def resolve_kiwix_url(kiwix_category: str, prefix_regex: str) -> Optional[str]:
    dir_url = f"https://download.kiwix.org/zim/{kiwix_category}/"
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(dir_url)
            if resp.status_code != 200:
                return None
            pattern = re.compile(rf"({prefix_regex}_[0-9]{{4}}-[0-9]{{2}}\.zim)")
            matches = sorted(set(pattern.findall(resp.text)))
            if matches:
                return f"{dir_url}{matches[-1]}"
    except Exception:
        return None
    return None


async def run_download_job(item: Dict[str, str]) -> None:
    item_id = item["id"]
    source_type = item.get("source_type", "zim")

    # Branch A: Full-Text Project Gutenberg Book Download
    if source_type == "gutenberg":
        url = item["direct_url"]
        filename = item["filename"]
        active_downloads[item_id] = {
            "id": item_id,
            "title": item["title"],
            "status": "downloading",
            "percent": 15,
            "filename": filename,
            "message": f"Downloading full book text from Project Gutenberg...",
        }
        try:
            async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code == 200 and len(resp.text) > 1000:
                    active_downloads[item_id]["percent"] = 75
                    active_downloads[item_id]["message"] = "Formatting chapters and indexing into Library..."
                    clean_title = item["title"].replace(" (Full Book)", "").replace(" (Complete Novel)", "")
                    cleaned = strip_gutenberg_boilerplate(
                        resp.text,
                        clean_title,
                        item.get("author", "Project Gutenberg"),
                    )
                    target_path = BOOKS_DIR / filename
                    target_path.write_text(cleaned, encoding="utf-8")
                    active_downloads[item_id] = {
                        "id": item_id,
                        "title": item["title"],
                        "status": "completed",
                        "percent": 100,
                        "filename": filename,
                        "message": f"Installed {clean_title} ({format_bytes(target_path.stat().st_size)}) to Library!",
                    }
                else:
                    active_downloads[item_id] = {
                        "id": item_id,
                        "title": item["title"],
                        "status": "error",
                        "percent": 0,
                        "message": f"HTTP {resp.status_code} while fetching book.",
                    }
        except Exception as exc:
            active_downloads[item_id] = {
                "id": item_id,
                "title": item["title"],
                "status": "error",
                "percent": 0,
                "message": f"Failed to download book: {exc}",
            }
        return

    # Branch B: Official Kiwix .ZIM Archive Download via aria2c
    active_downloads[item_id] = {
        "id": item_id,
        "title": item["title"],
        "status": "resolving",
        "percent": 2,
        "message": "Resolving latest ZIM mirror from download.kiwix.org...",
    }

    url = await resolve_kiwix_url(item["kiwix_category"], item["prefix_regex"])
    if not url:
        active_downloads[item_id] = {
            "id": item_id,
            "title": item["title"],
            "status": "error",
            "percent": 0,
            "message": "Could not resolve remote URL (check internet connection).",
        }
        return

    filename = url.split("/")[-1]
    active_downloads[item_id].update(
        {
            "status": "downloading",
            "percent": 5,
            "filename": filename,
            "url": url,
            "message": f"Downloading {filename} via aria2c...",
        }
    )

    cmd = [
        "aria2c",
        "-c",
        "-x",
        "8",
        "-s",
        "8",
        "--dir",
        str(ZIM_DIR),
        "--out",
        filename,
        "--auto-file-renaming=false",
        "--allow-overwrite=true",
        "--summary-interval=1",
        url,
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        pct_re = re.compile(r"\(([0-9]{1,3})%\)")
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").strip()
            m = pct_re.search(line)
            if m:
                pct = min(99, max(5, int(m.group(1))))
                active_downloads[item_id]["percent"] = pct
                active_downloads[item_id]["message"] = f"Downloading {filename} ({pct}%)..."

        rc = await proc.wait()
        if rc == 0 and (ZIM_DIR / filename).exists():
            restart_kiwix_serve()
            active_downloads[item_id] = {
                "id": item_id,
                "title": item["title"],
                "status": "completed",
                "percent": 100,
                "filename": filename,
                "message": f"Installed {filename}! Added to Desktop & Library Shelf.",
            }
        else:
            active_downloads[item_id] = {
                "id": item_id,
                "title": item["title"],
                "status": "error",
                "percent": 0,
                "message": f"Download exited with code {rc}.",
            }
    except Exception as exc:
        active_downloads[item_id] = {
            "id": item_id,
            "title": item["title"],
            "status": "error",
            "percent": 0,
            "message": str(exc),
        }


@app.post("/api/downloads/start/{item_id}")
async def api_start_download(item_id: str) -> Dict[str, Any]:
    target = next((x for x in DOWNLOAD_CATALOG if x["id"] == item_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    existing = active_downloads.get(item_id)
    if existing and existing.get("status") in ("resolving", "downloading"):
        return {"status": "already_running", "job": existing}

    asyncio.create_task(run_download_job(target))
    return {"status": "started", "id": item_id}


@app.delete("/api/library/book/{book_id}")
async def api_delete_book(book_id: str) -> Dict[str, Any]:
    for c in DOWNLOAD_CATALOG:
        if c.get("id") == book_id and c.get("source_type") == "gutenberg":
            target = BOOKS_DIR / c["filename"]
            if target.exists():
                target.unlink()
                active_downloads.pop(book_id, None)
                return {"status": "deleted", "id": book_id}
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM custom_volumes WHERE id = ?", (book_id,))
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    if deleted:
        return {"status": "deleted", "id": book_id}
    raise HTTPException(status_code=404, detail="Book not found or is a core system volume")


@app.delete("/api/library/zim/{filename}")
async def api_delete_zim(filename: str) -> Dict[str, Any]:
    safe_name = Path(filename).name
    target = ZIM_DIR / safe_name
    if target.exists() and target.is_file():
        target.unlink()
        restart_kiwix_serve()
        return {"status": "deleted", "filename": safe_name}
    raise HTTPException(status_code=404, detail="ZIM file not found")


# ==============================================================================
# 5. Archive Search & Grounding (Full-Text Books + Custom Notes + Kiwix ZIMs)
# ==============================================================================
STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "from", "what", "how", "who",
    "where", "when", "why", "are", "was", "were", "have", "has", "had", "about",
    "into", "care", "este", "sunt", "din", "pentru", "cum", "despre", "unui",
}


async def search_all_archives(query: str) -> List[Dict[str, str]]:
    if not query.strip():
        return []

    tokens = [
        t.lower()
        for t in re.findall(r"[a-zA-Z0-9_]{3,}", query)
        if t.lower() not in STOPWORDS
    ]
    if not tokens:
        tokens = [query.strip().lower()]

    matches: List[Dict[str, str]] = []

    # 1. Search installed full-text books in /data/app_data/books
    for bdef in get_all_book_definitions():
        fpath = BOOKS_DIR / bdef["filename"]
        if not fpath.exists() or not fpath.is_file():
            continue
        try:
            text = fpath.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        title_lower = f"{bdef['title']} {bdef['author']} {bdef['summary']}".lower()
        title_hits = sum(4 for tok in tokens if tok in title_lower)

        # Find best matching paragraph across the book
        best_para = ""
        best_para_score = 0
        for para in text.split("\n\n"):
            p_clean = para.strip()
            if len(p_clean) < 40:
                continue
            p_lower = p_clean.lower()
            p_score = sum(2 for tok in tokens if tok in p_lower)
            if p_score > best_para_score:
                best_para_score = p_score
                best_para = p_clean[:550]

        total_score = title_hits + best_para_score
        if total_score > 0:
            matches.append(
                {
                    "id": bdef["id"],
                    "title": f"{bdef['title']} ({bdef['author']})",
                    "type": "volume",
                    "snippet": best_para or bdef["summary"],
                    "score": str(total_score),
                }
            )

    # 2. Search custom SQLite volumes
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM custom_volumes")
    for r in cur.fetchall():
        vol = dict(r)
        haystack = f"{vol['title']} {vol.get('summary', '')} {vol['content']}".lower()
        score = sum(3 if tok in vol["title"].lower() else (1 if tok in haystack else 0) for tok in tokens)
        if score > 0:
            best_para = vol.get("summary", "")
            for para in vol["content"].split("\n\n"):
                if any(tok in para.lower() for tok in tokens):
                    best_para = para.strip()[:500]
                    break
            matches.append(
                {
                    "id": vol["id"],
                    "title": vol["title"],
                    "type": "volume",
                    "snippet": best_para,
                    "score": str(score),
                }
            )
    conn.close()

    # 3. Search live Kiwix ZIM server if running
    if kiwix_proc and kiwix_proc.poll() is None:
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(
                    f"{KIWIX_BASE_URL}/kiwix/search",
                    params={"pattern": query.strip(), "pageLength": 4},
                )
                if resp.status_code == 200 and "no results were found" not in resp.text.lower():
                    link_pattern = re.compile(
                        r'<a[^>]+href=["\'](?P<href>/kiwix/content/[^"\'>\s]+)["\'][^>]*>(?P<title>.*?)</a>',
                        re.IGNORECASE | re.DOTALL,
                    )
                    for m in list(link_pattern.finditer(resp.text))[:3]:
                        href = m.group("href")
                        title_clean = html.unescape(re.sub(r"<[^>]+>", "", m.group("title")).strip())
                        if title_clean:
                            matches.append(
                                {
                                    "id": href,
                                    "title": f"ZIM: {title_clean}",
                                    "type": "zim_article",
                                    "url": href,
                                    "snippet": f"Verified Kiwix ZIM article at {href}",
                                    "score": "6",
                                }
                            )
        except Exception:
            pass

    matches.sort(key=lambda x: int(x.get("score", "1")), reverse=True)
    return matches[:4]


# ==============================================================================
# 6. Persistent Saved Chats & AI Completion API
# ==============================================================================
@app.get("/api/chats")
async def api_list_chats() -> Dict[str, Any]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
               (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count
        FROM chats c
        ORDER BY c.updated_at DESC
        """
    )
    chats = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"chats": chats}


class ChatCreateRequest(BaseModel):
    title: str = "New Technical Session"
    model: Optional[str] = None


@app.post("/api/chats")
async def api_create_chat(req: ChatCreateRequest) -> Dict[str, Any]:
    chat_id = f"chat-{uuid.uuid4().hex[:10]}"
    now = int(time.time())
    model = req.model or DEFAULT_MODEL
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO chats (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (chat_id, req.title.strip() or "New Technical Session", model, now, now),
    )
    conn.commit()
    conn.close()
    return {"id": chat_id, "title": req.title, "model": model, "created_at": now, "updated_at": now}


@app.get("/api/chats/{chat_id}")
async def api_get_chat(chat_id: str) -> Dict[str, Any]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM chats WHERE id = ?", (chat_id,))
    chat = cur.fetchone()
    if not chat:
        conn.close()
        raise HTTPException(status_code=404, detail="Chat not found")

    cur.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC", (chat_id,))
    messages = []
    for r in cur.fetchall():
        d = dict(r)
        try:
            d["sources"] = json.loads(d.pop("sources_json", "[]"))
        except Exception:
            d["sources"] = []
        messages.append(d)
    conn.close()
    return {"chat": dict(chat), "messages": messages}


@app.delete("/api/chats/{chat_id}")
async def api_delete_chat(chat_id: str) -> Dict[str, Any]:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
    cur.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": chat_id}


class ChatMessageRequest(BaseModel):
    message: str
    model: Optional[str] = None


@app.post("/api/chats/{chat_id}/message")
async def api_send_message(chat_id: str, req: ChatMessageRequest) -> Dict[str, Any]:
    user_text = req.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Empty message")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM chats WHERE id = ?", (chat_id,))
    chat_row = cur.fetchone()
    if not chat_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Chat not found")

    now = int(time.time())
    user_msg_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO messages (id, chat_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_msg_id, chat_id, "user", user_text, "[]", now),
    )

    chat_title = chat_row["title"]
    if chat_title in ("New Technical Session", "New Chat"):
        chat_title = user_text[:42] + ("..." if len(user_text) > 42 else "")
        cur.execute("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?", (chat_title, now, chat_id))
    else:
        cur.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now, chat_id))

    cur.execute("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 14", (chat_id,))
    history_rows = [dict(r) for r in cur.fetchall()]
    conn.commit()
    conn.close()

    sources = await search_all_archives(user_text)
    archive_context = ""
    if sources:
        ctx_blocks = []
        for s in sources:
            ctx_blocks.append(f"[{s['title']}]:\n{s['snippet']}")
        archive_context = (
            "=== VERIFIED LOCAL ARCHIVE EXCERPTS ===\n"
            + "\n\n".join(ctx_blocks)
            + "\n=== END ARCHIVE EXCERPTS ===\n\n"
        )

    current_settings = load_settings_dict()
    ai_name = str(current_settings.get("ai_name") or "Elena Vancea")
    ai_role = str(current_settings.get("ai_role_title") or "Executive Secretary & Chief Technical Librarian")
    raw_persona = str(current_settings.get("ai_personality") or DEFAULT_SETTINGS["ai_personality"])
    formatted_persona = raw_persona.replace("{ai_name}", ai_name).replace("{ai_role_title}", ai_role)

    ollama_messages = [
        {
            "role": "system",
            "content": formatted_persona,
        }
    ]
    for h in history_rows[:-1]:
        ollama_messages.append({"role": h["role"], "content": h["content"]})

    ollama_messages.append(
        {
            "role": "user",
            "content": f"{archive_context}User Question: {user_text}",
        }
    )

    reply_text = ""
    target_model = req.model or chat_row["model"] or DEFAULT_MODEL

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            tags_resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            available = [m.get("name", "") for m in tags_resp.json().get("models", [])] if tags_resp.status_code == 200 else []
            if target_model not in available:
                if DEFAULT_MODEL in available:
                    target_model = DEFAULT_MODEL
                elif FALLBACK_MODEL in available:
                    target_model = FALLBACK_MODEL
                elif available:
                    target_model = available[0]

            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={"model": target_model, "messages": ollama_messages, "stream": False},
            )
            if resp.status_code == 200:
                reply_text = resp.json().get("message", {}).get("content", "").strip()
    except Exception as exc:
        if sources:
            reply_text = (
                f"**[Local Archive Direct Match — Ollama Offline ({exc})]**\n\n"
                + "\n\n".join(f"### {s['title']}\n{s['snippet']}" for s in sources)
            )
        else:
            reply_text = (
                f"Local Ollama model (`{target_model}`) is still loading or unreachable (`{exc}`). "
                "No direct offline excerpt matched that query yet."
            )

    if not reply_text:
        reply_text = "No response generated. Check the AI Control Panel on the desktop."

    assistant_msg_id = str(uuid.uuid4())
    now_done = int(time.time())
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO messages (id, chat_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (assistant_msg_id, chat_id, "assistant", reply_text, json.dumps(sources), now_done),
    )
    cur.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now_done, chat_id))
    conn.commit()
    conn.close()

    return {
        "chat_id": chat_id,
        "chat_title": chat_title,
        "user_message": {"id": user_msg_id, "role": "user", "content": user_text, "created_at": now},
        "assistant_message": {
            "id": assistant_msg_id,
            "role": "assistant",
            "content": reply_text,
            "sources": sources,
            "created_at": now_done,
        },
    }


# ==============================================================================
# 7. Reverse Proxy to Internal Kiwix-Serve (/kiwix/*)
# ==============================================================================
@app.api_route("/kiwix/{path:path}", methods=["GET", "HEAD"])
async def proxy_kiwix(path: str, request: Request) -> Response:
    if kiwix_proc is None or kiwix_proc.poll() is not None:
        started = restart_kiwix_serve()
        if not started:
            return HTMLResponse(
                content="""
                <html><body style="font-family:Tahoma,sans-serif;background:#ece9d8;padding:24px;color:#111;">
                <h3>No Kiwix .ZIM Archives Downloaded Yet</h3>
                <p>Open the <b>Add or Remove Books</b> window on your Windows XP Desktop and click <b>Install</b> on any ZIM package to populate the Kiwix Reader and your Library Bookshelf.</p>
                </body></html>
                """,
                status_code=200,
            )
        await asyncio.sleep(0.6)

    target_url = f"{KIWIX_BASE_URL}/kiwix/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
            )
            excluded_headers = {"content-encoding", "content-length", "transfer-encoding", "connection"}
            headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded_headers}
            return Response(content=resp.content, status_code=resp.status_code, headers=headers)
    except Exception as exc:
        return HTMLResponse(
            content=f"<html><body style='font-family:Tahoma;padding:20px;'>Kiwix Reader is initializing ({exc}). Refresh in a moment.</body></html>",
            status_code=200,
        )


# ==============================================================================
# 8. Serve Windows XP Desktop Frontend (/, /static/*)
# ==============================================================================
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def serve_desktop() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))
