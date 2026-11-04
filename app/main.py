"""
BunkerOS XP - Unified Backend API
Provides:
1. Windows XP Desktop OS static frontend on http://localhost (Port 80)
2. Persistent SQLite database for Saved Chats & Custom Library Volumes
3. Dynamic Library & Bookshelf API (built-in volumes + downloaded Kiwix .zim files)
4. Background ZIM Download Manager (aria2c) with live progress tracking
5. Internal kiwix-serve daemon manager & /kiwix/* reverse proxy
6. Grounded Local AI Chat (Ollama + Archive RAG with clickable desktop citations)
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
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from seed_books import DOWNLOAD_CATALOG, STARTER_VOLUMES

ZIM_DIR = Path(os.environ.get("ZIM_DIR", "/data/zim_files"))
APP_DATA_DIR = Path(os.environ.get("APP_DATA_DIR", "/data/app_data"))
DB_PATH = APP_DATA_DIR / "bunker_xp.db"
STATIC_DIR = Path(__file__).resolve().parent / "static"

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "elena-vancea:latest")
FALLBACK_MODEL = os.environ.get("FALLBACK_MODEL", "qwen2.5:7b-instruct-q4_K_M")
KIWIX_INTERNAL_PORT = 8081
KIWIX_BASE_URL = f"http://127.0.0.1:{KIWIX_INTERNAL_PORT}"

ZIM_DIR.mkdir(parents=True, exist_ok=True)
APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

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
                "id": "vol-linux-syscalls",
                "title": "Linux Syscall Reference (x64 / x86 / ARM64)",
                "type": "volume",
                "snippet": "Calling conventions and syscall numbers for x86_64, i386, arm64, riscv64.",
            },
            {
                "id": "vol-felix-x86",
                "title": "Felix Cloutier x86 & AMD64 Instruction Manual",
                "type": "volume",
                "snippet": "General-purpose registers, MOV/LEA/SYSCALL instructions, Control Registers CR0-CR4.",
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
                    "- **Biblioteca Dinamică**: Pe măsură ce descărcați noi arhive `.zim` din fereastra **Add/Remove Books**, rafturile bibliotecii și folderele de pe desktop se umplu automat cu volume noi.\n"
                    "- **Conversații Salvate**: Orice discuție purtată în această bară de jos este salvată automat în baza de date locală.\n\n"
                    "Cu ce informație tehnică, apel de sistem Linux, instrucțiune x86 sau document din arhivă vă pot ajuta astăzi?"
                ),
                json.dumps(welcome_sources),
                now,
            ),
        )
        conn.commit()
    conn.close()


# ==============================================================================
# 2. Internal Kiwix-Serve Process Manager
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
                        modelfile_path = Path("/app/../Modelfile")
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
    asyncio.create_task(ensure_ollama_persona())


# ==============================================================================
# 3. Library & Bookshelf Inventory Helpers
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


def get_all_library_items() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []

    # 1. Starter built-in volumes
    for vol in STARTER_VOLUMES:
        items.append(
            {
                "id": vol["id"],
                "title": vol["title"],
                "category": vol["category"],
                "type": "volume",
                "spine_color": vol["spine_color"],
                "icon": vol["icon"],
                "size_label": vol["size_label"],
                "author": vol["author"],
                "summary": vol["summary"],
            }
        )

    # 2. User-created custom volumes from SQLite
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM custom_volumes ORDER BY created_at ASC")
    for row in cur.fetchall():
        items.append(
            {
                "id": row["id"],
                "title": row["title"],
                "category": row["category"],
                "type": "volume",
                "spine_color": row["spine_color"],
                "icon": row["icon"],
                "size_label": "Custom Note",
                "author": row["author"],
                "summary": row["summary"],
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
        # Strip trailing _YYYY-MM for kiwix content ID matching
        book_slug = re.sub(r"_[0-9]{4}-[0-9]{2}$", "", stem)
        pretty_title = stem.replace("_", " ").replace(".", " ").title()
        category = "Kiwix ZIM Archives"
        lower_name = stem.lower()
        if "wikipedia" in lower_name:
            category = "Encyclopedias (Wikipedia)"
        elif any(k in lower_name for k in ("devdocs", "stack", "unix", "osdev", "c_", "linux", "python")):
            category = "DevDocs & Engineering"
        elif any(k in lower_name for k in ("med", "ifixit", "osm")):
            category = "Survival & Medical"

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
                "icon": "💿",
                "size_label": format_bytes(stat.st_size),
                "author": "Kiwix Offline ZIM",
                "summary": f"Offline ZIM Archive ({zpath.name}, {format_bytes(stat.st_size)}). Click to browse in Kiwix Reader.",
                "reader_url": f"/kiwix/",
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
    "ai_avatar": "👩‍💼",
    "ai_role_title": "Executive Secretary & Chief Technical Librarian",
    "ai_personality": (
        "You are {ai_name}, {ai_role_title} inside BunkerOS XP (an autonomous offline knowledge desktop). "
        "Answer clearly, concisely, and accurately in the language used by the user (Romanian or English). "
        "Always prioritize verified facts from the local archive excerpts when provided and cite the archive volume title."
    ),
    "bookshelf_layout": "spines-3d",   # spines-3d | covers-grid | xp-tiles | xp-details
    "shelf_density": "normal",         # compact | normal | large
    "chat_layout": "fb-side",          # fb-side (Old Facebook bottom-right popup) | bottom-bar (Wide docked bar)
    "font_size_px": 12,                # 11 to 18
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
    for vol in STARTER_VOLUMES:
        if vol["id"] == vol_id:
            return vol

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM custom_volumes WHERE id = ?", (vol_id,))
    row = cur.fetchone()
    conn.close()
    if row:
        return dict(row)

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
            "📓",
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
    catalog_out = []
    for entry in DOWNLOAD_CATALOG:
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
# 5. Archive Search & Grounding (Built-in Volumes + Kiwix ZIMs)
# ==============================================================================
async def search_all_archives(query: str) -> List[Dict[str, str]]:
    if not query.strip():
        return []

    tokens = [t.lower() for t in re.findall(r"[a-zA-Z0-9_]{2,}", query) if len(t) >= 2]
    if not tokens:
        tokens = [query.strip().lower()]

    matches: List[Dict[str, str]] = []

    # 1. Search built-in and custom volumes
    all_vols = list(STARTER_VOLUMES)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM custom_volumes")
    for r in cur.fetchall():
        all_vols.append(dict(r))
    conn.close()

    for vol in all_vols:
        haystack = f"{vol['title']} {vol.get('summary', '')} {vol['content']}".lower()
        score = sum(3 if tok in vol["title"].lower() else (1 if tok in haystack else 0) for tok in tokens)
        if score > 0:
            # Extract best matching paragraph
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

    # 2. Search live Kiwix ZIM server if running
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
                                    "score": "5",
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

    # Auto-title the chat if it is still named "New Technical Session"
    chat_title = chat_row["title"]
    if chat_title in ("New Technical Session", "New Chat"):
        chat_title = user_text[:42] + ("..." if len(user_text) > 42 else "")
        cur.execute("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?", (chat_title, now, chat_id))
    else:
        cur.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now, chat_id))

    # Fetch recent conversation history
    cur.execute("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 14", (chat_id,))
    history_rows = [dict(r) for r in cur.fetchall()]
    conn.commit()
    conn.close()

    # Search local archives for grounding
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
            # Verify available model name in Ollama
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
                f"⚠️ Local Ollama model (`{target_model}`) is still loading or unreachable (`{exc}`). "
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
                <p>Open the <b>Add / Remove Books (ZIM Downloader)</b> window on your Windows XP Desktop and click <b>Download</b> on any ZIM package to populate the Kiwix Reader and your Library Bookshelf!</p>
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
