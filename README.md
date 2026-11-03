# BunkerOS XP — Offline Resilience Knowledge Library & AI Desktop

A containerized, **Windows XP Luna-themed Web Desktop OS** (`http://localhost`) for offline knowledge management, **Kiwix `.zim` archive browsing**, and **local AI chat** (powered by Ollama + SQLite chat persistence).

---

## Features

- **Windows XP Desktop Interface (`http://localhost`)**:
  - Authentic **Luna Blue** draggable, minimizable, and maximizable windows, **Bliss Hills** wallpaper (plus switchable **Library Mahogany** and **Bunker Dark** themes in the Start Menu), and a live **XP Taskbar & System Tray**.
- **Dynamic Library Bookshelf & Desktop Folders**:
  - Comes pre-stocked with 4 core engineering & resilience volumes (**Linux Syscalls x64/x86/ARM64**, **Felix Cloutier x86 Manual**, **OSDev Bare-Metal Kernel Guide**, and **Field Medicine & Off-Grid Power**).
  - **Fills Up as You Download More**: Every `.zim` archive you download from the **Add/Remove Books (ZIM Downloader)** window (or custom manual you write) automatically adds a colored **3D book spine** to the wooden shelves in **My Library** AND creates folder/archive shortcuts directly on your **Windows XP Desktop**.
- **Docked Bottom AI Chat ("Elena Vancea") with SQLite History**:
  - Docked right above the XP Taskbar at the bottom of the screen.
  - **Every chat is automatically saved** in `storage/app_data/bunker_xp.db`.
  - Automatically searches your local books and Kiwix `.zim` archives first, attaching clickable **Source Citation Badges** that open the exact book or ZIM article in the XP Reader window.
- **Zero Host Setup — Just Docker**:
  - Everything runs inside 2 containers (`bunker-xp` + `bunker-ollama`).
  - `./app` is bind-mounted into `bunker-xp` with `uvicorn --reload`, so any edit you make to `app/static/index.html`, `app/static/xp.css`, `app/static/xp.js`, or `app/main.py` reloads immediately on `http://localhost`!

---

## Quick Start

### 1. Start the Containers
```bash
docker compose up -d --build
```

### 2. Open in Your Browser
Navigate to:
- **`http://localhost`**

### 3. Live Development
Edit any file in `app/`:
- `app/static/index.html` — Desktop layout, windows, Start Menu, and Bottom AI Chat Dock
- `app/static/xp.css` — Windows XP Luna Blue styling, wallpapers, and 3D wooden bookshelves
- `app/static/xp.js` — Window manager, bookshelf renderer, ZIM downloader, and chat client
- `app/main.py` — FastAPI backend, SQLite database, `kiwix-serve` manager, and Ollama RAG
- `app/seed_books.py` — Built-in starter volumes and downloadable Kiwix ZIM catalog
