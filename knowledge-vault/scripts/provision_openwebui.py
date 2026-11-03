#!/usr/bin/env python3
"""
OFFLINE RESILIENCE KNOWLEDGE VAULT
Zero-Touch Auto-Provisioner for Open WebUI:
1. Waits for Open WebUI and its SQLite database (storage/openwebui_data/webui.db) to initialize.
2. Automatically creates the local Administrator account on first boot (since ENABLE_SIGNUP=false).
3. Registers the anti-hallucination tool `kiwix_tool` (tools/kiwix_tool.py) directly into the database and/or API.
4. Configures the `elena-vancea:latest` model profile in Open WebUI with `kiwix_tool` attached and enabled by default.
"""

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

VAULT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = VAULT_ROOT / "storage" / "openwebui_data" / "webui.db"
TOOL_PATH = VAULT_ROOT / "tools" / "kiwix_tool.py"
CREDENTIALS_FILE = VAULT_ROOT / "storage" / "openwebui_data" / "ADMIN_CREDENTIALS.txt"

OPENWEBUI_URL = os.environ.get("OPENWEBUI_URL", "http://127.0.0.1:80")
ADMIN_EMAIL = os.environ.get("VAULT_ADMIN_EMAIL", "elena.vancea@biblioteca.local")
ADMIN_PASSWORD = os.environ.get("VAULT_ADMIN_PASSWORD", "BibliotecaOffline2026!")
ADMIN_NAME = "Secretariatul Tehnic (Elena Vancea)"

TOOL_ID = "kiwix_offline_archive"
MODEL_ID = "elena-vancea:latest"


def log_info(msg: str) -> None:
    print(f"\033[1;34m[WEBUI-PROVISION]\033[0m {msg}")


def log_ok(msg: str) -> None:
    print(f"\033[1;32m[WEBUI-OK]\033[0m        {msg}")


def log_warn(msg: str) -> None:
    print(f"\033[1;33m[WEBUI-WARN]\033[0m      {msg}")


def wait_for_webui_http(timeout_sec: int = 90) -> bool:
    log_info(f"Waiting for Open WebUI HTTP endpoint at {OPENWEBUI_URL}...")
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f"{OPENWEBUI_URL}/api/config", headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                if resp.status == 200:
                    log_ok("Open WebUI is responding over HTTP.")
                    return True
        except Exception:
            pass
        time.sleep(2)
    return False


