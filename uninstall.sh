#!/usr/bin/env bash
# ==============================================================================
# BunkerOS XP — Uninstaller
# Stops containers and removes the `bunker-library` CLI command from the system
# ==============================================================================
set -euo pipefail

REAL_SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
PROJECT_ROOT="$(cd "$(dirname "${REAL_SCRIPT}")" && pwd)"

exec "${PROJECT_ROOT}/bin/bunker-library" uninstall "$@"
