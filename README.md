# BunkerOS XP — Offline Resilience Knowledge Library & AI Desktop

A containerized, **Windows XP Luna-themed Web Desktop OS** (`http://localhost`) for offline knowledge management, **Kiwix `.zim` archive browsing**, and **local AI chat** (powered by Ollama + SQLite chat persistence).

---

## Quick Start (`bunker-library` CLI)

### 1. Install the CLI Command
```bash
./install.sh
```
This links `bin/bunker-library` into `~/.local/bin/bunker-library`.

### 2. Run `bunker-library` from Anywhere
```bash
bunker-library
```
- **If the containers are not running**: it automatically starts them (`docker compose up -d`), waits until `http://localhost` is ready, and opens `http://localhost` in your browser.
- **If the containers are already running**: it immediately opens `http://localhost` in your browser.

### Additional CLI Subcommands
```bash
bunker-library           # Start (if not running) and open http://localhost
bunker-library status    # Check container and system status
bunker-library stop      # Stop the running containers
bunker-library restart   # Restart containers and open http://localhost
bunker-library build     # Rebuild container image and open http://localhost
bunker-library logs      # Tail container logs
bunker-library uninstall # Stop containers and remove the bunker-library command
```

---

## Project Structure

```text
bunker-library/
├── bin/
│   └── bunker-library   # Main CLI launcher (`bunker-library`)
├── install.sh           # Installs `bunker-library` into ~/.local/bin
├── uninstall.sh         # Stops containers and removes the CLI command
├── docker-compose.yml   # 2-container stack: bunker-xp (Port 80) + bunker-ollama
├── Modelfile            # Elena Vancea LLM Modelfile
├── app/
│   ├── Dockerfile       # Python + FastAPI + kiwix-tools + aria2c
│   ├── main.py          # Backend API, SQLite saved chats, Kiwix manager, Ollama RAG
│   ├── seed_books.py    # Starter volumes and downloadable Kiwix ZIM catalog
│   └── static/
│       ├── index.html   # Windows XP Desktop layout, windows, and bottom AI chat dock
│       ├── xp.css       # Windows XP Luna Blue theme, Bliss wallpaper & 3D bookshelves
│       └── xp.js        # Window manager, dynamic bookshelf renderer & chat client
└── storage/
    ├── app_data/        # SQLite database (saved chats & custom volumes)
    ├── ollama_data/     # Persistent Ollama models
    └── zim_files/       # Downloaded Kiwix .zim files
```