def api_post(path: str, payload: dict, token: str = "") -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{OPENWEBUI_URL}{path}", data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def obtain_or_create_admin_token() -> tuple[str, str]:
    # 1. Try signing in with existing admin credentials
    try:
        res = api_post("/api/v1/auths/signin", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if "token" in res:
            return res["token"], res.get("id", "")
    except Exception:
        pass

    # 2. On a fresh Open WebUI database, the first call to /api/v1/auths/signup creates the primary Admin account
    # even when ENABLE_SIGNUP=false (standard Open WebUI bootstrap behavior when the user table is empty).
    try:
        res = api_post(
            "/api/v1/auths/signup",
            {
                "name": ADMIN_NAME.strip(),
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
                "profile_image_url": "/user.png",
            },
        )
        if "token" in res:
            CREDENTIALS_FILE.write_text(
                f"Access URL:     http://10.3.141.1/ (or http://localhost/)\n"
                f"Admin Email:    {ADMIN_EMAIL}\n"
                f"Admin Password: {ADMIN_PASSWORD}\n",
                encoding="utf-8",
            )
            log_ok(f"Administrator account created automatically ({ADMIN_EMAIL}).")
            return res["token"], res.get("id", "")
    except Exception as exc:
        log_warn(f"Signup API did not return a token ({exc}); falling back to direct SQLite injection.")

    return "", ""


def provision_via_sqlite(tool_code: str) -> bool:
    if not DB_PATH.exists():
        log_warn(f"SQLite database {DB_PATH} does not exist yet.")
        return False

    now_ts = int(time.time())
    tool_specs = [
        {
            "name": "search_archive",
            "description": (
                "Searches the local Kiwix ZIM archive repository (Wikipedia, syscall.sh, Felix Cloutier x86, OSDev, DevDocs). "
                "Returns verified documentary excerpts or STATUS_DOCUMENT_INEXISTENT."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Technical term, assembly mnemonic, system call, or scientific concept to search for.",
                    }
                },
                "required": ["query"],
            },
        }
    ]
    tool_meta = {
        "description": "Queries the local Kiwix ZIM archive repository with a code-level anti-hallucination refusal gate.",
        "manifest": {
            "title": "Kiwix Local Archive Search (Anti-Hallucination Gate)",
            "author": "Offline Resilience Knowledge Vault",
            "version": "1.0.0",
        },
    }

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()

        # Fetch the primary user ID (or fall back to 'system-admin')
        user_id = "system-admin"
        try:
            cur.execute("SELECT id FROM user ORDER BY created_at ASC LIMIT 1")
            row = cur.fetchone()
            if row and row[0]:
                user_id = row[0]
        except Exception:
            pass

        # 1. Upsert into the `tool` table
        cur.execute("SELECT id FROM tool WHERE id = ?", (TOOL_ID,))
        if cur.fetchone():
            cur.execute(
                "UPDATE tool SET content = ?, specs = ?, meta = ?, updated_at = ? WHERE id = ?",
                (tool_code, json.dumps(tool_specs), json.dumps(tool_meta), now_ts, TOOL_ID),
            )
        else:
            cur.execute(
                "INSERT INTO tool (id, user_id, name, content, specs, meta, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    TOOL_ID,
                    user_id,
                    "Kiwix Local Archive Search",
                    tool_code,
                    json.dumps(tool_specs),
                    json.dumps(tool_meta),
                    now_ts,
                    now_ts,
                ),
            )

        # 2. Automatically bind `kiwix_offline_archive` to the `elena-vancea:latest` model in the `model` table
        model_meta = {
            "profile_image_url": "/static/favicon.png",
            "description": "Executive Secretary and Head of Documentary Holdings (Autonomous Local Digital Library)",
            "toolIds": [TOOL_ID],
            "capabilities": {"vision": False, "citations": True},
        }
        model_params = {
            "temperature": 0.2,
            "top_p": 0.8,
            "num_ctx": 8192,
        }

        cur.execute("SELECT id FROM model WHERE id = ?", (MODEL_ID,))
        if cur.fetchone():
            cur.execute(
                "UPDATE model SET name = ?, meta = ?, params = ?, updated_at = ? WHERE id = ?",
                ("Elena Vancea — Secretariat Tehnic", json.dumps(model_meta), json.dumps(model_params), now_ts, MODEL_ID),
            )
        else:
            cur.execute("PRAGMA table_info(model)")
            cols = {r[1] for r in cur.fetchall()}
            if {"id", "user_id", "base_model_id", "name", "meta", "params", "created_at", "updated_at"}.issubset(cols):
                if "is_active" in cols:
                    cur.execute(
                        "INSERT INTO model (id, user_id, base_model_id, name, meta, params, created_at, updated_at, is_active) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
                        (
                            MODEL_ID,
                            user_id,
                            MODEL_ID,
                            "Elena Vancea — Secretariat Tehnic",
                            json.dumps(model_meta),
                            json.dumps(model_params),
                            now_ts,
                            now_ts,
                        ),
                    )
                else:
                    cur.execute(
                        "INSERT INTO model (id, user_id, base_model_id, name, meta, params, created_at, updated_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            MODEL_ID,
                            user_id,
                            MODEL_ID,
                            "Elena Vancea — Secretariat Tehnic",
                            json.dumps(model_meta),
                            json.dumps(model_params),
                            now_ts,
                            now_ts,
                        ),
                    )

        conn.commit()
        conn.close()
        log_ok(f"Tool '{TOOL_ID}' and model profile '{MODEL_ID}' provisioned directly in Open WebUI SQLite DB!")
        return True
    except Exception as exc:
        log_warn(f"SQLite provisioning warning: {exc}")
        return False


def main() -> int:
    if not TOOL_PATH.exists():
        log_warn(f"Tool file {TOOL_PATH} not found.")
        return 1

    tool_code = TOOL_PATH.read_text(encoding="utf-8")
    wait_for_webui_http(timeout_sec=90)
    token, _ = obtain_or_create_admin_token()

    if token:
        try:
            api_post(
                "/api/v1/tools/create",
                {
                    "id": TOOL_ID,
                    "name": "Kiwix Local Archive Search",
                    "content": tool_code,
                    "meta": {
                        "description": "Queries the local Kiwix ZIM archive repository with a code-level anti-hallucination refusal gate."
                    },
                },
                token=token,
            )
            log_ok("Kiwix tool registered via Open WebUI REST API.")
        except Exception:
            pass

    provision_via_sqlite(tool_code)
    return 0


if __name__ == "__main__":
    sys.exit(main())
