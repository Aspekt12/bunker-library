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

printf "\033[1;32m[OK]\033[0m Installed command: %s/bunker-library -> %s\n" "${LOCAL_BIN}" "${CLI_SOURCE}"
printf "\033[1;34m[INFO]\033[0m You can now run \033[1mbunker-library\033[0m from anywhere!\n"
