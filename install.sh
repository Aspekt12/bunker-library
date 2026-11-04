#!/usr/bin/env bash
# ==============================================================================
# BunkerOS XP — CLI Installer
# Installs the `bunker-library` command into ~/.local/bin/bunker-library
# ==============================================================================
set -euo pipefail

REAL_SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
PROJECT_ROOT="$(cd "$(dirname "${REAL_SCRIPT}")" && pwd)"
CLI_SOURCE="${PROJECT_ROOT}/bin/bunker-library"
LOCAL_BIN="${HOME}/.local/bin"

chmod +x "${CLI_SOURCE}"
mkdir -p "${LOCAL_BIN}"
ln -sf "${CLI_SOURCE}" "${LOCAL_BIN}/bunker-library"

APPS_DIR="${HOME}/.local/share/applications"
mkdir -p "${APPS_DIR}"
cat > "${APPS_DIR}/bunker-library.desktop" <<EOF
[Desktop Entry]
Name=BunkerOS XP & Microsoft Bob
Comment=Offline Knowledge Library, Microsoft Bob (1995) & Debian VS Code Workspace
Exec=${LOCAL_BIN}/bunker-library
Terminal=false
Type=Application
Categories=Development;Education;Utility;
EOF

printf "\033[1;32m[OK]\033[0m Installed command: %s/bunker-library -> %s\n" "${LOCAL_BIN}" "${CLI_SOURCE}"
printf "\033[1;32m[OK]\033[0m Installed desktop app: %s/bunker-library.desktop\n" "${APPS_DIR}"
printf "\033[1;34m[INFO]\033[0m Run \033[1mbunker-library\033[0m (XP), \033[1mbunker-library bob\033[0m (MS Bob), or \033[1mbunker-library code\033[0m (VS Code)!\n"
